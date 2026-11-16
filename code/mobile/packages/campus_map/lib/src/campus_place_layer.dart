import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_map_icons.dart';
import 'campus_place_category.dart';
import 'campus_place_filter.dart';

/// Uma source e uma SymbolLayer para todos os prédios pedidos pelo usuário.
/// Pinos do PUCMaps ([CampusMapIcons]) renderizados uma vez por style, sem
/// widgets por local.
abstract final class CampusPlaceLayer {
  static const source = 'campus-map-category-places';
  static const symbols = 'campus-map-category-symbols';

  static String iconId(CampusPlaceCategory category) =>
      CampusMapIcons.category(category).id;

  static Map<String, dynamic> geoJson(CampusPlaceFilter filter) => {
    'type': 'FeatureCollection',
    'features': [
      if (filter.category case final category?)
        for (final place in filter.places)
          {
            'type': 'Feature',
            'id': place.id,
            'geometry': {'type': 'Point', 'coordinates': place.center},
            'properties': {
              'id': place.id,
              'icon': iconId(category),
              'name': place.displayName,
            },
          },
    ],
  };

  /// Mesmo layout da camada `campus-symbol` do PUCMaps.
  static Map<String, dynamic> get layer => {
    'id': symbols,
    'type': 'symbol',
    'source': source,
    'slot': 'top',
    'layout': CampusMapIcons.layout(),
    'paint': CampusMapIcons.paint,
  };

  /// Chamadas serializadas pela view; cada await revalida o style e a seleção.
  static Future<void> show(
    StyleManager style,
    CampusPlaceFilter filter, {
    required bool Function() isActive,
  }) async {
    if (!isActive()) return;
    await CampusMapIcons.install(style, [
      for (final category in CampusPlaceCategory.values)
        CampusMapIcons.category(category),
    ], isActive: isActive);
    if (!isActive()) return;
    final exists = await style.styleSourceExists(source);
    if (!isActive()) return;
    final data = geoJson(filter);
    if (exists) {
      await style.setStyleSourceProperty(source, 'data', jsonEncode(data));
    } else {
      await style.addStyleSource(
        source,
        jsonEncode({'type': 'geojson', 'data': data}),
      );
    }
    if (!isActive()) return;
    final installed = await style.styleLayerExists(symbols);
    if (!isActive()) return;
    if (!installed) await style.addStyleLayer(jsonEncode(layer), null);
  }
}
