import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../campus_map_config.dart';
import '../campus_snapshot.dart';
import 'campus_3d_layers.dart';
import 'campus_asset_resolver.dart';
import 'campus_model_manifest.dart';
import 'campus_window_lighting.dart';

/// Ciclo de vida do campus 3D em um style carregado.
/// Adaptado do `Campus3dController` do PUCMaps.
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
    double windowGlow = 0,
  }) : _windowGlow = windowGlow.clamp(0.0, 1.0);

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
  Future<void>? _cameraRefresh;
  bool _cameraDirty = false;
  int _cameraRevision = 0;
  final Stopwatch _clock = Stopwatch();
  double _windowGlow;
  final Map<String, double> _windowPainted = {};
  final Set<String> _downloaded = {};
  final Set<String> _settled = {};
  final List<Timer> _settleTimers = [];
  late final Map<String, String> _modelSources = {
    for (final model in manifest.lod1)
      resolver.resolve(model.path).toString(): Campus3dLayerIds.lod1Source,
    for (final model in manifest.lod0)
      resolver.resolve(model.path).toString(): Campus3dLayerIds.lod0Source(
        model.id,
      ),
  };

  bool get _alive => !_disposed && isActive();

  /// Diagnóstico leve (só leitura): o que já foi pedido ao Mapbox.
  bool get lod1Requested => _lod1Requested;
  Set<String> get lod0Requested => Set.unmodifiable(_lod0Requested);

  void dispose() {
    _disposed = true;
    for (final timer in _settleTimers) {
      timer.cancel();
    }
    _settleTimers.clear();
  }

  /// Chamado só após ResourceEvent bem-sucedido (rede ou cache). Adicionar
  /// ModelSource não aguarda os bytes. O settle continua heurístico: este
  /// evento confirma I/O, não um frame com o GLB já processado pela GPU.
  void onModelDownloaded(String url) {
    if (!_alive) return;
    final source = _modelSources[url];
    if (source == null || !_downloaded.add(url)) return;
    if (source == Campus3dLayerIds.lod1Source &&
        manifest.lod1.any(
          (m) => !_downloaded.contains(resolver.resolve(m.path).toString()),
        )) {
      return;
    }
    _settleTimers.add(
      Timer(Campus3dLod.modelSettleDelay, () {
        if (!_alive) return;
        _settled.add(source);
        unawaited(
          _serial(() async {
            await _refreshPending();
            onEvent?.call('fallback liberado:$source');
          }),
        );
      }),
    );
  }

  /// Serializado com a criação dos LODs; os próximos modelos já nascem com
  /// o valor atual. Só as janelas explicitamente marcadas no GLB acendem.
  Future<void> setWindowGlow(double value) {
    _windowGlow = value.clamp(0.0, 1.0);
    return _serial(() async {
      final glow = _windowGlow;
      for (final id in _windowPainted.keys.toList()) {
        if (!_alive) return;
        if (_windowPainted[id] == glow || !await _style.styleLayerExists(id)) {
          continue;
        }
        for (final property in [
          'model-color-mix-intensity',
          'model-emissive-strength',
        ]) {
          if (!_alive) return;
          await _style.setStyleLayerProperty(
            id,
            property,
            CampusWindowLighting.strength(glow),
          );
        }
        _windowPainted[id] = glow;
      }
    });
  }

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

  /// Invalida só trabalho ainda não iniciado; GLBs já entregues ao SDK ficam
  /// em cache. Não remove sources nem tenta cancelar um upload em andamento.
  void onCameraChanged() => _cameraRevision++;

  /// Uma atualização pendente por câmera, mesmo com callbacks repetidos.
  /// A fila de mutações do style continua única; a próxima leitura usa a
  /// câmera mais recente, em vez de acumular uma operação por evento.
  Future<void> onCameraIdle() {
    onCameraChanged();
    _cameraDirty = true;
    return _cameraRefresh ??= _serial(() async {
      while (_cameraDirty && _alive) {
        _cameraDirty = false;
        if (_installed) await _updateForCamera();
      }
    }).whenComplete(() => _cameraRefresh = null);
  }

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
    final revision = _cameraRevision;
    bool current() => _alive && revision == _cameraRevision;
    final state = await map.getCameraState();
    if (!current()) return;
    if (state.zoom < Campus3dLod.lod0PrefetchZoom) {
      if (state.zoom >= Campus3dLod.lod1PrefetchZoom) await _ensureLod1();
      return;
    }
    // Como no PUCMaps: de perto, a região visível tem prioridade sobre os
    // quatro grupos LOD1. Mantém os mesmos limiares e margem de prefetch.
    if (_lod0Requested.length == manifest.lod0.length) {
      await _ensureLod1();
      return;
    }

    final bounds = await map.coordinateBoundsForCamera(
      CameraOptions(
        center: state.center,
        zoom: state.zoom,
        bearing: state.bearing,
        pitch: state.pitch,
        padding: state.padding,
      ),
    );
    if (!current()) return;
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
      if (!current()) return;
      await _addLod0(chunk);
      await Future<void>.delayed(Campus3dLod.chunkSpacing);
    }
    if (current()) await _ensureLod1();
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
  }

  /// Preserva a extrusão até os bytes chegarem e passar o settle; falha
  /// mantém a cobertura. Não confunde source adicionada com GLB carregado.
  Future<void> _refreshPending() async {
    final lod1Pending =
        !_settled.contains(Campus3dLayerIds.lod1Source) || _lod1Failed
        ? manifest.buildingIds
        : const <String>[];
    final lod0Pending = [
      for (final chunk in manifest.lod0)
        if (!_settled.contains(Campus3dLayerIds.lod0Source(chunk.id)) ||
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
              materialOverrideNames: const [CampusWindowLighting.material],
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
    final glow = _windowGlow;
    // O override é restrito ao material de janela; fachadas e telhados
    // continuam com os materiais originais e emissão zero.
    await _style.addLayer(
      ModelLayer(
        id: id,
        sourceId: sourceId,
        slot: 'middle',
        modelType: ModelType.COMMON_3D,
        modelScale: manifest.scale,
        modelCastShadows: castShadows,
        modelReceiveShadows: true,
        modelColorExpression: CampusWindowLighting.color,
        modelColorMixIntensityExpression: CampusWindowLighting.strength(glow),
        modelEmissiveStrengthExpression: CampusWindowLighting.strength(glow),
        minZoom: minZoom,
        maxZoom: maxZoom,
      ),
    );
    _windowPainted[id] = glow;
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
