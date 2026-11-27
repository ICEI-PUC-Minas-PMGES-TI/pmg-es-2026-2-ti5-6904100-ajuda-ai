import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_map_icons.dart';
import 'campus_place.dart';

/// Locais salvos no mapa: uma source e uma SymbolLayer com o pino laranja de
/// marcador. Ficam visíveis sem filtro e com o chip "Salvos" (que esconde o
/// resto); a view decide quais entram.
abstract final class CampusSavedLayer {
  static const source = 'campus-map-saved';
  static const symbols = 'campus-map-saved-symbols';

  static Map<String, dynamic> geoJson(Iterable<CampusPlace> places) => {
    'type': 'FeatureCollection',
    'features': [
      for (final place in places)
        {
          'type': 'Feature',
          'id': place.id,
          'geometry': {'type': 'Point', 'coordinates': place.center},
          'properties': {'id': place.id, 'name': place.displayName},
        },
    ],
  };

  /// Mesmo layout dos demais pinos, um pouco acima deles na ordem de desenho
  /// (camada adicionada depois): o salvo não some sob a portaria ou cantina.
  static Map<String, dynamic> get layer => {
    'id': symbols,
    'type': 'symbol',
    'source': source,
    'slot': 'top',
    'layout': CampusMapIcons.layout(image: CampusMapIcons.saved.id),
    'paint': CampusMapIcons.paint,
  };

  static Future<void> show(
    StyleManager style,
    Iterable<CampusPlace> places, {
    required bool Function() isActive,
  }) async {
    await CampusMapIcons.install(style, const [
      CampusMapIcons.saved,
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
