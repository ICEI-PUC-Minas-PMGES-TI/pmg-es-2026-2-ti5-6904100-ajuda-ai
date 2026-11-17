import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_content.dart';
import 'campus_map_icons.dart';

/// Eventos e restaurantes no mapa: uma source GeoJSON compartilhada (com a
/// propriedade `kind`), pinos do PUCMaps acima do 3D (também alvo do toque) e
/// o nome só de perto. Os pinos são gerados pelo app ([CampusMapIcons]), não
/// dependem do sprite do style; ícone e cor diferenciam os tipos.
abstract final class CampusContentLayer {
  static const source = 'campus-map-content';
  static const dot = 'campus-map-content-dot';
  static const label = 'campus-map-content-label';

  /// Camadas que identificam um item no toque.
  static const pickable = [dot];

  /// Pontos junto com os PucStops; nome só bem de perto (evita poluir a
  /// visão geral com os rótulos dos prédios).
  static const dotMinZoom = 15.0;
  static const labelMinZoom = 17.0;

  static const event = 'event';
  static const restaurant = 'restaurant';

  static const eventColor = '#7C3AED';
  static const restaurantColor = '#EA580C';

  static String kindOf(CampusContent item) => switch (item) {
    CampusEvent() => event,
    CampusRestaurant() => restaurant,
  };

  /// Só itens com posição; sem dados do usuário.
  static Map<String, dynamic> geoJson(
    List<CampusEvent> events,
    List<CampusRestaurant> restaurants,
  ) => {
    'type': 'FeatureCollection',
    'features': [
      for (final CampusContent item in [...events, ...restaurants])
        if (item.location?.center case final center?)
          {
            'type': 'Feature',
            'id': '${kindOf(item)}-${item.id}',
            'geometry': {'type': 'Point', 'coordinates': center},
            'properties': {
              'id': item.id,
              'kind': kindOf(item),
              'name': item.title,
              // Destaque: evento acontecendo / restaurante aberto.
              'active': switch (item) {
                CampusEvent(:final status) =>
                  status == CampusEventStatus.ongoing,
                CampusRestaurant(:final openNow) => openNow,
              },
            },
          },
    ],
  };

  static List<Object> _isKind(String kind) => [
    '==',
    ['get', 'kind'],
    kind,
  ];

  // Comparação explícita: `case` exige booleano, não um valor qualquer.
  static const List<Object> _isActive = [
    '==',
    ['get', 'active'],
    true,
  ];

  static List<Map<String, dynamic>> get layers => [
    {
      'id': dot,
      'type': 'symbol',
      'source': source,
      // `top`, elevado sobre o 3D: o ponto de evento/restaurante costuma ser
      // o centro de um prédio, e no `middle` o modelo 3D o cobria de perto.
      'slot': 'top',
      'minzoom': dotMinZoom,
      'layout': CampusMapIcons.layout(
        image: [
          'case',
          _isKind(event),
          CampusMapIcons.event.id,
          CampusMapIcons.food.id,
        ],
      ),
      'paint': {
        ...CampusMapIcons.paint,
        // Inativo (em breve / fechado) mais claro; o card explica em texto.
        'icon-opacity': ['case', _isActive, 1.0, 0.7],
      },
    },
    {
      'id': label,
      'type': 'symbol',
      'source': source,
      'slot': 'top',
      'minzoom': labelMinZoom,
      'layout': {
        'text-field': ['get', 'name'],
        'text-size': 11,
        // Abaixo do pino (raio ~14 px no zoom do rótulo).
        'text-offset': [0, 1.6],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
        'symbol-z-elevate': true,
      },
      'paint': {
        'text-color': ['case', _isKind(event), '#5B21B6', '#9A3412'],
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.5,
        'text-emissive-strength': 1.0,
      },
    },
  ];

  /// Cria a source e as camadas, ou só troca os dados se já existirem.
  static Future<void> show(
    StyleManager style,
    List<CampusEvent> events,
    List<CampusRestaurant> restaurants, {
    required bool Function() isActive,
  }) async {
    await CampusMapIcons.install(style, const [
      CampusMapIcons.event,
      CampusMapIcons.food,
    ], isActive: isActive);
    if (!isActive()) return;
    final data = geoJson(events, restaurants);
    if (await style.styleSourceExists(source)) {
      if (!isActive()) return;
      await style.setStyleSourceProperty(source, 'data', jsonEncode(data));
    } else {
      if (!isActive()) return;
      await style.addStyleSource(
        source,
        jsonEncode({'type': 'geojson', 'data': data}),
      );
    }
    for (final layer in layers) {
      if (!isActive()) return;
      if (await style.styleLayerExists(layer['id'] as String)) continue;
      await style.addStyleLayer(jsonEncode(layer), null);
    }
  }
}
