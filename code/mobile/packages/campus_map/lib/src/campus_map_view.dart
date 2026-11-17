import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' hide Size;

import 'campus_content.dart';
import 'campus_camera_policy.dart';
import 'campus_content_layer.dart';
import 'campus_data_source.dart';
import 'campus_fallback_place_repository.dart';
import 'campus_map_config.dart';
import 'campus_map_controller.dart';
import 'campus_map_controls.dart';
import 'campus_location_service.dart';
import 'campus_place.dart';
import 'campus_place_layer.dart';
import 'campus_place_repository.dart';
import 'campus_poi.dart';
import 'campus_pucstop.dart';
import 'campus_pucstop_layer.dart';
import 'campus_map_defaults.dart';
import 'campus_map_features.dart';
import 'campus_map_lighting.dart';
import 'campus_map_layer_ids.dart';
import 'campus_map_renderer.dart';
import 'campus_route.dart';
import 'campus_route_layer.dart';
import 'campus_saved_layer.dart';
import 'campus_saved_places.dart';
import 'campus_snapshot.dart';
import 'three_d/campus_3d_controller.dart';
import 'three_d/campus_3d_diagnostics.dart';
import 'three_d/campus_3d_layers.dart';
import 'three_d/campus_asset_resolver.dart';
import 'three_d/campus_environment_controller.dart';
import 'three_d/campus_model_manifest.dart';
import 'three_d/campus_pucstop_model.dart';
import 'three_d/campus_totem_spin.dart';

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
    this.pucStopService,
    this.onPucStopClaimed,
    this.pucStopRewardNotice,
    this.contentService,
    this.pointOfInterestCatalog,
    this.savedPlacesStore,
    this.openExternalUrl,
    this.localTime,
    this.canEditPlaces = false,
    this.onEditPlace,
    this.onDownloadPlaceImage,
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

  /// PucStops e coleta (ex.: API do app). Só vale com
  /// `features.pucStops`. Ignorado quando [controller] é fornecido.
  final CampusPucStopService? pucStopService;

  /// Coleta confirmada pelo servidor (ex.: atualizar o XP do app, tocar som).
  final ValueChanged<CampusPucStopClaim>? onPucStopClaimed;

  /// Aviso mostrado antes do giro (ex.: teto de XP do semestre atingido).
  /// `null` = sem aviso.
  final String? Function(CampusPucStop stop)? pucStopRewardNotice;

  /// Eventos, restaurantes e cardápios (ex.: API do app). Só vale com
  /// `features.events`/`features.canteens`. Ignorado quando [controller] é
  /// fornecido.
  final CampusContentService? contentService;

  /// Portarias e alimentação sempre visíveis (pinos do PUCMaps). Ignorado
  /// quando [controller] é fornecido.
  final CampusPointOfInterestCatalog? pointOfInterestCatalog;

  /// Locais salvos no aparelho; sem ele o card não oferece "Salvar local".
  /// Ignorado quando [controller] é fornecido.
  final CampusSavedPlacesStore? savedPlacesStore;

  /// Abre uma URL fora do app (cardápio em PDF). Devolve `false` se não
  /// conseguiu; sem ele o card mostra o endereço para copiar.
  final Future<bool> Function(Uri url)? openExternalUrl;

  /// Relógio local injetável para validação; padrão: relógio do aparelho.
  final DateTime Function()? localTime;

  final bool canEditPlaces;
  final Future<bool> Function(CampusPlace place)? onEditPlace;
  final Future<void> Function(Uri originalUrl)? onDownloadPlaceImage;

  @override
  State<CampusMapView> createState() => _CampusMapViewState();
}

class _CampusMapViewState extends State<CampusMapView>
    with WidgetsBindingObserver, TickerProviderStateMixin
    implements CampusMapCamera, CampusMapZoom {
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
  CampusMapLighting? _lighting;
  CampusCameraPolicy? _cameraPolicy;
  Size _viewport = Size.zero;
  CampusCameraOpening _opening = CampusCameraOpening();
  double _minimumZoom = 0;
  bool _correctingCenter = false;
  Future<void> _boundsQueue = Future.value();

  /// Rota desenhada no momento; redesenhada se o style recarregar.
  CampusRoute? _route;
  Future<void> _routePaint = Future.value();
  Future<void> _categoryPaint = Future.value();

  /// Serializa mutações da mesma source; cada operação revalida a geração.
  Future<void> _paintRoute(Future<void> Function() operation) {
    final result = _routePaint.then((_) => operation());
    _routePaint = result.catchError((_) {});
    return result;
  }

  /// URL do totem instalado neste style (para reconhecer a falha do GLB).
  String? _totemUrl;

  /// Totem instalado neste style: modelo, URL e último `models` enviado
  /// (reenviar recria os modelos nativos e zera o giro do topo).
  CampusPucStopModel? _totemModel;
  Uri? _totemUri;
  String? _pushedTotems;

  // ── Experiência do totem (PUCMaps `_focusTotem`/`_startTopSpin`) ─────────
  String? _focusedStop;
  CameraState? _cameraBeforeFocus;
  final Map<String, double> _topYaw = {};
  late final AnimationController _spin;
  late final AnimationController _reward;
  double _spinFrom = 0;
  double _spinDegrees = 0;
  double _spinEnergy = 0.5;
  bool _spinArmed = false;
  bool _showReward = false;
  bool _focusedCollected = false;
  List<CampusTotemSparkle> _sparkles = const [];
  double? _dragX;
  final List<(Duration, double)> _dragSamples = [];
  bool _yawInFlight = false;
  bool _yawDirty = false;

  bool get _enable3d => widget.config.features.enable3d;
  CampusMapFeatures get _features => widget.config.features;
  bool get _pucStopsEnabled => _features.pucStops && _controller.hasPucStops;
  bool get _contentEnabled =>
      (_features.events || _features.canteens) && _controller.hasContent;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _spin = AnimationController(vsync: this)
      ..addListener(_onSpinTick)
      ..addStatusListener(_onSpinStatus);
    _reward = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..addStatusListener(_onRewardStatus);
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
          placeCatalog: local,
          routeService: widget.routeService,
          pucStopService: widget.pucStopService,
          contentService: widget.contentService,
          pointOfInterestCatalog: widget.pointOfInterestCatalog,
          savedPlacesStore: widget.savedPlacesStore,
        );
    _controller.pucStops.addListener(_refreshPucStops);
    _controller.collectedPucStops.addListener(_refreshPucStops);
    _controller.events.addListener(_refreshContent);
    _controller.categoryFilter.addListener(_refreshCategories);
    _controller.restaurants.addListener(_refreshFilters);
    _controller.contentCardHeight.addListener(_refitRoute);
    _controller.controlsHeight.addListener(_controlsResized);
    _controller.pointsOfInterest.addListener(_refreshPois);
    _controller.contentFilter.addListener(_refreshFilters);
    _controller.selectedPlace.addListener(_refreshSelection);
    _controller.lightMode.addListener(_refreshLight);
    _controller.savedPlaces.addListener(_refreshSaved);
    _controller.savedFilter.addListener(_refreshFilters);
    _controller.selectedPucStop.addListener(_onPucStopFocus);
    _controller.collectedPucStops.addListener(_onCollectedForReward);
  }

  void _releaseController(CampusMapController controller, bool owned) {
    controller.detach(this);
    if (_focusedStop != null) unawaited(_exitTotemFocus());
    if (owned) {
      controller.dispose();
    } else {
      controller.pucStops.removeListener(_refreshPucStops);
      controller.collectedPucStops.removeListener(_refreshPucStops);
      controller.events.removeListener(_refreshContent);
      controller.categoryFilter.removeListener(_refreshCategories);
      controller.restaurants.removeListener(_refreshFilters);
      controller.contentCardHeight.removeListener(_refitRoute);
      controller.controlsHeight.removeListener(_controlsResized);
      controller.pointsOfInterest.removeListener(_refreshPois);
      controller.contentFilter.removeListener(_refreshFilters);
      controller.selectedPlace.removeListener(_refreshSelection);
      controller.lightMode.removeListener(_refreshLight);
      controller.savedPlaces.removeListener(_refreshSaved);
      controller.savedFilter.removeListener(_refreshFilters);
      controller.selectedPucStop.removeListener(_onPucStopFocus);
      controller.collectedPucStops.removeListener(_onCollectedForReward);
    }
  }

  bool Function() _activeNow() {
    final generation = _generation;
    final revision = _styleRevision;
    return () =>
        mounted && generation == _generation && revision == _styleRevision;
  }

  /// Filtro estrutural mudou: só troca os pontos, sem mover a câmera. Um
  /// filtro por vez (PUCMaps): portarias, alimentação e conteúdo saem.
  void _refreshCategories() {
    final map = _map;
    if (map == null || !_styleReady) return;
    final isActive = _activeNow();
    unawaited(_showCategories(map, isActive));
    _refreshFilters();
  }

  /// Chip de Eventos/Onde comer mudou: troca os pontos permanentes e os de
  /// conteúdo, sem mover a câmera.
  void _refreshFilters() {
    _refreshPois();
    _refreshContent();
    _refreshSaved();
  }

  void _refreshSaved() {
    final map = _map;
    if (map == null || !_styleReady) return;
    unawaited(_showSaved(map, _activeNow()));
  }

  /// Salvos aparecem sem filtro e com o chip "Salvos"; somem com outra
  /// categoria/Eventos/Onde comer (um filtro por vez).
  Iterable<CampusPlace> get _visibleSaved =>
      _controller.categoryFilter.value.category != null ||
          _controller.contentFilter.value != null
      ? const []
      : _controller.savedPlaces.value;

  Future<void> _showSaved(MapboxMap map, bool Function() isActive) async {
    try {
      await CampusSavedLayer.show(map.style, _visibleSaved, isActive: isActive);
    } catch (_) {
      // Pinos dos salvos são opcionais: a lista continua no chip.
    }
  }

  void _addSavedInteractions(MapboxMap map) {
    map.addInteraction(
      TapInteraction(FeaturesetDescriptor(layerId: CampusSavedLayer.symbols), (
        feature,
        _,
      ) {
        if (!mounted || !identical(map, _map) || _focusedStop != null) return;
        final id = feature.properties['id'];
        if (id is String) _controller.selectSavedPlace(id);
      }, radius: 12),
      interactionID: CampusSavedLayer.symbols,
    );
  }

  void _refreshPois() {
    final map = _map;
    if (map == null || !_styleReady) return;
    unawaited(_showPois(map, _activeNow()));
  }

  /// Portarias e alimentação. Sem filtro: os dois (como o PUCMaps). "Onde
  /// comer": só alimentação. Categoria ou "Eventos": nenhum. Lanchonete que
  /// já tem cadastro de restaurante (com cardápio) aparece uma vez só, pelo
  /// ponto do restaurante.
  Iterable<CampusPlace> get _visiblePois {
    if (_controller.categoryFilter.value.category != null ||
        _controller.savedFilter.value) {
      return const [];
    }
    final content = _contentEnabled && _features.canteens;
    final restaurantIds = {
      if (content)
        for (final restaurant in _controller.restaurants.value)
          ?restaurant.location?.id,
    };
    return _controller.pointsOfInterest.value.where((place) {
      final kind = CampusPoiKind.fromType(place.type);
      return switch (_controller.contentFilter.value) {
        CampusContentKind.event => false,
        CampusContentKind.restaurant =>
          kind == CampusPoiKind.food && !restaurantIds.contains(place.id),
        null => kind == CampusPoiKind.gate || !restaurantIds.contains(place.id),
      };
    });
  }

  Future<void> _showPois(MapboxMap map, bool Function() isActive) async {
    try {
      await CampusPoiLayer.show(map.style, _visiblePois, isActive: isActive);
    } catch (_) {
      // Pontos permanentes são opcionais: falha não vira aviso de mapa.
    }
  }

  void _addPoiInteractions(MapboxMap map) {
    map.addInteraction(
      TapInteraction(FeaturesetDescriptor(layerId: CampusPoiLayer.symbols), (
        feature,
        _,
      ) {
        if (!mounted || !identical(map, _map) || _focusedStop != null) return;
        final id = feature.properties['id'];
        if (id is String) _controller.selectPointOfInterest(id);
      }, radius: 12),
      interactionID: CampusPoiLayer.symbols,
    );
  }

  /// Contorno do prédio aberto no card (só prédios têm pegada).
  void _refreshSelection() {
    final renderer = _renderer;
    if (renderer == null || !_styleReady) return;
    final place = _controller.selectedPlace.value;
    unawaited(renderer.highlight(place?.id).catchError((_) {}));
  }

  /// Botão "Luz": troca só o preset do Standard e o brilho das janelas.
  void _refreshLight() {
    unawaited(_lighting?.setMode(_controller.lightMode.value));
  }

  /// Botões + e − do PUCMaps: ±1 nível em 300 ms, dentro dos limites do campus.
  @override
  Future<void> zoomBy(double delta) async {
    final map = _map;
    if (map == null || !_styleReady || !_foreground) return;
    final state = await map.getCameraState();
    final zoom = (state.zoom + delta)
        .clamp(_minimumZoom, CampusCameraPolicy.maxZoom)
        .toDouble();
    await map.easeTo(
      CameraOptions(zoom: zoom),
      MapAnimationOptions(duration: 300),
    );
  }

  Future<void> _showCategories(MapboxMap map, bool Function() isActive) {
    final filter = _controller.categoryFilter.value;
    final result = _categoryPaint.then((_) async {
      bool current() =>
          isActive() && identical(filter, _controller.categoryFilter.value);
      if (current()) {
        await CampusPlaceLayer.show(map.style, filter, isActive: current);
      }
    });
    _categoryPaint = result.catchError((_) {});
    return _categoryPaint;
  }

  /// Tocar na própria footprint (inclusive sob o 3D) abre o mesmo card usado
  /// pela busca/categorias. Áreas do campus não são tratadas como prédios.
  void _addBuildingInteractions(MapboxMap map) {
    map.addInteraction(
      TapInteraction(FeaturesetDescriptor(layerId: CampusMapLayerIds.fill), (
        feature,
        _,
      ) {
        if (!mounted || !identical(map, _map) || _focusedStop != null) return;
        final id = feature.properties['id'];
        if (id is String) unawaited(_selectBuilding(map, id));
      }, radius: 2),
      interactionID: '${CampusMapLayerIds.fill}-tap',
    );
  }

  Future<void> _selectBuilding(MapboxMap map, String id) async {
    try {
      final snapshot = await _loadSnapshot();
      if (!mounted || !identical(map, _map) || _focusedStop != null) return;
      for (final feature in snapshot.features) {
        if (feature.id != id) continue;
        final place = feature.toPlace();
        if (place != null && place.kind == CampusPlaceKind.building) {
          _controller.selectPlace(place);
        }
        return;
      }
    } catch (_) {
      // O renderer já apresenta a falha do snapshot; o toque não a duplica.
    }
  }

  void _addCategoryInteractions(MapboxMap map) {
    map.addInteraction(
      TapInteraction(FeaturesetDescriptor(layerId: CampusPlaceLayer.symbols), (
        feature,
        _,
      ) {
        if (!mounted || !identical(map, _map) || _focusedStop != null) return;
        final id = feature.properties['id'];
        if (id is String) _controller.selectCategoryPlace(id);
      }, radius: 12),
      interactionID: CampusPlaceLayer.symbols,
    );
  }

  /// Eventos/restaurantes mudaram: só troca os dados da source.
  void _refreshContent() {
    final map = _map;
    if (map == null || !_styleReady || !_contentEnabled) return;
    final generation = _generation;
    final revision = _styleRevision;
    unawaited(
      _showContent(
        map,
        () =>
            mounted && generation == _generation && revision == _styleRevision,
      ),
    );
  }

  /// Sem filtro, eventos e restaurantes; com "Eventos"/"Onde comer", só o
  /// tipo escolhido; com uma categoria de prédio, nenhum (filtro único).
  Future<void> _showContent(MapboxMap map, bool Function() isActive) async {
    final category =
        _controller.categoryFilter.value.category != null ||
        _controller.savedFilter.value;
    final filter = _controller.contentFilter.value;
    final events =
        _features.events && !category && filter != CampusContentKind.restaurant;
    final restaurants =
        _features.canteens && !category && filter != CampusContentKind.event;
    try {
      await CampusContentLayer.show(
        map.style,
        events ? _controller.events.value : const [],
        restaurants ? _controller.restaurants.value : const [],
        isActive: isActive,
      );
    } catch (_) {
      // Conteúdo é opcional: falha aqui não vira aviso de mapa.
    }
  }

  /// Toque num ponto de evento/restaurante (só nessas camadas): abre o card.
  void _addContentInteractions(MapboxMap map) {
    for (final layerId in CampusContentLayer.pickable) {
      map.addInteraction(
        TapInteraction(FeaturesetDescriptor(layerId: layerId), (feature, _) {
          if (!mounted || !identical(map, _map) || _focusedStop != null) return;
          final id = feature.properties['id'];
          final kind = switch (feature.properties['kind']) {
            CampusContentLayer.event => CampusContentKind.event,
            CampusContentLayer.restaurant => CampusContentKind.restaurant,
            _ => null,
          };
          if (id is! String || kind == null) return;
          if (_controller.content(kind, id) case final item?) {
            _controller.selectContent(item);
          }
        }, radius: 12),
        interactionID: layerId,
      );
    }
  }

  /// Lista ou coletados mudaram: só troca os dados da source.
  void _refreshPucStops() {
    final map = _map;
    if (map == null || !_styleReady || !_pucStopsEnabled) return;
    final generation = _generation;
    final revision = _styleRevision;
    unawaited(
      _showPucStops(
        map,
        () =>
            mounted && generation == _generation && revision == _styleRevision,
      ),
    );
  }

  Future<void> _showPucStops(MapboxMap map, bool Function() isActive) async {
    try {
      await CampusPucStopLayer.show(
        map.style,
        _controller.pucStops.value,
        _controller.collectedPucStops.value,
        isActive: isActive,
      );
      if (isActive()) await _syncTotems(map);
    } catch (_) {
      // PucStops são opcionais: falha aqui não vira aviso de mapa.
    }
  }

  /// Um totem por PucStop, coletado ou não. Só reenvia quando a lista muda.
  Future<void> _syncTotems(MapboxMap map) async {
    final model = _totemModel;
    final url = _totemUri;
    if (model == null || url == null) return;
    final json = jsonEncode(
      CampusPucStopLayer.models(_controller.pucStops.value, model, url),
    );
    if (json == _pushedTotems) return;
    _pushedTotems = json;
    try {
      await CampusPucStopLayer.updateTotems(map.style, json);
    } catch (_) {
      _pushedTotems = null;
      return;
    }
    if (_focusedStop != null) unawaited(_pushTopYaw());
  }

  /// Toque no totem (modelo 3D, ponto, halo ou aura): leva a câmera até ele
  /// e começa a experiência de girar o topo. Nada é coletado no toque.
  void _addPucStopInteractions(MapboxMap map) {
    for (final layerId in [
      ...CampusPucStopLayer.pickable,
      CampusPucStopLayer.totem,
    ]) {
      map.addInteraction(
        TapInteraction(FeaturesetDescriptor(layerId: layerId), (feature, _) {
          if (!mounted || !identical(map, _map) || _focusedStop != null) return;
          // Pontos trazem o id nas propriedades; o modelo, no id da feature.
          final id = feature.properties['id'] ?? feature.id?.id;
          if (id is String && _controller.pucStop(id) != null) {
            _controller.selectPucStop(id);
          }
        }, radius: 12),
        interactionID: layerId,
      );
    }
  }

  // ─── Experiência do totem ────────────────────────────────────────────────

  /// Camadas que somem durante o foco, como no PUCMaps: nada compete com o
  /// totem nem recebe o toque do giro.
  static const _focusHiddenLayers = [
    CampusMapLayerIds.labels,
    CampusPoiLayer.symbols,
    CampusSavedLayer.symbols,
    CampusPlaceLayer.symbols,
    CampusContentLayer.dot,
    CampusContentLayer.label,
    CampusPucStopLayer.label,
  ];

  void _onPucStopFocus() {
    final id = _controller.selectedPucStop.value;
    if (id == _focusedStop) return;
    if (id == null) {
      unawaited(_exitTotemFocus());
      return;
    }
    final stop = _controller.pucStop(id);
    if (stop != null) unawaited(_enterTotemFocus(stop));
  }

  Future<void> _enterTotemFocus(CampusPucStop stop) async {
    _stopSpinEffects();
    setState(() {
      _focusedStop = stop.id;
      _showReward = false;
      _focusedCollected = _controller.collectedPucStops.value.contains(stop.id);
    });
    _topYaw.putIfAbsent(stop.id, () => 0);
    final map = _map;
    if (map == null || !_styleReady || !_foreground) return;
    try {
      _cameraBeforeFocus ??= await map.getCameraState();
      await map.gestures.updateSettings(
        GesturesSettings(
          scrollEnabled: false,
          rotateEnabled: false,
          pitchEnabled: false,
          pinchToZoomEnabled: false,
          doubleTapToZoomInEnabled: false,
          quickZoomEnabled: false,
        ),
      );
      await _setFocusChrome(map, visible: false);
      if (_focusedStop != stop.id) return;
      await map.easeTo(
        CameraOptions(
          center: Point(coordinates: Position(stop.longitude, stop.latitude)),
          zoom: CampusTotemSpin.focusZoom,
          pitch: CampusTotemSpin.focusPitch,
          bearing: CampusTotemSpin.focusBearing,
          padding: MbxEdgeInsets(
            top: _viewport.height * CampusTotemSpin.focusTopFraction,
            left: 16,
            bottom: 90,
            right: 16,
          ),
        ),
        MapAnimationOptions(duration: 700),
      );
      await _pushTopYaw();
    } catch (_) {
      // Mapa recriado durante a animação: o painel continua funcional.
    }
  }

  Future<void> _exitTotemFocus() async {
    final previous = _cameraBeforeFocus;
    _cameraBeforeFocus = null;
    _stopSpinEffects();
    if (mounted) {
      setState(() {
        _focusedStop = null;
        _showReward = false;
      });
    }
    final map = _map;
    if (map == null) return;
    try {
      await _setFocusChrome(map, visible: true);
      await map.gestures.updateSettings(
        GesturesSettings(
          scrollEnabled: true,
          rotateEnabled: true,
          pitchEnabled: true,
          pinchToZoomEnabled: true,
          doubleTapToZoomInEnabled: true,
          quickZoomEnabled: true,
        ),
      );
      if (previous != null && _foreground && _styleReady) {
        await map.easeTo(
          CameraOptions(
            center: previous.center,
            zoom: previous.zoom,
            pitch: previous.pitch,
            bearing: previous.bearing,
            padding: previous.padding,
          ),
          MapAnimationOptions(duration: 600),
        );
      }
    } catch (_) {
      // Mapa descartado ao sair da tela.
    }
  }

  Future<void> _setFocusChrome(MapboxMap map, {required bool visible}) async {
    for (final id in _focusHiddenLayers) {
      if (!await map.style.styleLayerExists(id)) continue;
      await map.style.setStyleLayerProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }
  }

  void _stopSpinEffects() {
    _spinArmed = false;
    _spin.stop();
    _reward.stop();
    _dragX = null;
    _dragSamples.clear();
  }

  void _onPointerDown(PointerDownEvent event) {
    if (_focusedStop == null || _spin.isAnimating) return;
    _dragX = event.localPosition.dx;
    _dragSamples
      ..clear()
      ..add((event.timeStamp, event.localPosition.dx));
  }

  void _onPointerMove(PointerMoveEvent event) {
    if (_focusedStop == null || _dragX == null) return;
    _dragSamples.add((event.timeStamp, event.localPosition.dx));
    final cutoff = event.timeStamp - CampusTotemSpin.sampleWindow;
    _dragSamples.removeWhere((sample) => sample.$1 < cutoff);
  }

  void _onPointerUp(PointerUpEvent _) {
    if (_focusedStop == null || _dragX == null) return;
    final velocity = CampusTotemSpin.releaseVelocity(_dragSamples);
    _dragX = null;
    _dragSamples.clear();
    _startTopSpin(velocity);
  }

  void _onPointerCancel(PointerCancelEvent _) {
    _dragX = null;
    _dragSamples.clear();
  }

  /// Arraste lateral solto com velocidade: o topo gira e freia. Ao parar,
  /// o giro conta como interação (ver [_onSpinStatus]).
  void _startTopSpin(double velocityPxPerMs) {
    final id = _focusedStop;
    if (id == null || _spin.isAnimating) return;
    final spin = CampusTotemSpin.fromVelocity(velocityPxPerMs);
    if (spin == null) return;
    _spinFrom = _topYaw[id] ?? 0;
    _spinDegrees = spin.degrees;
    _spinEnergy = spin.energy;
    _spin.duration = spin.duration;
    _spinArmed = true;
    _reward.stop();
    setState(() => _showReward = false);
    _spin.forward(from: 0);
  }

  void _onSpinTick() {
    final id = _focusedStop;
    if (id == null) return;
    _topYaw[id] = CampusTotemSpin.at(_spinFrom, _spinDegrees, _spin.value);
    unawaited(_pushTopYaw());
  }

  /// Giro terminou: pede a coleta (o servidor decide pelo alcance).
  void _onSpinStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || !_spinArmed) return;
    _spinArmed = false;
    final id = _focusedStop;
    if (id != null) _controller.completePucStopSpin(id);
  }

  /// Coleta confirmada com o totem em foco: explosão de faíscas.
  void _onCollectedForReward() {
    final id = _focusedStop;
    if (id == null) return;
    final collected = _controller.collectedPucStops.value.contains(id);
    if (collected && !_focusedCollected) _playReward();
    _focusedCollected = collected;
  }

  void _playReward() {
    if (!mounted || _focusedStop == null) return;
    _sparkles = CampusTotemSpin.sparkles(_spinEnergy, math.Random());
    setState(() => _showReward = true);
    _reward.forward(from: 0);
  }

  void _onRewardStatus(AnimationStatus status) {
    if (status != AnimationStatus.completed || !mounted || !_showReward) {
      return;
    }
    setState(() => _showReward = false);
  }

  /// Uma chamada nativa por vez; giros durante ela juntam no mais recente.
  Future<void> _pushTopYaw() async {
    final id = _focusedStop;
    final map = _map;
    if (id == null || map == null || _totemModel == null) return;
    if (_yawInFlight) {
      _yawDirty = true;
      return;
    }
    _yawInFlight = true;
    try {
      await map.setFeatureState(
        CampusPucStopLayer.modelSource,
        null,
        id,
        CampusPucStopLayer.topRotation(_topYaw[id] ?? 0),
      );
    } catch (_) {
      // Sem modelo (GLB indisponível): o brilho do giro continua na tela.
    } finally {
      _yawInFlight = false;
      if (_yawDirty && _focusedStop != null) {
        _yawDirty = false;
        unawaited(_pushTopYaw());
      }
    }
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
      _lighting?.pause();
      _controller.detach(this);
      _route = _controller.activeRoute.value;
      unawaited(_disablePuck(_map));
    } else if (_map != null && _styleReady) {
      unawaited(_lighting?.resume());
      _controller.attach(this);
      // Uma pintura interrompida ao pausar pode ter removido a linha antiga.
      // Retoma a rota confirmada, nunca o candidato de uma resposta cancelada.
      unawaited(_restoreConfirmedRoute());
      if (_pucStopsEnabled) unawaited(_controller.reloadPucStops());
      if (_contentEnabled) unawaited(_controller.reloadContent());
    }
  }

  Future<void> _restoreConfirmedRoute() async {
    final route = _controller.activeRoute.value;
    if (route == null) return;
    try {
      await showRoute(route);
    } catch (_) {
      // Falha de renderização não apaga a rota confirmada no controller.
    }
  }

  double get _controlsHeight => _controller.controlsHeight.value > 0
      ? _controller.controlsHeight.value
      : 180;

  void _controlsResized() => unawaited(_refreshCameraLayout());

  MbxEdgeInsets get _routePadding => CampusCameraPolicy.routePadding(
    _viewport,
    bottom: _rodapeReservado(
      semCard: math.max(
        CampusMapDefaults.routePaddingBottom,
        _placeSheetReserve(CampusMapDefaults.placeSheetCollapsed),
      ),
    ),
    sideCard: true,
    controlsHeight: _controlsHeight,
  );

  /// Rodapé coberto pelo bottom sheet do local (só em tela retrato: em
  /// paisagem o card fica numa coluna lateral). [fraction] é a altura do
  /// sheet na posição esperada: padrão ao focar, recolhido com rota.
  double _placeSheetReserve(double fraction) {
    if (_controller.selectedPlace.value == null ||
        CampusCameraPolicy.sideCardWidth(_viewport) != null) {
      return 0;
    }
    return _viewport.height * fraction + CampusMapDefaults.contentCardMargin;
  }

  Future<void> _applyCameraBounds() {
    final map = _map;
    final policy = _cameraPolicy;
    final size = _viewport;
    final generation = _generation;
    final revision = _styleRevision;
    final padding = _route == null
        ? CampusCameraPolicy.overviewPadding(
            size,
            controlsHeight: _controlsHeight,
          )
        : _routePadding;
    final work = _boundsQueue.then((_) async {
      if (map == null ||
          policy == null ||
          size.isEmpty ||
          !mounted ||
          !_foreground ||
          generation != _generation ||
          revision != _styleRevision) {
        return;
      }
      // O fit Mercator é o teto inicial. A perspectiva do SDK pode exigir
      // mais afastamento para não cortar os cantos em telas estreitas.
      final current = _route == null ? null : await map.getCameraState();
      final fit = await map.cameraForCoordinatesPadding(
        policy.corners,
        CameraOptions(
          pitch: current?.pitch ?? (_enable3d ? CampusMapDefaults.pitch3d : 0),
          bearing: current?.bearing ?? 0,
          padding: padding,
        ),
        MbxEdgeInsets(top: 0, left: 0, bottom: 0, right: 0),
        null,
        null,
      );
      if (!mounted ||
          !_foreground ||
          generation != _generation ||
          revision != _styleRevision) {
        return;
      }
      final minimum = math.min(
        policy.minZoom(size, padding),
        fit.zoom ?? CampusCameraPolicy.maxZoom,
      );
      _minimumZoom = minimum;
      await map.setBounds(
        CameraBoundsOptions(
          bounds: policy.mapBounds(size, minimum),
          minZoom: minimum,
          maxZoom: CampusCameraPolicy.maxZoom,
        ),
      );
    });
    _boundsQueue = work.catchError((_) {});
    return work;
  }

  /// O bbox nativo inclui overscan para caber a viewport inclinada/com cards.
  /// Restringir o centro separadamente evita liberar esse espaço para passeio.
  void _constrainCenter(CameraState state) {
    final map = _map;
    final policy = _cameraPolicy;
    if (_correctingCenter || map == null || policy == null || !_foreground) {
      return;
    }
    final p = state.center.coordinates;
    final point = policy.constrain([p.lng.toDouble(), p.lat.toDouble()]);
    if ((point[0] - p.lng).abs() < 1e-7 && (point[1] - p.lat).abs() < 1e-7) {
      return;
    }
    _correctingCenter = true;
    unawaited(
      map
          .setCamera(
            CameraOptions(
              center: Point(coordinates: Position(point[0], point[1])),
            ),
          )
          .catchError((_) {})
          .whenComplete(() => _correctingCenter = false),
    );
  }

  Future<void> _refreshCameraLayout() async {
    final map = _map;
    final generation = _generation;
    final revision = _styleRevision;
    if (map == null || !_styleReady || !_foreground) return;
    bool active() =>
        mounted &&
        generation == _generation &&
        revision == _styleRevision &&
        _foreground;
    try {
      await _applyCameraBounds();
      if (!active()) return;
      final route = _route;
      if (route != null) {
        await _fitRoute(map, route, () => active() && identical(route, _route));
      }
    } catch (_) {
      // Resize pode coincidir com descarte/recriação do style.
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
    padding: CampusCameraPolicy.sideCardWidth(_viewport) != null
        ? _routePadding
        : MbxEdgeInsets(
            top: 0,
            left: 0,
            // Prédio centrado na área livre acima do bottom sheet.
            bottom: _rodapeReservado(
              semCard: _placeSheetReserve(CampusMapDefaults.placeSheetDefault),
            ),
            right: 0,
          ),
  );

  /// Rodapé coberto pelo card aberto. Card de evento/restaurante (até
  /// [CampusMapDefaults.contentCardHeightFraction] da tela): a câmera centraliza
  /// o local e enquadra a rota acima dele. Sem esse card, [semCard].
  double _rodapeReservado({required double semCard}) {
    if (_controller.selectedContent.value == null) return semCard;
    final tela = MediaQuery.sizeOf(context).height;
    final mapa = context.size?.height ?? tela;
    // Altura medida do card; antes da 1ª medição, o máximo dele (estimativa).
    final medida = _controller.contentCardHeight.value;
    final card =
        (medida > 0
            ? medida + CampusMapDefaults.contentCardBottom
            : tela * CampusMapDefaults.contentCardHeightFraction) +
        CampusMapDefaults.contentCardMargin;
    final maximo =
        mapa -
        CampusMapDefaults.routePaddingTop -
        CampusMapDefaults.minVisibleMapHeight;
    return card.clamp(semCard, maximo < semCard ? semCard : maximo);
  }

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

  /// O SDK usa seu provedor nativo para o puck; Geolocator fornece a origem
  /// e confirma desvio. Sem marcador manual nem câmera seguindo cada leitura.
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
    final request = _controller.routeRevision;
    if (map == null || !_foreground || !_styleReady) {
      throw StateError('Mapa indisponível.');
    }
    bool isActive() =>
        mounted &&
        _foreground &&
        generation == _generation &&
        revision == _styleRevision &&
        request == _controller.routeRevision &&
        identical(_route, route);
    _route = route;
    await _enablePuck(map);
    if (!isActive()) return;
    await _paintRoute(() async {
      if (isActive()) {
        await CampusRouteLayer.show(map.style, route, isActive: isActive);
      }
    });
    if (!isActive()) return;
    await _fitRoute(map, route, isActive);
  }

  /// O card mudou de altura com a rota na tela (ex.: ganhou a linha com tempo
  /// e distância): reenquadra para o fim da rota não ficar sob ele.
  void _refitRoute() {
    final map = _map;
    final route = _route;
    if (map == null || route == null || !_styleReady || !_foreground) return;
    if (_controller.contentCardHeight.value <= 0) return;
    final generation = _generation;
    final revision = _styleRevision;
    unawaited(
      _fitRoute(
        map,
        route,
        () =>
            mounted &&
            _foreground &&
            identical(_route, route) &&
            generation == _generation &&
            revision == _styleRevision,
      ).catchError((_) {}),
    );
  }

  Future<void> _fitRoute(
    MapboxMap map,
    CampusRoute route,
    bool Function() isActive,
  ) async {
    await _applyCameraBounds();
    if (!isActive()) return;
    final current = await map.getCameraState();
    if (!isActive()) return;
    // Mantém inclinação e rumo; o espaço reservado cobre busca e card.
    final camera = await map.cameraForCoordinatesPadding(
      [
        for (final c in route.coordinates)
          Point(coordinates: Position(c[0], c[1])),
      ],
      // O espaço reservado vai no padding da câmera (substitui o do foco
      // anterior): o Mapbox devolve a câmera com ele e o centro desloca a rota
      // para a área livre. No padding das coordenadas o rodapé assimétrico era
      // ignorado no centro e o fim da rota ficava sob o card.
      CameraOptions(
        pitch: current.pitch,
        bearing: current.bearing,
        padding: _routePadding,
      ),
      MbxEdgeInsets(top: 0, left: 0, bottom: 0, right: 0),
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
    final request = _controller.routeRevision;
    _route = null;
    final map = _map;
    if (map == null || !_styleReady) return;
    await _applyCameraBounds();
    if (request != _controller.routeRevision || _route != null) return;
    final generation = _generation;
    final revision = _styleRevision;
    await _paintRoute(() async {
      if (mounted &&
          generation == _generation &&
          revision == _styleRevision &&
          request == _controller.routeRevision &&
          _route == null) {
        await CampusRouteLayer.clear(map.style);
      }
    });
    // Remover camadas não redesenha o mapa parado: a linha seguia na tela
    // (ao fechar o card) até o próximo movimento da câmera.
    await map.triggerRepaint();
  }

  /// [padding] sempre explícito: o padding da câmera fica no estado do mapa e
  /// não pode vazar de um foco com card para o próximo movimento.
  Future<void> _flyTo(
    double longitude,
    double latitude,
    double zoom,
    double pitch, {
    MbxEdgeInsets? padding,
  }) async {
    final map = _map;
    if (map == null || !_styleReady || !_foreground) {
      throw StateError('Mapa indisponível.');
    }
    final point =
        _cameraPolicy?.constrain([longitude, latitude]) ??
        [longitude, latitude];
    await map.flyTo(
      CameraOptions(
        center: Point(coordinates: Position(point[0], point[1])),
        zoom: zoom,
        pitch: pitch,
        padding: padding ?? MbxEdgeInsets(top: 0, left: 0, bottom: 0, right: 0),
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
    if (oldWidget.localTime != widget.localTime) {
      _lighting?.dispose();
      _lighting = null;
      if (_map != null && _styleReady) {
        unawaited(_renderCampus(_generation, _styleRevision));
      }
    }
    if (oldWidget.controller != widget.controller ||
        oldWidget.dataSource != widget.dataSource ||
        oldWidget.remotePlaceRepository != widget.remotePlaceRepository ||
        oldWidget.routeService != widget.routeService ||
        oldWidget.pucStopService != widget.pucStopService ||
        oldWidget.contentService != widget.contentService ||
        oldWidget.pointOfInterestCatalog != widget.pointOfInterestCatalog ||
        oldWidget.savedPlacesStore != widget.savedPlacesStore) {
      _releaseController(_controller, oldWidget.controller == null);
      _createController();
      if (_map != null && _styleReady && _foreground) _controller.attach(this);
    }
    if (oldConfig.mapboxAccessToken != config.mapboxAccessToken ||
        oldConfig.effectiveStyleUri != config.effectiveStyleUri ||
        oldConfig.mapAssetsBaseUrl != config.mapAssetsBaseUrl ||
        oldFeatures.enable3d != features.enable3d ||
        oldFeatures.vegetation != features.vegetation ||
        oldFeatures.props != features.props ||
        oldFeatures.pucStops != features.pucStops ||
        oldFeatures.events != features.events ||
        oldFeatures.canteens != features.canteens ||
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
    _lighting?.dispose();
    _focusedStop = null;
    _releaseController(_controller, widget.controller == null);
    _spin.dispose();
    _reward.dispose();
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
    _lighting?.dispose();
    _lighting = null;
    _cameraPolicy = null;
    _opening = CampusCameraOpening();
    _minimumZoom = 0;
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
    _totemUrl = null;
    _totemModel = null;
    _totemUri = null;
    _pushedTotems = null;
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
      final lighting = _lighting ??= CampusMapLighting(
        map.style,
        now: widget.localTime,
        onWindowGlow: (glow) async {
          await _campus3d?.setWindowGlow(glow);
        },
        isActive: () => isActive() && _foreground,
        mode: _controller.lightMode.value,
      );
      await lighting.refresh();
      if (!isActive()) return;
      _cameraPolicy = CampusCameraPolicy(snapshot);
      await _applyCameraBounds();
      if (!isActive()) return;
      final camera = _opening.takeCamera(
        _cameraPolicy!,
        _viewport,
        minimumZoom: _minimumZoom,
        enable3d: _enable3d,
        controlsHeight: _controlsHeight,
      );
      if (camera != null && _route == null) await map.setCamera(camera);
      await renderer.render(snapshot, isActive: isActive);
      // Style novo apaga sources: a rota em exibição volta a ser desenhada.
      if (_route case final route? when isActive()) {
        await _paintRoute(() async {
          bool current() => isActive() && identical(_route, route);
          if (current()) {
            await CampusRouteLayer.show(map.style, route, isActive: current);
          }
        });
      }
      // Pontos 2D (source criada mesmo vazia; os dados chegam depois).
      if (isActive()) await _showCategories(map, isActive);
      // Portarias e alimentação (source criada vazia; dados chegam depois).
      if (isActive()) {
        await _showPois(map, isActive);
        await _showSaved(map, isActive);
        unawaited(_controller.loadPointsOfInterest());
        unawaited(_controller.loadSavedPlaces());
      }
      // Style novo: o prédio aberto no card volta a ser destacado.
      if (_controller.selectedPlace.value case final place? when isActive()) {
        await renderer.highlight(place.id).catchError((_) {});
      }
      if (_pucStopsEnabled && isActive()) {
        await _showPucStops(map, isActive);
        unawaited(_controller.loadPucStops());
      }
      if (_contentEnabled && isActive()) {
        await _showContent(map, isActive);
        unawaited(_controller.loadContent());
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
        windowGlow: _lighting?.windowGlow ?? 0,
      );
      _campus3d = controller;
      diagnostics?.buildings = controller;
      await controller.install();
      await _startEnvironment(map, manifest, resolver, isActive);
      await _installTotem(map, manifest, resolver, isActive);
    } catch (_) {
      _set3dUnavailable(isActive);
    }
  }

  /// Totem 3D dos PucStops: decorativo. Sem modelo no manifesto, ou com o GLB
  /// indisponível, os pontos 2D continuam e o toque segue funcionando.
  Future<void> _installTotem(
    MapboxMap map,
    CampusModelManifest manifest,
    CampusAssetResolver resolver,
    bool Function() isActive,
  ) async {
    final model = manifest.pucStopModel;
    if (!_pucStopsEnabled || model == null || !isActive()) return;
    try {
      final url = resolver.resolve(model.path);
      _totemUrl = url.toString();
      _totemModel = model;
      _totemUri = url;
      final stops = _controller.pucStops.value;
      _pushedTotems = jsonEncode(CampusPucStopLayer.models(stops, model, url));
      await CampusPucStopLayer.installTotem(
        map.style,
        model,
        url,
        stops,
        isActive: isActive,
      );
      // A lista pode ter chegado durante a instalação.
      if (isActive()) await _syncTotems(map);
    } catch (_) {
      _totemUrl = null;
      _totemModel = null;
      _totemUri = null;
      _pushedTotems = null;
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
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = constraints.biggest;
        if (size != _viewport) {
          _viewport = size;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            // Resize/teclado preservam a exploração; só a rota é reenquadrada.
            if (mounted) {
              unawaited(_refreshCameraLayout());
            }
          });
        }
        return SizedBox.expand(
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Arraste lateral durante o foco no totem gira o topo (o mapa
              // está com os gestos desligados); fora do foco, nada muda.
              Listener(
                onPointerDown: _onPointerDown,
                onPointerMove: _onPointerMove,
                onPointerUp: _onPointerUp,
                onPointerCancel: _onPointerCancel,
                child: MapWidget(
                  key: ValueKey(generation),
                  styleUri: widget.config.effectiveStyleUri,
                  onMapCreated: (map) {
                    if (!mounted || generation != _generation) return;
                    _map = map;
                    _diagnostics?.attach(map);
                    _addBuildingInteractions(map);
                    _addCategoryInteractions(map);
                    _addPoiInteractions(map);
                    _addSavedInteractions(map);
                    if (_features.pucStops) _addPucStopInteractions(map);
                    if (_features.events || _features.canteens) {
                      _addContentInteractions(map);
                    }
                    if (_styleReady) _renderCampus(generation, _styleRevision);
                  },
                  onStyleLoadedListener: (_) {
                    if (!mounted || generation != _generation) return;
                    _styleReady = true;
                    _lighting?.dispose();
                    _lighting = null;
                    _controller.detach(this);
                    _route = _controller.activeRoute.value;
                    unawaited(_disablePuck(_map));
                    _styleRevision++;
                    _renderer = null;
                    _totemUrl = null;
                    _totemModel = null;
                    _totemUri = null;
                    _pushedTotems = null;
                    // Style novo perde camadas e gestos do foco: sai do totem.
                    if (_focusedStop != null) _controller.selectPucStop(null);
                    _diagnostics?.mark('style carregado');
                    // Um novo style descarta sources/layers; o 3D recomeça nele.
                    _dispose3d();
                    _renderCampus(generation, _styleRevision);
                  },
                  // Não usa `idle`: com um GLB indisponível o Mapbox não volta a
                  // ficar ocioso. A câmera parada por um instante basta.
                  onCameraChangeListener: (event) {
                    if (!mounted || generation != _generation) return;
                    _constrainCenter(event.cameraState);
                    if (_campus3d == null) return;
                    _campus3d?.onCameraChanged();
                    _cameraSettle?.cancel();
                    _cameraSettle = Timer(Campus3dLod.cameraSettle, () {
                      if (!mounted || generation != _generation) return;
                      _campus3d?.onCameraIdle();
                    });
                  },
                  viewport: _opening.initialViewport(enable3d: _enable3d),
                  onMapLoadErrorListener: (event) {
                    if (!mounted || generation != _generation) return;
                    // Totem indisponível: some só ele; os pontos 2D ficam.
                    if (_totemUrl case final url?
                        when event.message.contains(url)) {
                      _totemUrl = null;
                      _totemModel = null;
                      _totemUri = null;
                      _pushedTotems = null;
                      final map = _map;
                      if (map != null) {
                        unawaited(
                          CampusPucStopLayer.removeTotem(map.style)
                              .catchError((_) {}),
                        );
                      }
                      return;
                    }
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
                  onResourceRequestListener: !_enable3d && _diagnostics == null
                      ? null
                      : (event) {
                          if (!mounted || generation != _generation) return;
                          _diagnostics?.onResource(event);
                          if (!event.cancelled &&
                              event.response != null &&
                              event.response!.error == null) {
                            _campus3d?.onModelDownloaded(event.request.url);
                          }
                        },
                ),
              ),
              if (_focusedStop != null)
                Positioned.fill(
                  child: IgnorePointer(
                    child: AnimatedBuilder(
                      animation: Listenable.merge([_spin, _reward]),
                      builder: (context, _) => CustomPaint(
                        key: const Key('campus-totem-effects'),
                        painter: CampusTotemRewardPainter(
                          spinProgress: _spin.isAnimating ? _spin.value : -1,
                          rewardProgress: _showReward ? _reward.value : -1,
                          energy: _spinEnergy,
                          sparkles: _sparkles,
                        ),
                      ),
                    ),
                  ),
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
              CampusMapControls(
                controller: _controller,
                onPucStopClaimed: widget.onPucStopClaimed,
                pucStopRewardNotice: widget.pucStopRewardNotice,
                showEvents: _features.events,
                showRestaurants: _features.canteens,
                openExternalUrl: widget.openExternalUrl,
                canEditPlaces: widget.canEditPlaces,
                onEditPlace: widget.onEditPlace,
                onDownloadPlaceImage: widget.onDownloadPlaceImage,
              ),
            ],
          ),
        );
      },
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
