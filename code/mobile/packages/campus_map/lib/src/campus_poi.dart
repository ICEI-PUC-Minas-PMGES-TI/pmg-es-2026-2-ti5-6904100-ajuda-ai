import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_map_icons.dart';
import 'campus_place.dart';

/// Pontos que o PUCMaps mostra sempre, sem filtro: portarias e alimentação.
enum CampusPoiKind {
  gate,
  food;

  /// Tipo de origem do prédio (`categoria` da API). Só `CAFETERIA` e
  /// `RESTAURANT` contam como alimentação: o PUCMaps também marcava
  /// `SERVICE` como restaurante, mas no campus esse tipo é posto médico,
  /// clínica e capela; aqui eles não ganham talheres.
  static CampusPoiKind? fromType(String? type) =>
      switch (type?.trim().toUpperCase()) {
        'GATE' => gate,
        'CAFETERIA' || 'RESTAURANT' => food,
        _ => null,
      };

  CampusMarkerIcon get icon => switch (this) {
    gate => CampusMapIcons.gate,
    food => CampusMapIcons.food,
  };

  String get label => switch (this) {
    gate => 'Portaria',
    food => 'Alimentação',
  };
}

/// Fonte dos pontos permanentes (ex.: `GET /mapa/predios` do app). O snapshot
/// local do pacote só tem as pegadas dos prédios, sem portarias.
abstract interface class CampusPointOfInterestCatalog {
  /// Locais com [CampusPoiKind]; os demais são ignorados pelo mapa.
  Future<List<CampusPlace>> pointsOfInterest();
}

/// Portarias e alimentação: uma source e uma SymbolLayer com os pinos do
/// PUCMaps. A view decide quais pontos entram (filtro de categoria).
abstract final class CampusPoiLayer {
  static const source = 'campus-map-poi';
  static const symbols = 'campus-map-poi-symbols';

  static Map<String, dynamic> geoJson(Iterable<CampusPlace> places) => {
    'type': 'FeatureCollection',
    'features': [
      for (final place in places)
        if (CampusPoiKind.fromType(place.type) case final kind?)
          {
            'type': 'Feature',
            'id': place.id,
            'geometry': {'type': 'Point', 'coordinates': place.center},
            'properties': {
              'id': place.id,
              'kind': kind.name,
              'icon': kind.icon.id,
              'name': place.displayName,
            },
          },
    ],
  };

  static Map<String, dynamic> get layer => {
    'id': symbols,
    'type': 'symbol',
    'source': source,
    'slot': 'top',
    'layout': CampusMapIcons.layout(),
    'paint': CampusMapIcons.paint,
  };

  /// Cria a source e a camada, ou só troca os dados se já existirem.
  static Future<void> show(
    StyleManager style,
    Iterable<CampusPlace> places, {
    required bool Function() isActive,
  }) async {
    await CampusMapIcons.install(style, [
      for (final kind in CampusPoiKind.values) kind.icon,
    ], isActive: isActive);
    if (!isActive()) return;
    final data = geoJson(places);
    final exists = await style.styleSourceExists(source);
    if (!isActive()) return;
    if (exists) {
      await style.setStyleSourceProperty(source, 'data', jsonEncode(data));
    } else {
      await style.addStyleSource(
        source,
        jsonEncode({'type': 'geojson', 'data': data}),
      );
    }
    if (!isActive()) return;
    if (!await style.styleLayerExists(symbols)) {
      if (!isActive()) return;
      await style.addStyleLayer(jsonEncode(layer), null);
    }
  }
}
