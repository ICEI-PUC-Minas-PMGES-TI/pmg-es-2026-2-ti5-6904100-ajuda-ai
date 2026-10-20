import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_pucstop.dart';
import 'three_d/campus_pucstop_model.dart';

/// PucStops no mapa: uma source GeoJSON de pontos, círculos no chão (sempre;
/// também servem de alvo do toque), rótulo de perto e o totem 3D opcional.
///
/// Adaptado das camadas `totem-*` do PUCMaps (halo `#FFD58A`, ponto
/// `#F59E0B`/`#22C55E`, GLB a partir do zoom 16). O estado vem do servidor
/// (coletado ou não); "fora de alcance" depende da posição e fica no card.
abstract final class CampusPucStopLayer {
  static const source = 'campus-map-pucstops';
  static const halo = 'campus-map-pucstops-halo';
  static const dot = 'campus-map-pucstops-dot';
  static const label = 'campus-map-pucstops-label';
  static const totem = 'campus-map-pucstops-totem';
  static const totemModel = 'campus-map-pucstops-totem-model';

  /// Camadas que identificam um PucStop no toque.
  static const pickable = [dot, halo];

  /// Na visão geral (15,2) os 8 pontos já aparecem, pequenos. O totem só
  /// junto com os prédios GLB (LOD1); o nome só bem de perto.
  static const dotMinZoom = 15.0;
  static const totemMinZoom = 16.5;
  static const labelMinZoom = 17.5;

  static const available = 'available';
  static const collected = 'collected';

  static Map<String, dynamic> geoJson(
    List<CampusPucStop> stops,
    Set<String> collectedIds,
  ) => {
    'type': 'FeatureCollection',
    'features': [
      for (final stop in stops)
        {
          'type': 'Feature',
          'id': stop.id,
          'geometry': {
            'type': 'Point',
            'coordinates': [stop.longitude, stop.latitude],
          },
          'properties': {
            'id': stop.id,
            'name': stop.name,
            'xp': stop.xp,
            'state': collectedIds.contains(stop.id) ? collected : available,
          },
        },
    ],
  };

  static List<Object> _isState(String state) => [
    '==',
    ['get', 'state'],
    state,
  ];

  static List<Map<String, dynamic>> get layers => [
    {
      'id': halo,
      'type': 'circle',
      'source': source,
      'slot': 'middle',
      'minzoom': dotMinZoom,
      'filter': _isState(available),
      'paint': {
        // ~16 m no chão (exponencial base 2 acompanha a escala do mapa).
        'circle-radius': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          15,
          5,
          22,
          640,
        ],
        'circle-color': '#FFD58A',
        'circle-opacity': 0.45,
        'circle-blur': 1.0,
        'circle-pitch-alignment': 'map',
        'circle-emissive-strength': 1.0,
      },
    },
    {
      'id': dot,
      'type': 'circle',
      'source': source,
      'slot': 'middle',
      'minzoom': dotMinZoom,
      'paint': {
        'circle-radius': ['case', _isState(collected), 7.0, 6.0],
        'circle-color': ['case', _isState(collected), '#22C55E', '#F59E0B'],
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 2.0,
        'circle-pitch-alignment': 'map',
        'circle-emissive-strength': 1.0,
      },
    },
    {
      'id': label,
      'type': 'symbol',
      'source': source,
      'slot': 'top',
      'minzoom': labelMinZoom,
      'layout': {
        // Estado também em texto (não só pela cor).
        'text-field': [
          'case',
          _isState(collected),
          [
            'concat',
            '✓ ',
            ['get', 'name'],
          ],
          [
            'concat',
            ['get', 'name'],
            ' · +',
            [
              'to-string',
              ['get', 'xp'],
            ],
            ' XP',
          ],
        ],
        'text-size': 12,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 10,
      },
      'paint': {
        'text-color': '#1F1640',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.5,
      },
    },
  ];

  /// Totem só onde ainda há XP: coletado fica só com o ponto verde.
  static Map<String, dynamic> totemLayer(CampusPucStopModel model) => {
    'id': totem,
    'type': 'model',
    'source': source,
    'slot': 'middle',
    'minzoom': totemMinZoom,
    'filter': _isState(available),
    'layout': {'model-id': totemModel},
    'paint': {
      'model-type': 'common-3d',
      'model-scale': [model.scale, model.scale, model.scale],
      'model-rotation': model.orientation,
      'model-cast-shadows': true,
      'model-receive-shadows': true,
      'model-emissive-strength': 0.4,
    },
  };

  /// Cria a source e as camadas 2D, ou só troca os dados se já existirem.
  static Future<void> show(
    StyleManager style,
    List<CampusPucStop> stops,
    Set<String> collectedIds, {
    required bool Function() isActive,
  }) async {
    final data = jsonEncode(geoJson(stops, collectedIds));
    if (await style.styleSourceExists(source)) {
      if (!isActive()) return;
      await style.setStyleSourceProperty(source, 'data', data);
      // Mapbox 2.31 pode manter resíduos translúcidos ao trocar só os dados.
      // Recriar a camada força o redesenho sem baixar o GLB novamente.
      if (await style.styleLayerExists(totem) && isActive()) {
        final propriedades = await style.getStyleLayerProperties(totem);
        await style.removeStyleLayer(totem);
        if (isActive()) await style.addStyleLayer(propriedades, null);
      }
    } else {
      if (!isActive()) return;
      await style.addStyleSource(
        source,
        jsonEncode({'type': 'geojson', 'data': geoJson(stops, collectedIds)}),
      );
    }
    for (final layer in layers) {
      if (!isActive()) return;
      if (await style.styleLayerExists(layer['id'] as String)) continue;
      await style.addStyleLayer(jsonEncode(layer), null);
    }
  }

  /// Totem remoto. Exige a source (chame [show] antes). Falha de download do
  /// GLB não quebra nada: os pontos continuam (ver [removeTotem]).
  static Future<void> installTotem(
    StyleManager style,
    CampusPucStopModel model,
    Uri url, {
    required bool Function() isActive,
  }) async {
    if (!isActive() || !await style.styleSourceExists(source)) return;
    if (await style.styleLayerExists(totem)) return;
    await style.addStyleModel(totemModel, url.toString());
    if (!isActive()) return;
    // Slot `middle` (como os prédios GLB); o rótulo fica no `top`, à frente.
    await style.addStyleLayer(jsonEncode(totemLayer(model)), null);
  }

  static Future<void> removeTotem(StyleManager style) async {
    if (await style.styleLayerExists(totem)) {
      await style.removeStyleLayer(totem);
    }
  }
}
