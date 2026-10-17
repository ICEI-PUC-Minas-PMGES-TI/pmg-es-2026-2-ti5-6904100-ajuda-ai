import 'dart:math' as math;

import '../campus_map_layer_ids.dart';
import '../campus_snapshot.dart';
import 'campus_model_manifest.dart';

/// Faixas de zoom herdadas de `Campus3dController` do PUCMaps.
///
///   < [lod1MinZoom]                 LOD2: fill-extrusion das footprints
///   [lod1MinZoom] .. [lod0MinZoom]  LOD1: 4 grupos GLB
///   ≥ [lod0MinZoom]                 LOD0: 12 chunks GLB, sob demanda
///
/// Os limites de zoom do Mapbox trocam os LODs sem sobreposição; as camadas
/// "pendentes" mantêm a extrusão onde o GLB ainda não chegou.
abstract final class Campus3dLod {
  static const lod1MinZoom = 16.5;
  static const lod0MinZoom = 17.8;

  /// LOD0 começa a baixar 1 nível antes de aparecer (valor do PUCMaps).
  static const lod0PrefetchZoom = 16.8;

  /// No PUCMaps o LOD1 baixava ao abrir o mapa. Aqui segue a mesma antecedência
  /// de 1 nível usada no LOD0, para não baixar 1,1 MB na visão geral.
  static const lod1PrefetchZoom = lod1MinZoom - 1;

  /// Margem (fração do bbox da câmera) para pré-carregar chunks vizinhos.
  static const prefetchMargin = 0.25;

  /// Tempo para o Mapbox processar o GLB antes de remover a extrusão pendente.
  static const modelSettleDelay = Duration(milliseconds: 300);

  /// Câmera sem mudar por este tempo dispara a atualização de LOD. Substitui
  /// o `onMapIdle` do PUCMaps, que não dispara com um GLB indisponível.
  static const cameraSettle = Duration(milliseconds: 250);

  /// Um chunk por frame: espalha parse/upload de GPU.
  static const chunkSpacing = Duration(milliseconds: 16);
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

  /// Extrusão sobre a source 2D existente. Base = `minHeight` real (0 hoje):
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
