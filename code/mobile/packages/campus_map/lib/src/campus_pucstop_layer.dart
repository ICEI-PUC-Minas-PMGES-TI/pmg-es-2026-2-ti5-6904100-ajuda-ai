import 'dart:convert';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_pucstop.dart';
import 'three_d/campus_pucstop_model.dart';

/// PucStops no mapa: uma source GeoJSON de pontos (círculos no chão, alvo do
/// toque e rótulo) e o totem 3D numa source de modelos, um por PucStop.
///
/// Adaptado das camadas `totem-*` do PUCMaps (`map_renderer.dart`): halo
/// `#FFD58A`, ponto `#F59E0B`/`#22C55E` e o GLB com o topo (`Aneis_Bronze` +
/// `Joia_Azul`) girado por feature-state `topo`. Diferente do PUCMaps, o
/// totem continua no mapa depois da coleta, com uma aura verde no chão.
abstract final class CampusPucStopLayer {
  static const source = 'campus-map-pucstops';
  static const halo = 'campus-map-pucstops-halo';
  static const aura = 'campus-map-pucstops-collected-aura';
  static const ring = 'campus-map-pucstops-collected-ring';
  static const dot = 'campus-map-pucstops-dot';
  static const label = 'campus-map-pucstops-label';
  static const totem = 'campus-map-pucstops-totem';

  /// Source de modelos do totem (um modelo por PucStop, id = id do PucStop).
  static const modelSource = 'campus-map-pucstops-models';

  /// Nós do GLB que formam o topo (anéis + joia). A base fica parada.
  static const topRingNode = 'Aneis_Bronze';
  static const topGemNode = 'Joia_Azul';

  /// Material do vitral no GLB (brilho próprio).
  static const glassMaterial = 'GLB_Totem_Vitral';

  /// Chave do feature-state com a rotação `[x, y, z]` do topo, em graus.
  static const topState = 'topo';

  /// Camadas que identificam um PucStop no toque (o totem 3D também).
  static const pickable = [dot, halo, aura];

  /// Na visão geral (15,2) os pontos já aparecem, pequenos. O totem só junto
  /// com os prédios GLB (LOD1); o nome só bem de perto.
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

  /// Raio no chão que acompanha a escala do mapa (exponencial base 2):
  /// [meters] metros, como os círculos do PUCMaps (640 px no zoom 22 ≈ 16 m).
  static List<Object> _groundRadius(double meters) => [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    15,
    meters * 5 / 16,
    22,
    meters * 40,
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
        // Poça de luz âmbar (~16 m): ainda há XP aqui.
        'circle-radius': _groundRadius(16),
        'circle-color': '#FFD58A',
        'circle-opacity': 0.45,
        'circle-blur': 1.0,
        'circle-pitch-alignment': 'map',
        'circle-emissive-strength': 1.0,
      },
    },
    // Coletado: aura verde no chão (luz difusa + anel nítido), para o totem
    // continuar visível e o estado ficar claro sem abrir nada.
    {
      'id': aura,
      'type': 'circle',
      'source': source,
      'slot': 'middle',
      'minzoom': dotMinZoom,
      'filter': _isState(collected),
      'paint': {
        'circle-radius': _groundRadius(14),
        'circle-color': '#22C55E',
        'circle-opacity': 0.4,
        'circle-blur': 1.0,
        'circle-pitch-alignment': 'map',
        'circle-emissive-strength': 1.0,
      },
    },
    {
      'id': ring,
      'type': 'circle',
      'source': source,
      'slot': 'middle',
      'minzoom': totemMinZoom,
      'filter': _isState(collected),
      'paint': {
        'circle-radius': _groundRadius(7),
        'circle-color': '#22C55E',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#16A34A',
        'circle-stroke-width': 3.0,
        'circle-stroke-opacity': 0.9,
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

  /// Um modelo por PucStop (coletado ou não), com o topo e o vitral
  /// endereçáveis, como `_totemModelDefinitions` do PUCMaps.
  static Map<String, dynamic> models(
    List<CampusPucStop> stops,
    CampusPucStopModel model,
    Uri url,
  ) => {
    for (final stop in stops)
      stop.id: {
        'uri': url.toString(),
        'position': [stop.longitude, stop.latitude],
        'orientation': model.orientation,
        'nodeOverrideNames': const [topRingNode, topGemNode],
        'materialOverrideNames': const [glassMaterial],
      },
  };

  /// Camada do totem do PUCMaps: o topo gira pelo feature-state; vidro e
  /// joia acesos, anéis meio acesos, pedra quase só com a luz do mapa.
  static Map<String, dynamic> totemLayer(CampusPucStopModel model) => {
    'id': totem,
    'type': 'model',
    'source': modelSource,
    'slot': 'middle',
    'minzoom': totemMinZoom,
    'paint': {
      'model-type': 'common-3d',
      'model-scale': [model.scale, model.scale, model.scale],
      'model-rotation': [
        'match',
        ['get', 'part'],
        [topRingNode, topGemNode],
        [
          'coalesce',
          ['feature-state', topState],
          [
            'literal',
            [0.0, 0.0, 0.0],
          ],
        ],
        [
          'literal',
          [0.0, 0.0, 0.0],
        ],
      ],
      'model-cast-shadows': true,
      'model-receive-shadows': true,
      'model-emissive-strength': [
        'match',
        ['get', 'part'],
        [glassMaterial, topGemNode],
        1.0,
        topRingNode,
        0.55,
        0.15,
      ],
      'model-opacity': 1.0,
    },
  };

  /// Feature-state do topo girado [yaw] graus no eixo vertical.
  static String topRotation(double yaw) => jsonEncode({
    topState: [0.0, yaw, 0.0],
  });

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

  /// Totem remoto: source de modelos + camada. Falha de download do GLB não
  /// quebra nada: os pontos continuam (ver [removeTotem]).
  static Future<void> installTotem(
    StyleManager style,
    CampusPucStopModel model,
    Uri url,
    List<CampusPucStop> stops, {
    required bool Function() isActive,
  }) async {
    if (!isActive() || await style.styleLayerExists(totem)) return;
    if (!await style.styleSourceExists(modelSource)) {
      if (!isActive()) return;
      await style.addStyleSource(
        modelSource,
        jsonEncode({'type': 'model', 'models': models(stops, model, url)}),
      );
    }
    if (!isActive()) return;
    // Slot `middle` (como os prédios GLB); o rótulo fica no `top`, à frente.
    await style.addStyleLayer(jsonEncode(totemLayer(model)), null);
  }

  /// Troca o conjunto de totens. Reenviar `models` recria os modelos nativos
  /// (e zera o feature-state do topo): só quando a lista muda.
  static Future<void> updateTotems(
    StyleManager style,
    String modelsJson,
  ) async {
    if (!await style.styleSourceExists(modelSource)) return;
    await style.setStyleSourceProperty(modelSource, 'models', modelsJson);
  }

  static Future<void> removeTotem(StyleManager style) async {
    if (await style.styleLayerExists(totem)) {
      await style.removeStyleLayer(totem);
    }
    if (await style.styleSourceExists(modelSource)) {
      await style.removeStyleSource(modelSource);
    }
  }
}
