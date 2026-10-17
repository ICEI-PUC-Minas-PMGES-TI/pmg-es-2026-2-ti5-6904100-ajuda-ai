import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_data_source.dart';
import 'campus_fallback_place_repository.dart';
import 'campus_map_config.dart';
import 'campus_map_controller.dart';
import 'campus_map_controls.dart';
import 'campus_location_service.dart';
import 'campus_place.dart';
import 'campus_place_repository.dart';
import 'campus_map_defaults.dart';
import 'campus_map_features.dart';
import 'campus_map_renderer.dart';
import 'campus_route.dart';
import 'campus_route_layer.dart';
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
    this.controller,
    this.remotePlaceRepository,
    this.routeService,
  });

  final CampusMapConfig config;
  final CampusDataSource dataSource;
  final CampusModelManifestSource modelManifestSource;

  /// Opcional. Se fornecido, seu dono deve descartá-lo ao sair da tela.
  final CampusMapController? controller;

  /// Busca preferida (ex.: API do app). Com ela, a busca do mapa usa
  /// [FallbackCampusPlaceRepository]: remota primeiro, snapshot local se
  /// falhar. Ignorada quando [controller] é fornecido.
  final CampusPlaceRepository? remotePlaceRepository;

  /// Cálculo de rota (ex.: API do app). Sem ele o card não oferece rota.
  /// Ignorado quando [controller] é fornecido.
  final CampusRouteService? routeService;

  @override
  State<CampusMapView> createState() => _CampusMapViewState();
}

class _CampusMapViewState extends State<CampusMapView>
    with WidgetsBindingObserver
    implements CampusMapCamera {
  late CampusMapController _controller;
  bool _foreground = true;
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

  /// Rota desenhada no momento; redesenhada se o style recarregar.
  CampusRoute? _route;

  bool get _enable3d => widget.config.features.enable3d;
  CampusMapFeatures get _features => widget.config.features;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _createController();
    _configure();
  }

  void _createController() {
    final local = LocalCampusPlaceRepository(loadSnapshot: _loadSnapshot);
    final remote = widget.remotePlaceRepository;
    _controller =
        widget.controller ??
        CampusMapController(
          placeRepository: remote == null
              ? local
              : FallbackCampusPlaceRepository(primary: remote, fallback: local),
          routeService: widget.routeService,
        );
  }

  Future<CampusSnapshot> _loadSnapshot() => _snapshot ??= _readSnapshot();

  Future<CampusSnapshot> _readSnapshot() async {
    try {
      return await widget.dataSource.load();
    } catch (_) {
      _snapshot = null;
      rethrow;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // A caixa de permissão causa inactive: não cancelar a própria solicitação.
    if (state == AppLifecycleState.inactive) return;
    _foreground = state == AppLifecycleState.resumed;
    if (!_foreground) {
      _controller.detach(this);
      unawaited(_disablePuck(_map));
    } else if (_map != null && _styleReady) {
      _controller.attach(this);
    }
  }

  Future<void> _disablePuck(MapboxMap? map) async {
    try {
      await map?.location.updateSettings(
        LocationComponentSettings(enabled: false),
      );
    } catch (_) {
      // A platform view pode já ter sido descartada.
    }
  }

  @override
  Future<void> focus(CampusPlace place) => _flyTo(
    place.center[0],
    place.center[1],
    CampusMapDefaults.placeZoom,
    _enable3d ? CampusMapDefaults.pitch3d : CampusMapDefaults.pitch,
  );

  @override
  Future<void> showUser(CampusUserLocation location) async {
    final map = _map;
    final generation = _generation;
    final revision = _styleRevision;
    if (map == null || !_foreground || !_styleReady) {
      throw StateError('Mapa indisponível.');
    }
    await _enablePuck(map);
    if (!mounted ||
        !_foreground ||
        generation != _generation ||
        revision != _styleRevision) {
      await _disablePuck(map);
      return;
    }
    await _flyTo(
      location.longitude,
      location.latitude,
      CampusMapDefaults.userZoom,
      _enable3d ? CampusMapDefaults.userPitch3d : CampusMapDefaults.pitch,
    );
  }

  /// O SDK usa seu provedor nativo para o puck; Geolocator só obtém a
  /// posição de centralização. Sem marcador manual nem câmera seguindo GPS.
  Future<void> _enablePuck(MapboxMap map) => map.location.updateSettings(
    LocationComponentSettings(
      enabled: true,
      showAccuracyRing: true,
      puckBearingEnabled: false,
      locationPuck: LocationPuck(locationPuck2D: DefaultLocationPuck2D()),
    ),
  );

  @override
  Future<void> showRoute(CampusRoute route) async {
    final map = _map;
    final generation = _generation;
    final revision = _styleRevision;
    if (map == null || !_foreground || !_styleReady) {
      throw StateError('Mapa indisponível.');
    }
    bool isActive() =>
        mounted &&
        _foreground &&
        generation == _generation &&
        revision == _styleRevision;
    _route = route;
    await _enablePuck(map);
    if (!isActive()) return;
    await CampusRouteLayer.show(map.style, route, isActive: isActive);
    if (!isActive()) return;
    final current = await map.getCameraState();
    if (!isActive()) return;
    // Mantém inclinação e rumo; o espaço reservado cobre busca e card.
    final camera = await map.cameraForCoordinatesPadding(
      [
        for (final c in route.coordinates)
          Point(coordinates: Position(c[0], c[1])),
      ],
      CameraOptions(pitch: current.pitch, bearing: current.bearing),
      MbxEdgeInsets(
        top: CampusMapDefaults.routePaddingTop,
        left: CampusMapDefaults.routePaddingSide,
        bottom: CampusMapDefaults.routePaddingBottom,
        right: CampusMapDefaults.routePaddingSide,
      ),
      CampusMapDefaults.routeMaxZoom,
      null,
    );
    if (!isActive()) return;
    await map.flyTo(
      camera,
      MapAnimationOptions(duration: CampusMapDefaults.cameraDurationMs),
    );
  }

  @override
  Future<void> clearRoute() async {
    _route = null;
    final map = _map;
    if (map == null || !_styleReady) return;
    await CampusRouteLayer.clear(map.style);
  }

  Future<void> _flyTo(
    double longitude,
    double latitude,
    double zoom,
    double pitch,
  ) async {
    final map = _map;
    if (map == null || !_styleReady || !_foreground) {
      throw StateError('Mapa indisponível.');
    }
    await map.flyTo(
      CameraOptions(
        center: Point(coordinates: Position(longitude, latitude)),
        zoom: zoom,
        pitch: pitch,
      ),
      MapAnimationOptions(duration: CampusMapDefaults.cameraDurationMs),
    );
  }

  @override
  void didUpdateWidget(covariant CampusMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldConfig = oldWidget.config;
    final config = widget.config;
    final oldFeatures = oldConfig.features;
    final features = config.features;
    if (oldWidget.controller != widget.controller ||
        oldWidget.dataSource != widget.dataSource ||
        oldWidget.remotePlaceRepository != widget.remotePlaceRepository ||
        oldWidget.routeService != widget.routeService) {
      _controller.detach(this);
      if (oldWidget.controller == null) _controller.dispose();
      _createController();
      if (_map != null && _styleReady && _foreground) _controller.attach(this);
    }
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
    WidgetsBinding.instance.removeObserver(this);
    _controller.detach(this);
    if (widget.controller == null) _controller.dispose();
    unawaited(_disablePuck(_map));
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
    _controller.detach(this);
    unawaited(_disablePuck(_map));
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
    _route = null;
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
      final snapshot = await _loadSnapshot();
      if (!isActive()) return;
      await renderer.render(snapshot, isActive: isActive);
      // Style novo apaga sources: a rota em exibição volta a ser desenhada.
      if (_route case final route? when isActive()) {
        await CampusRouteLayer.show(map.style, route, isActive: isActive);
      }
      if (isActive() && _foreground) _controller.attach(this);
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
              _controller.detach(this);
              unawaited(_disablePuck(_map));
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
              top: 90,
              right: 8,
              child: Campus3dDiagnosticsPanel(diagnostics: diagnostics),
            ),
          if (notice != null)
            Positioned(
              bottom: 110,
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
          CampusMapControls(controller: _controller),
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
