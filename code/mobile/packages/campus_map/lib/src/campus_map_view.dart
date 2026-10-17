import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_data_source.dart';
import 'campus_map_config.dart';
import 'campus_map_defaults.dart';
import 'campus_map_features.dart';
import 'campus_map_renderer.dart';
import 'campus_snapshot.dart';
import 'three_d/campus_3d_controller.dart';
import 'three_d/campus_3d_diagnostics.dart';
import 'three_d/campus_3d_layers.dart';
import 'three_d/campus_asset_resolver.dart';
import 'three_d/campus_environment_controller.dart';
import 'three_d/campus_model_manifest.dart';

/// Mapa anônimo do campus. O token deve ser público e fornecido externamente.
class CampusMapView extends StatefulWidget {
  const CampusMapView({
    super.key,
    required this.config,
    this.dataSource = const LocalCampusDataSource(),
    this.modelManifestSource = const LocalCampusModelManifestSource(),
  });

  final CampusMapConfig config;
  final CampusDataSource dataSource;
  final CampusModelManifestSource modelManifestSource;

  @override
  State<CampusMapView> createState() => _CampusMapViewState();
}

class _CampusMapViewState extends State<CampusMapView> {
  String? _configurationError;
  bool _loadError = false;
  bool _campusError = false;
  bool _models3dUnavailable = false;
  int _generation = 0;
  int _styleRevision = 0;
  bool _styleReady = false;
  MapboxMap? _map;
  CampusMapRenderer? _renderer;
  Campus3dController? _campus3d;
  final List<CampusEnvironmentController> _environment = [];
  Campus3dDiagnostics? _diagnostics;
  Future<CampusSnapshot>? _snapshot;
  Future<CampusModelManifest>? _modelManifest;
  Timer? _cameraSettle;

  bool get _enable3d => widget.config.features.enable3d;
  CampusMapFeatures get _features => widget.config.features;

  @override
  void initState() {
    super.initState();
    _configure();
  }

  @override
  void didUpdateWidget(covariant CampusMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldConfig = oldWidget.config;
    final config = widget.config;
    final oldFeatures = oldConfig.features;
    final features = config.features;
    if (oldConfig.mapboxAccessToken != config.mapboxAccessToken ||
        oldConfig.effectiveStyleUri != config.effectiveStyleUri ||
        oldConfig.mapAssetsBaseUrl != config.mapAssetsBaseUrl ||
        oldFeatures.enable3d != features.enable3d ||
        oldFeatures.vegetation != features.vegetation ||
        oldFeatures.props != features.props ||
        oldFeatures.diagnostics != features.diagnostics ||
        oldWidget.dataSource != widget.dataSource ||
        oldWidget.modelManifestSource != widget.modelManifestSource) {
      _generation++;
      _configure();
    }
  }

  @override
  void dispose() {
    _cameraSettle?.cancel();
    _dispose3d();
    _diagnostics?.dispose();
    super.dispose();
  }

  /// Controllers pertencem a um style: troca de style/tela recomeça do zero.
  void _dispose3d() {
    _campus3d?.dispose();
    _campus3d = null;
    for (final environment in _environment) {
      environment.dispose();
    }
    _environment.clear();
    _diagnostics?.buildings = null;
    _diagnostics?.environment.clear();
  }

  void _configure() {
    _loadError = false;
    _campusError = false;
    _models3dUnavailable = false;
    _styleReady = false;
    _map = null;
    _renderer = null;
    _cameraSettle?.cancel();
    _dispose3d();
    _diagnostics?.dispose();
    _diagnostics = null;
    _snapshot = null;
    _modelManifest = null;
    final token = widget.config.mapboxAccessToken.trim();
    if (token.isEmpty) {
      _configurationError =
          'Mapa indisponível neste ambiente.\n'
          'Configure MAPBOX_ACCESS_TOKEN para carregar o mapa.';
      return;
    }
    if (!token.startsWith('pk.')) {
      _configurationError =
          'Mapa indisponível neste ambiente.\n'
          'Configure um token público do Mapbox em MAPBOX_ACCESS_TOKEN.';
      return;
    }
    if (kIsWeb ||
        (defaultTargetPlatform != TargetPlatform.android &&
            defaultTargetPlatform != TargetPlatform.iOS)) {
      _configurationError = 'Mapa disponível apenas no Android e iOS.';
      return;
    }
    _configurationError = null;
    // A API oficial mantém o token no SDK; não o copiamos para estado global.
    // Executado antes do MapWidget, somente ao montar ou mudar a configuração.
    MapboxOptions.setAccessToken(token);
    if (_features.diagnostics) _diagnostics = Campus3dDiagnostics();
  }

  Future<void> _renderCampus(int generation, int revision) async {
    final map = _map;
    if (map == null || !_styleReady) return;
    final renderer = _renderer ??= CampusMapRenderer(
      map.style,
      clipBasemapModels: _enable3d,
    );
    bool isActive() =>
        mounted && generation == _generation && revision == _styleRevision;
    try {
      // Parsing uma vez por tela, só depois do style ficar pronto.
      final snapshot = await (_snapshot ??= widget.dataSource.load());
      if (!isActive()) return;
      await renderer.render(snapshot, isActive: isActive);
      if (isActive()) _diagnostics?.mark('2d pronto');
      if (isActive() && _campusError) setState(() => _campusError = false);
    } catch (_) {
      // Falhas do bundle/parsing/style são controladas; não expor URLs do SDK.
      if (isActive()) setState(() => _campusError = true);
      return;
    }
    if (_enable3d && isActive()) await _start3d(map, isActive);
  }

  /// O 3D depende do 2D (usa a source das footprints). Qualquer falha aqui
  /// deixa o mapa 2D intacto.
  Future<void> _start3d(MapboxMap map, bool Function() isActive) async {
    if (_campus3d != null) return;
    try {
      final manifest = await (_modelManifest ??= widget.modelManifestSource
          .load());
      if (!isActive() || _campus3d != null) return;
      final resolver = Campus3dController.resolverFor(widget.config, manifest);
      if (resolver == null) {
        _set3dUnavailable(isActive);
        return;
      }
      final diagnostics = _diagnostics
        ?..bind(manifest, resolver.versionRoot.toString());
      final controller = Campus3dController(
        map: map,
        manifest: manifest,
        resolver: resolver,
        isActive: isActive,
        onEvent: diagnostics?.mark,
      );
      _campus3d = controller;
      diagnostics?.buildings = controller;
      await controller.install();
      await _startEnvironment(map, manifest, resolver, isActive);
    } catch (_) {
      _set3dUnavailable(isActive);
    }
  }

  /// Vegetação e props depois dos prédios, cada seção isolada: uma falha não
  /// mexe nos prédios nem na outra seção, e não mostra aviso ao usuário.
  Future<void> _startEnvironment(
    MapboxMap map,
    CampusModelManifest manifest,
    CampusAssetResolver resolver,
    bool Function() isActive,
  ) async {
    for (final set in CampusEnvironmentController.enabledSets(
      _features,
      manifest,
    )) {
      if (!isActive()) return;
      final environment = CampusEnvironmentController(
        map: map,
        set: set,
        resolver: resolver,
        isActive: isActive,
        onEvent: (event) => _diagnostics?.mark('${set.name}:$event'),
      );
      _environment.add(environment);
      _diagnostics?.environment.add(environment);
      await environment.install();
    }
  }

  void _set3dUnavailable(bool Function() isActive) {
    if (isActive() && !_models3dUnavailable) {
      setState(() => _models3dUnavailable = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_configurationError case final message?) {
      return _MapStatus(message: message);
    }

    final generation = _generation;
    final notice = _loadError
        ? 'Não foi possível carregar o mapa.\n'
              'Verifique a conexão e a configuração do Mapbox.'
        : _campusError
        ? 'Não foi possível carregar os dados do campus.'
        : _models3dUnavailable
        ? 'Prédios 3D indisponíveis neste ambiente.'
        : null;
    return SizedBox.expand(
      child: Stack(
        fit: StackFit.expand,
        children: [
          MapWidget(
            key: ValueKey(generation),
            styleUri: widget.config.effectiveStyleUri,
            onMapCreated: (map) {
              if (!mounted || generation != _generation) return;
              _map = map;
              _diagnostics?.attach(map);
              if (_styleReady) _renderCampus(generation, _styleRevision);
            },
            onStyleLoadedListener: (_) {
              if (!mounted || generation != _generation) return;
              _styleReady = true;
              _styleRevision++;
              _renderer = null;
              _diagnostics?.mark('style carregado');
              // Um novo style descarta sources/layers; o 3D recomeça nele.
              _dispose3d();
              _renderCampus(generation, _styleRevision);
            },
            // Não usa `idle`: com um GLB indisponível o Mapbox não volta a
            // ficar ocioso. A câmera parada por um instante basta.
            onCameraChangeListener: (_) {
              if (_campus3d == null) return;
              _cameraSettle?.cancel();
              _cameraSettle = Timer(Campus3dLod.cameraSettle, () {
                if (!mounted || generation != _generation) return;
                _campus3d?.onCameraIdle();
              });
            },
            viewport: CameraViewportState(
              center: Point(
                coordinates: Position(
                  CampusMapDefaults.longitude,
                  CampusMapDefaults.latitude,
                ),
              ),
              zoom: CampusMapDefaults.zoom,
              pitch: _enable3d
                  ? CampusMapDefaults.pitch3d
                  : CampusMapDefaults.pitch,
              bearing: CampusMapDefaults.bearing,
            ),
            onMapLoadErrorListener: (event) {
              if (!mounted || generation != _generation) return;
              // Ambiente é decorativo: falha nele não vira aviso de mapa.
              final environment = _environment.where(
                (e) => e.owns(event.sourceId, event.message),
              );
              if (environment.isNotEmpty) {
                environment.first.onLoadError();
                return;
              }
              // Falha de um GLB: só aquela região volta à extrusão.
              if (Campus3dLayerIds.owns(event.sourceId)) {
                _campus3d?.onSourceError(event.sourceId!);
                return;
              }
              if (_loadError) return;
              // Não exibir/logar mensagens do SDK: podem conter URLs e tokens.
              setState(() => _loadError = true);
            },
            onMapLoadedListener: (_) {
              if (!mounted || generation != _generation) return;
              _diagnostics?.mark('mapa: loaded');
              if (!_loadError) return;
              setState(() => _loadError = false);
            },
            // Só no modo diagnóstico: sem custo por frame para o usuário comum.
            onRenderFrameFinishedListener: _diagnostics == null
                ? null
                : (event) => _diagnostics?.onFrame(event),
            onResourceRequestListener: _diagnostics == null
                ? null
                : (event) => _diagnostics?.onResource(event),
          ),
          if (_diagnostics case final diagnostics?)
            // No topo: logo e atribuição do Mapbox (rodapé) continuam visíveis.
            Positioned(
              left: 8,
              top: 8,
              right: 8,
              child: Campus3dDiagnosticsPanel(diagnostics: diagnostics),
            ),
          if (notice != null)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Material(
                color: Theme.of(context).colorScheme.surface,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(notice, textAlign: TextAlign.center),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MapStatus extends StatelessWidget {
  const _MapStatus({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
