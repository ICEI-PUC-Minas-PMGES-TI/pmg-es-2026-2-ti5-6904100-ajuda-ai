import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../campus_map_config.dart';
import '../campus_snapshot.dart';
import 'campus_3d_layers.dart';
import 'campus_asset_resolver.dart';
import 'campus_model_manifest.dart';

/// Ciclo de vida do campus 3D em um style carregado. Adaptado do
/// `Campus3dController` do PUCMaps sem picking, janelas acesas, overrides de
/// cor, sombras de debug ou carregamento de asset embutido.
///
/// Um controller pertence a um único style: troca de style ou de tela cria
/// outro. Tudo é idempotente (ids existentes não são recriados).
class Campus3dController {
  Campus3dController({
    required this.map,
    required this.manifest,
    required this.resolver,
    required this.isActive,
    this.onEvent,
  });

  /// Resolver só quando o 3D está ligado e a base pública é válida;
  /// `null` significa: manter o mapa 2D e não registrar nada de 3D.
  static CampusAssetResolver? resolverFor(
    CampusMapConfig config,
    CampusModelManifest manifest,
  ) {
    if (!config.features.enable3d) return null;
    return CampusAssetResolver.tryCreate(
      config.mapAssetsBaseUrl,
      manifest.version,
    );
  }

  final MapboxMap map;
  final CampusModelManifest manifest;
  final CampusAssetResolver resolver;
  final bool Function() isActive;

  /// Marcos para o diagnóstico: `extrusions`, `lod1`, `lod0:<id>`, `error:<source>`.
  final void Function(String event)? onEvent;

  StyleManager get _style => map.style;

  bool _disposed = false;
  bool _installed = false;
  bool _lod1Requested = false;
  bool _lod1Failed = false;
  final Set<String> _lod0Requested = {};
  final Set<String> _lod0Failed = {};
  Future<void> _queue = Future.value();
  final Stopwatch _clock = Stopwatch();

  bool get _alive => !_disposed && isActive();

  /// Diagnóstico leve (só leitura): o que já foi pedido ao Mapbox.
  bool get lod1Requested => _lod1Requested;
  Set<String> get lod0Requested => Set.unmodifiable(_lod0Requested);

  void dispose() => _disposed = true;

  /// Camadas de extrusão (cobrem o campus na hora) e primeira carga pela câmera.
  Future<void> install() => _serial(() async {
    if (_installed) return;
    _clock.start();
    for (final layer in Campus3dLayers.extrusions(manifest)) {
      await _addLayer(layer);
    }
    if (!_alive) return;
    _installed = true;
    _log('extrusões prontas');
    onEvent?.call('extrusions');
    await _updateForCamera();
  });

  /// Chamado quando a câmera para. Só adiciona modelos; nada é descarregado.
  Future<void> onCameraIdle() => _serial(() async {
    if (_installed) await _updateForCamera();
  });

  /// Erro de carregamento de uma source do 3D (ex.: GLB indisponível).
  /// A região volta a ser coberta pela extrusão; o restante continua.
  void onSourceError(String sourceId) {
    if (sourceId == Campus3dLayerIds.lod1Source) {
      if (_lod1Failed) return;
      _lod1Failed = true;
    } else {
      final chunk = manifest.lod0.where(
        (model) => Campus3dLayerIds.lod0Source(model.id) == sourceId,
      );
      if (chunk.isEmpty || !_lod0Failed.add(chunk.first.id)) return;
    }
    _log('falha ao carregar $sourceId; extrusão mantida');
    onEvent?.call('error:$sourceId');
    unawaited(_serial(_refreshPending));
  }

  Future<void> _serial(Future<void> Function() task) {
    final next = _queue.then((_) async {
      if (!_alive) return;
      try {
        await task();
      } catch (error) {
        // Um modelo com problema não derruba o mapa; a extrusão segue visível.
        _log('erro do 3D: ${error.runtimeType}');
      }
    });
    _queue = next;
    return next;
  }

  Future<void> _updateForCamera() async {
    final state = await map.getCameraState();
    if (!_alive) return;
    if (state.zoom >= Campus3dLod.lod1PrefetchZoom) await _ensureLod1();
    if (state.zoom < Campus3dLod.lod0PrefetchZoom || !_alive) return;
    if (_lod0Requested.length == manifest.lod0.length) return;

    final bounds = await map.coordinateBoundsForCamera(
      CameraOptions(
        center: state.center,
        zoom: state.zoom,
        bearing: state.bearing,
        pitch: state.pitch,
        padding: state.padding,
      ),
    );
    if (!_alive) return;
    final southwest = bounds.southwest.coordinates;
    final northeast = bounds.northeast.coordinates;
    final center = state.center.coordinates;
    final wanted = Campus3dLayers.lod0Wanted(
      manifest,
      view: CampusBounds(
        west: southwest.lng.toDouble(),
        south: southwest.lat.toDouble(),
        east: northeast.lng.toDouble(),
        north: northeast.lat.toDouble(),
      ),
      centerLongitude: center.lng.toDouble(),
      centerLatitude: center.lat.toDouble(),
      skip: _lod0Requested,
    );
    for (final chunk in wanted) {
      if (!_alive) return;
      await _addLod0(chunk);
      await Future<void>.delayed(Campus3dLod.chunkSpacing);
    }
  }

  Future<void> _ensureLod1() async {
    if (_lod1Requested) return;
    _lod1Requested = true;
    await _addModelSource(Campus3dLayerIds.lod1Source, manifest.lod1);
    await _addModelLayer(
      Campus3dLayerIds.lod1Layer,
      Campus3dLayerIds.lod1Source,
      minZoom: Campus3dLod.lod1MinZoom,
      maxZoom: Campus3dLod.lod0MinZoom,
      castShadows: false,
    );
    _log('LOD1 solicitado (${manifest.lod1.length} grupos)');
    onEvent?.call('lod1');
    await Future<void>.delayed(Campus3dLod.modelSettleDelay);
    await _refreshPending();
  }

  Future<void> _addLod0(CampusModel chunk) async {
    if (!_lod0Requested.add(chunk.id)) return;
    final sourceId = Campus3dLayerIds.lod0Source(chunk.id);
    await _addModelSource(sourceId, [chunk]);
    await _addModelLayer(
      Campus3dLayerIds.lod0Layer(chunk.id),
      sourceId,
      minZoom: Campus3dLod.lod0MinZoom,
      castShadows: true,
    );
    _log('chunk ${chunk.id} solicitado (${chunk.buildingIds.length} prédios)');
    onEvent?.call('lod0:${chunk.id}');
    unawaited(
      Future<void>.delayed(
        Campus3dLod.modelSettleDelay,
        () => _serial(_refreshPending),
      ),
    );
  }

  /// Extrusão pendente = prédios cujo GLB ainda não foi pedido ou falhou.
  Future<void> _refreshPending() async {
    final lod1Pending = !_lod1Requested || _lod1Failed
        ? manifest.buildingIds
        : const <String>[];
    final lod0Pending = [
      for (final chunk in manifest.lod0)
        if (!_lod0Requested.contains(chunk.id) ||
            _lod0Failed.contains(chunk.id))
          ...chunk.buildingIds,
    ];
    for (final (layer, ids) in [
      (Campus3dLayerIds.pendingLod1, lod1Pending),
      (Campus3dLayerIds.pendingLod0, lod0Pending),
    ]) {
      if (!_alive || !await _style.styleLayerExists(layer)) continue;
      await _style.setStyleLayerProperty(
        layer,
        'filter',
        Campus3dLayers.idFilter(ids),
      );
    }
  }

  Future<void> _addModelSource(String id, List<CampusModel> models) async {
    if (!_alive || await _style.styleSourceExists(id)) return;
    if (!_alive) return;
    await _style.addSource(
      ModelSource(
        id: id,
        models: [
          for (final model in models)
            ModelSourceModel(
              id: model.id,
              uri: resolver.resolve(model.path).toString(),
              position: model.anchor,
              orientation: manifest.orientation,
            ),
        ],
      ),
    );
  }

  Future<void> _addModelLayer(
    String id,
    String sourceId, {
    double? minZoom,
    double? maxZoom,
    required bool castShadows,
  }) async {
    if (!_alive || await _style.styleLayerExists(id)) return;
    if (!_alive) return;
    // Materiais do GLB preservados: sem model-color, mix ou emissão.
    await _style.addLayer(
      ModelLayer(
        id: id,
        sourceId: sourceId,
        slot: 'middle',
        modelType: ModelType.COMMON_3D,
        modelScale: manifest.scale,
        modelCastShadows: castShadows,
        modelReceiveShadows: true,
        minZoom: minZoom,
        maxZoom: maxZoom,
      ),
    );
  }

  Future<void> _addLayer(Map<String, dynamic> layer) async {
    if (!_alive || await _style.styleLayerExists(layer['id'] as String)) return;
    if (!_alive) return;
    await _style.addStyleLayer(jsonEncode(layer), null);
  }

  void _log(String message) {
    if (kDebugMode || kProfileMode) {
      debugPrint('[campus3d] ${_clock.elapsedMilliseconds} ms: $message');
    }
  }
}
