import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_route.dart';

/// Linha da rota: uma source GeoJSON e duas camadas (contorno + linha).
abstract final class CampusRouteLayer {
  static const source = 'campus-map-route';
  static const casing = 'campus-map-route-casing';
  static const line = 'campus-map-route-line';

  static Map<String, dynamic> feature(CampusRoute route) => {
    'type': 'Feature',
    'properties': <String, dynamic>{},
    'geometry': {'type': 'LineString', 'coordinates': route.coordinates},
  };

  static List<Map<String, dynamic>> get layers {
    Object width(double base) => [
      'interpolate',
      ['exponential', 1.5],
      ['zoom'],
      15,
      base,
      19,
      base * 2.4,
    ];
    const layout = {'line-cap': 'round', 'line-join': 'round'};
    return [
      {
        'id': casing,
        'type': 'line',
        'source': source,
        // Mesmo slot das pegadas: acima do chão, abaixo dos rótulos.
        'slot': 'middle',
        'layout': layout,
        'paint': {
          'line-color': '#FFFFFF',
          'line-width': width(7),
          'line-emissive-strength': 1.0,
          // Atrás de um prédio 3D a rota continua legível, mais fraca.
          'line-occlusion-opacity': 0.35,
        },
      },
      {
        'id': line,
        'type': 'line',
        'source': source,
        'slot': 'middle',
        'layout': layout,
        'paint': {
          'line-color': '#1565C0',
          'line-width': width(4),
          'line-emissive-strength': 1.0,
          'line-occlusion-opacity': 0.5,
        },
      },
    ];
  }

  /// Troca a linha inteira (remove a anterior): sem estado entre rotas.
  static Future<void> show(
    StyleManager style,
    CampusRoute route, {
    required bool Function() isActive,
  }) async {
    await clear(style);
    if (!isActive()) return;
    await style.addStyleSource(
      source,
      jsonEncode({'type': 'geojson', 'data': feature(route)}),
    );
    for (final layer in layers) {
      if (!isActive()) return;
      await style.addStyleLayer(jsonEncode(layer), null);
    }
  }

  static Future<void> clear(StyleManager style) async {
    for (final id in [line, casing]) {
      if (await style.styleLayerExists(id)) await style.removeStyleLayer(id);
    }
    if (await style.styleSourceExists(source)) {
      await style.removeStyleSource(source);
    }
  }
}
