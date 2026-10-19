import 'dart:math' as math;

import '../campus_map_layer_ids.dart';
import '../campus_snapshot.dart';
import 'campus_environment.dart';
import 'campus_model_manifest.dart';

/// Faixas de zoom herdadas de `Campus3dController` do PUCMaps.
///
///   < [lod1MinZoom]                 LOD2: fill-extrusion das footprints
///   [lod1MinZoom] .. [lod0MinZoom]  LOD1: grupos GLB
///   ≥ [lod0MinZoom]                 LOD0: chunks GLB, sob demanda
///
/// Os limites de zoom do Mapbox trocam os LODs sem sobreposição; as camadas
/// "pendentes" cobrem modelos sem bytes disponíveis ou falhos, até passar
/// o settle após download/cache.
abstract final class Campus3dLod {
  static const lod1MinZoom = 16.5;
  static const lod0MinZoom = 17.8;

  /// LOD0 começa a baixar 1 nível antes de aparecer (valor do PUCMaps).
  static const lod0PrefetchZoom = 16.8;

  /// Pré-carga antes da faixa visível, sem baixar os grupos na visão geral.
  static const lod1PrefetchZoom = lod1MinZoom - 1;

  /// Margem (fração do bbox da câmera) para pré-carregar chunks vizinhos.
  static const prefetchMargin = 0.25;

  /// Atraso heurístico após receber os bytes do GLB (rede/cache); não
  /// confirma processamento na GPU. A fila não espera esse timer.
  static const modelSettleDelay = Duration(milliseconds: 300);

  /// Câmera estável dispara LOD; `onMapIdle` pode não chegar com GLB indisponível.
  static const cameraSettle = Duration(milliseconds: 250);

  /// Espaça os pedidos de chunk em 16 ms. Não limita downloads concorrentes
  /// nem confirma parse/upload de GPU: esses trabalhos pertencem ao SDK.
  static const chunkSpacing = Duration(milliseconds: 16);

  // Ambiente (valores dos controllers de vegetação/props do PUCMaps). Não
  // mexem nos limiares dos prédios; cada tipo some abaixo do seu zoom.

  /// Árvores: visão distante sem árvores (legibilidade e custo).
  static const vegetationMinZoom = 16.8;

  /// Área esportiva: o campo (100 m) já se lê de longe.
  static const sportsMinZoom = 15.5;

  /// Carros só de perto: de longe viram ruído.
  static const vehicleMinZoom = 17.0;

  static double environmentMinZoom(String kind) => switch (kind) {
    'tree' => vegetationMinZoom,
    'sports' => sportsMinZoom,
    'vehicle' => vehicleMinZoom,
    _ => throw ArgumentError.value(kind, 'kind'),
  };
}

abstract final class Campus3dLayerIds {
  static const prefix = 'campus-map-3d';
  static const lod2 = '$prefix-lod2';
  static const pendingLod1 = '$prefix-pending-lod1';
  static const pendingLod0 = '$prefix-pending-lod0';
  static const lod1Source = '$prefix-lod1';
  static const lod1Layer = '$prefix-lod1';
  static String lod0Source(String chunkId) => '$prefix-lod0-$chunkId';
  static String lod0Layer(String chunkId) => '$prefix-lod0-$chunkId';

  /// Uma source GeoJSON de pontos por seção (`vegetation`, `props`) e uma
  /// camada por tipo. Modelos do style com prefixo próprio, sem colidir com
  /// os do Mapbox Standard.
  static String environmentSource(String set) => '$prefix-$set';
  static String environmentLayer(String set, String kind) =>
      '$prefix-$set-$kind';
  static String environmentModel(String set, String modelId) =>
      '$prefix-$set-$modelId';

  static bool owns(String? id) => id != null && id.startsWith(prefix);
}

abstract final class Campus3dLayers {
  /// Cor neutra de parede mais frequente no pipeline; só para ids fora do
  /// manifesto (não há nenhum no snapshot atual).
  static const fallbackWallColor = '#d1d1d0';

  static List<Object> idFilter(Iterable<String> ids) => [
    'in',
    ['get', 'id'],
    ['literal', ids.toList()],
  ];

  /// Cor fixa por prédio (parede do GLB). Não depende de zoom nem de categoria.
  static List<Object> wallColor(CampusModelManifest manifest) {
    final byColor = <String, List<String>>{};
    for (final building in manifest.buildings) {
      (byColor[building.wallColor] ??= []).add(building.id);
    }
    return [
      'match',
      ['get', 'id'],
      for (final entry in byColor.entries) ...[entry.value, entry.key],
      fallbackWallColor,
    ];
  }

  /// Extrusão sobre a source 2D existente. Base = `minHeight` do footprint:
  /// nenhum volume abaixo do solo.
  static Map<String, dynamic> extrusion(
    String id,
    CampusModelManifest manifest, {
    double? minZoom,
    double? maxZoom,
    List<Object>? filter,
  }) => {
    'id': id,
    'type': 'fill-extrusion',
    'source': CampusMapLayerIds.footprintsSource,
    'slot': 'middle',
    'minzoom': ?minZoom,
    'maxzoom': ?maxZoom,
    'filter': ?filter,
    'paint': {
      'fill-extrusion-color': wallColor(manifest),
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'minHeight'],
      'fill-extrusion-opacity': 1.0,
    },
  };

  static List<Map<String, dynamic>> extrusions(CampusModelManifest manifest) {
    final all = manifest.buildingIds;
    return [
      extrusion(
        Campus3dLayerIds.lod2,
        manifest,
        maxZoom: Campus3dLod.lod1MinZoom,
      ),
      extrusion(
        Campus3dLayerIds.pendingLod1,
        manifest,
        minZoom: Campus3dLod.lod1MinZoom,
        maxZoom: Campus3dLod.lod0MinZoom,
        filter: idFilter(all),
      ),
      extrusion(
        Campus3dLayerIds.pendingLod0,
        manifest,
        minZoom: Campus3dLod.lod0MinZoom,
        filter: idFilter(all),
      ),
    ];
  }

  /// Pontos da seção: cada feature diz qual modelo do style usar, escala e
  /// giro (`scale3`/`rot3`, mesma convenção do PUCMaps).
  static Map<String, dynamic> environmentGeoJson(CampusEnvironmentSet set) => {
    'type': 'FeatureCollection',
    'features': [
      for (final instance in set.instances)
        {
          'type': 'Feature',
          'id': instance.id,
          'geometry': {
            'type': 'Point',
            'coordinates': [instance.longitude, instance.latitude],
          },
          'properties': {
            'id': instance.id,
            'kind': set.model(instance.model).kind,
            'model': Campus3dLayerIds.environmentModel(
              set.name,
              instance.model,
            ),
            'scale3': [instance.scale, instance.scale, instance.scale],
            'rot3': [0, 0, instance.rotation],
          },
        },
    ],
  };

  /// O Mapbox desenha o mesmo modelo do style em todos os pontos que o usam:
  /// o custo cresce por variante, não por árvore/carro. Sem sombra projetada,
  /// sem emissão e sem `model-color` (materiais do GLB preservados).
  static List<Map<String, dynamic>> environmentLayers(
    CampusEnvironmentSet set,
  ) => [
    for (final kind in set.kinds)
      {
        'id': Campus3dLayerIds.environmentLayer(set.name, kind),
        'type': 'model',
        'source': Campus3dLayerIds.environmentSource(set.name),
        'slot': 'middle',
        'minzoom': Campus3dLod.environmentMinZoom(kind),
        'filter': [
          '==',
          ['get', 'kind'],
          kind,
        ],
        'layout': {
          'model-id': ['get', 'model'],
        },
        'paint': {
          'model-type': 'common-3d',
          'model-scale': ['get', 'scale3'],
          'model-rotation': ['get', 'rot3'],
          'model-cast-shadows': false,
          'model-receive-shadows': true,
          'model-emissive-strength': 0.0,
        },
      },
  ];

  /// Chunks LOD0 que cruzam a vista (com margem), do mais próximo ao mais
  /// distante do centro. Mesma regra do PUCMaps; não descarrega nada.
  static List<CampusModel> lod0Wanted(
    CampusModelManifest manifest, {
    required CampusBounds view,
    required double centerLongitude,
    required double centerLatitude,
    required Set<String> skip,
  }) {
    final dx = (view.east - view.west) * Campus3dLod.prefetchMargin;
    final dy = (view.north - view.south) * Campus3dLod.prefetchMargin;
    final west = view.west - dx;
    final east = view.east + dx;
    final south = view.south - dy;
    final north = view.north + dy;
    final cos = math.cos(centerLatitude * math.pi / 180);
    double distance(CampusModel model) {
      final x = (model.bounds.longitude - centerLongitude) * cos;
      final y = model.bounds.latitude - centerLatitude;
      return x * x + y * y;
    }

    return manifest.lod0
        .where((model) => !skip.contains(model.id))
        .where(
          (model) =>
              model.bounds.west <= east &&
              model.bounds.east >= west &&
              model.bounds.south <= north &&
              model.bounds.north >= south,
        )
        .toList()
      ..sort((a, b) => distance(a).compareTo(distance(b)));
  }
}
