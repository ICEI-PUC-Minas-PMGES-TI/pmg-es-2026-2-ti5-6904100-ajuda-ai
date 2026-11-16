import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_map_layer_ids.dart';
import 'campus_snapshot.dart';

/// Parte 2D adaptada de MapRenderer do PUCMaps. Nenhum recurso de volume.
class CampusMapRenderer {
  CampusMapRenderer(this.style, {this.clipBasemapModels = false});

  final StyleManager style;

  /// Com o 3D do campus ligado, os modelos do basemap dentro das pegadas
  /// reais também são recortados para não sobrepor os GLBs.
  final bool clipBasemapModels;
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
    for (final layer in layersFor(clipBasemapModels: clipBasemapModels)) {
      if (!isActive()) return;
      final exists = await style.styleLayerExists(layer['id'] as String);
      if (!isActive()) return;
      if (!exists) await style.addStyleLayer(jsonEncode(layer), null);
    }
  }

  static List<Map<String, dynamic>> get layers => layersFor();

  /// Cores constantes; o zoom só regula a entrada dos rótulos.
  static List<Map<String, dynamic>> layersFor({
    bool clipBasemapModels = false,
  }) => [
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
      // Só o basemap dentro das pegadas reais: símbolos e, com 3D, modelos.
      // Não recorta o campus inteiro, ruas nem camadas do próprio pacote.
      'layout': {
        'clip-layer-types': ['symbol', if (clipBasemapModels) 'model'],
        'clip-layer-scope': ['basemap'],
      },
    },
    // Destaque do prédio aberto no card: contorno grosso na pegada real,
    // vazio até a view definir o filtro com o id selecionado.
    {
      'id': CampusMapLayerIds.selected,
      'type': 'line',
      'source': CampusMapLayerIds.footprintsSource,
      'slot': 'middle',
      'filter': selectionFilter(null),
      'layout': {'line-join': 'round', 'line-cap': 'round'},
      'paint': {
        'line-color': '#0F5983',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          2.0,
          19,
          5.0,
        ],
        'line-emissive-strength': 1.0,
        // Atrás do modelo 3D o contorno continua legível, mais fraco.
        'line-occlusion-opacity': 0.5,
      },
    },
    // Rótulos do PUCMaps (`campus-name`): entram na vista do campus, crescem
    // com o zoom e ficam sobre o telhado (`symbol-z-elevate`), não sob o 3D.
    {
      'id': CampusMapLayerIds.labels,
      'type': 'symbol',
      'source': CampusMapLayerIds.labelsSource,
      'slot': 'top',
      'minzoom': 16.5,
      'layout': {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          16.5,
          10,
          18.5,
          12,
          21,
          14,
        ],
        'text-anchor': 'center',
        'text-max-width': 8,
        'text-padding': 6,
        'text-optional': true,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'symbol-z-elevate': true,
      },
      'paint': {
        'text-color': '#1f1640',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
        'text-occlusion-opacity': 0.85,
        'text-emissive-strength': 1.0,
      },
    },
  ];

  /// Filtro do contorno de destaque: só a pegada com o [id] (nenhuma se nulo).
  static List<Object> selectionFilter(String? id) => [
    '==',
    ['get', 'id'],
    id ?? '',
  ];

  /// Destaca o prédio [id] (ou limpa com `null`) sem recriar a camada.
  Future<void> highlight(String? id) async {
    if (!await style.styleLayerExists(CampusMapLayerIds.selected)) return;
    await style.setStyleLayerProperty(
      CampusMapLayerIds.selected,
      'filter',
      selectionFilter(id),
    );
  }

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
