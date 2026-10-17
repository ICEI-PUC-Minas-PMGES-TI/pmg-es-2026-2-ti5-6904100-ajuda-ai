import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_map_layer_ids.dart';
import 'campus_snapshot.dart';

/// Parte 2D adaptada de MapRenderer do PUCMaps. Nenhum recurso de volume.
class CampusMapRenderer {
  CampusMapRenderer(this.style);

  final StyleManager style;
  Future<void>? _rendering;

  /// Chamadas concorrentes compartilham a instalação; IDs existentes não duplicam.
  Future<void> render(
    CampusSnapshot snapshot, {
    required bool Function() isActive,
  }) {
    return _rendering ??= _install(snapshot, isActive).whenComplete(() {
      _rendering = null;
    });
  }

  Future<void> _install(
    CampusSnapshot snapshot,
    bool Function() isActive,
  ) async {
    final sources = {
      CampusMapLayerIds.footprintsSource: snapshot.toGeoJson(),
      CampusMapLayerIds.labelsSource: labelCollection(snapshot),
    };
    for (final entry in sources.entries) {
      if (!isActive()) return;
      final exists = await style.styleSourceExists(entry.key);
      if (!isActive()) return;
      if (!exists) {
        await style.addStyleSource(
          entry.key,
          jsonEncode({'type': 'geojson', 'data': entry.value}),
        );
      }
    }
    for (final layer in layers) {
      if (!isActive()) return;
      final exists = await style.styleLayerExists(layer['id'] as String);
      if (!isActive()) return;
      if (!exists) await style.addStyleLayer(jsonEncode(layer), null);
    }
  }

  /// Cores constantes; o zoom só regula a entrada dos rótulos.
  static List<Map<String, dynamic>> get layers => [
    {
      'id': CampusMapLayerIds.fill,
      'type': 'fill',
      'source': CampusMapLayerIds.footprintsSource,
      'slot': 'middle',
      'paint': {
        'fill-color': [
          'match',
          ['get', 'type'],
          'PARK',
          '#bccfbb',
          'PARKING_LOT',
          '#ced1d4',
          'CONSTRUCTION',
          '#d5cbb9',
          '#c5c0d1',
        ],
        'fill-opacity': 0.65,
      },
    },
    {
      'id': CampusMapLayerIds.outline,
      'type': 'line',
      'source': CampusMapLayerIds.footprintsSource,
      'slot': 'middle',
      'layout': {'line-join': 'round'},
      'paint': {
        'line-color': '#716b7e',
        'line-width': 1.0,
        'line-opacity': 0.85,
      },
    },
    {
      'id': CampusMapLayerIds.basemapLabelClip,
      'type': 'clip',
      'source': CampusMapLayerIds.footprintsSource,
      'slot': 'top',
      // Só símbolos do basemap dentro das pegadas reais. Não recorta o campus
      // inteiro, ruas, modelos ou rótulos adicionados pelo próprio pacote.
      'layout': {
        'clip-layer-types': ['symbol'],
        'clip-layer-scope': ['basemap'],
      },
    },
    {
      'id': CampusMapLayerIds.labels,
      'type': 'symbol',
      'source': CampusMapLayerIds.labelsSource,
      'slot': 'top',
      'minzoom': 15.2,
      'layout': {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': 11.0,
        'text-max-width': 9,
        'text-padding': 5,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      'paint': {
        'text-color': '#393244',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.3,
      },
    },
  ];

  static Map<String, dynamic> labelCollection(CampusSnapshot snapshot) => {
    'type': 'FeatureCollection',
    'features': [
      for (final feature in snapshot.features)
        if (feature.center != null &&
            (feature.name?.trim().isNotEmpty ?? false))
          {
            'type': 'Feature',
            'id': feature.id,
            'geometry': {'type': 'Point', 'coordinates': feature.center},
            'properties': {
              'name': feature.name,
              'label': mapLabel(feature.name!),
            },
          },
    ],
  };

  /// Adaptação de BuildingLabel.mapText: preserva números e temas curtos.
  static String mapLabel(String name) {
    final text = name.trim();
    final match = RegExp(
      r'pr[eé]dio\s*(\d+)',
      caseSensitive: false,
    ).firstMatch(text);
    if (match == null) return text;
    final number = match.group(1)!;
    final topic = text
        .replaceFirst(
          RegExp(r'\s*[-–—]\s*pr[eé]dio\s*\d+', caseSensitive: false),
          '',
        )
        .replaceFirst(
          RegExp(r'pr[eé]dio\s*\d+\s*[-–—]\s*', caseSensitive: false),
          '',
        )
        .replaceAll(RegExp(r'pr[eé]dio\s*\d+', caseSensitive: false), '')
        .replaceAll(RegExp(r'^[-–—\s]+|[-–—\s]+$'), '')
        .trim();
    if (topic.isNotEmpty &&
        topic.split(RegExp(r'\s+')).length <= 2 &&
        topic.length <= 16) {
      return 'Prédio $number\n$topic';
    }
    return 'Prédio $number';
  }
}
