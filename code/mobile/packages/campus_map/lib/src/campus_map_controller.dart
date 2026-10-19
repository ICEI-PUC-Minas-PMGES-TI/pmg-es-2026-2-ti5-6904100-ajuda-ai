import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'campus_content.dart';
import 'campus_location_service.dart';
import 'campus_place.dart';
import 'campus_place_category.dart';
import 'campus_place_repository.dart';
import 'campus_pucstop.dart';
import 'campus_route.dart';
import 'campus_route_deviation.dart';

Duration Function() _monotonicClock() {
  final clock = Stopwatch()..start();
  return () => clock.elapsed;
}

/// Ponte pequena para a câmera; permite testar sem a engine nativa.
abstract interface class CampusMapCamera {
  Future<void> focus(CampusPlace place);
  Future<void> showUser(CampusUserLocation location);

  /// Desenha a linha (substituindo a anterior) e enquadra a rota.
  Future<void> showRoute(CampusRoute route);
  Future<void> clearRoute();
}

/// Resultado de [CampusMapController.routeTo]: exatamente um caso vale.
class CampusRouteResult {
  const CampusRouteResult.shown(CampusRoute this.route)
    : location = null,
      failure = null,
      cancelled = false;
  const CampusRouteResult.location(CampusLocationStatus this.location)
    : route = null,
      failure = null,
      cancelled = false;
  const CampusRouteResult.failed(CampusRouteFailure this.failure)
    : route = null,
      location = null,
      cancelled = false;

  /// Substituído por outro pedido, rota limpa ou tela fechada no meio.
  const CampusRouteResult.cancelled()
    : route = null,
      location = null,
      failure = null,
      cancelled = true;

  final CampusRoute? route;

  /// Não foi possível obter a origem (permissão, GPS, mapa indisponível).
  final CampusLocationStatus? location;
  final CampusRouteFailure? failure;
  final bool cancelled;
}

/// Resultado de [CampusMapController.claimPucStop]: exatamente um caso vale.
class CampusPucStopResult {
  const CampusPucStopResult.claimed(CampusPucStopClaim this.claim)
    : failure = null,
      distanceMeters = null,
      location = null,
      cancelled = false;
  const CampusPucStopResult.failed(
    CampusPucStopFailure this.failure, {
    this.distanceMeters,
  }) : claim = null,
       location = null,
       cancelled = false;
  const CampusPucStopResult.location(CampusLocationStatus this.location)
    : claim = null,
      failure = null,
      distanceMeters = null,
      cancelled = false;

  /// Outro pedido, troca de PucStop ou tela fechada no meio.
  const CampusPucStopResult.cancelled()
    : claim = null,
      failure = null,
      distanceMeters = null,
      location = null,
      cancelled = true;

  final CampusPucStopClaim? claim;
  final CampusPucStopFailure? failure;

  /// Distância medida pelo servidor numa recusa por alcance.
  final double? distanceMeters;

  /// Não foi possível ler a posição (permissão, GPS, mapa indisponível).
  final CampusLocationStatus? location;
  final bool cancelled;
}

/// Estado de uma lista de conteúdo (eventos ou restaurantes) para a tela.
enum CampusContentStatus {
  /// Ainda não pedida.
  idle,

  /// Primeira carga em andamento (sem lista anterior).
  loading,

  /// Lista válida (pode ser vazia).
  ready,

  /// Falhou sem lista anterior: a tela oferece "Tentar novamente".
  failed,
}

/// Um controller por tela, sem histórico de localização nem estado global.
/// A confirmação de desvio usa uma amostra efêmera, descartada ao parar.
class CampusMapController {
  CampusMapController({
    CampusPlaceRepository? placeRepository,
    this.placeCatalog,
    CampusLocationService? locationService,
    this.routeService,
    this.pucStopService,
    this.contentService,
    Duration Function()? elapsed,
  }) : placeRepository = placeRepository ?? LocalCampusPlaceRepository(),
       locationService = locationService ?? GeolocatorCampusLocationService(),
       _elapsed = elapsed ?? _monotonicClock();

  final CampusPlaceRepository placeRepository;
  final CampusPlaceCatalog? placeCatalog;
  late final CampusPlaceCatalog _catalog =
      placeCatalog ??
      switch (placeRepository) {
        CampusPlaceCatalog catalog => catalog,
        _ => LocalCampusPlaceRepository(),
      };
  final CampusLocationService locationService;

  /// Sem serviço não há rota: o pacote não calcula rota local.
  final CampusRouteService? routeService;

  /// Rota confirmada, inclusive depois de recálculo; sem histórico GPS.
  final ValueNotifier<CampusRoute?> activeRoute = ValueNotifier(null);
  final Duration Function() _elapsed;
  CampusRouteTarget? _routeTarget;
  bool _routeAccessible = false;
  StreamSubscription<CampusUserLocation>? _routePositions;
  int _positionGeneration = 0;
  int? _automaticRequest;
  Duration _nextAutomatic = Duration.zero;
  Duration? _lastPositionCheck;
  Duration? _outsideSince;
  Duration? _lastOutside;
  CampusUserLocation? _outsideStart;

  /// A view usa a revisão para invalidar pintura nativa já em andamento.
  int get routeRevision => _routeRequest;

  /// Sem serviço não há PucStops no mapa.
  final CampusPucStopService? pucStopService;

  /// PucStops ativos carregados por [loadPucStops] (vazio até lá ou sem rede).
  final ValueNotifier<List<CampusPucStop>> pucStops = ValueNotifier(const []);

  /// Ids já coletados pelo usuário (do servidor + coletas desta tela).
  final ValueNotifier<Set<String>> collectedPucStops = ValueNotifier(const {});

  /// PucStop tocado no mapa (abre o card); `null` fecha.
  final ValueNotifier<String?> selectedPucStop = ValueNotifier(null);

  /// Sem serviço não há eventos nem restaurantes no mapa.
  final CampusContentService? contentService;

  /// Eventos ativos e restaurantes carregados por [loadContent].
  final ValueNotifier<List<CampusEvent>> events = ValueNotifier(const []);
  final ValueNotifier<List<CampusRestaurant>> restaurants = ValueNotifier(
    const [],
  );
  final ValueNotifier<CampusContentStatus> eventsStatus = ValueNotifier(
    CampusContentStatus.idle,
  );
  final ValueNotifier<CampusContentStatus> restaurantsStatus = ValueNotifier(
    CampusContentStatus.idle,
  );

  /// Evento/restaurante aberto no card. Um card por vez: exclusivo com o do
  /// PucStop (e a tela fecha a busca/rota ao abrir).
  final ValueNotifier<CampusContent?> selectedContent = ValueNotifier(null);

  /// Altura real da busca e dos atalhos, em pontos de tela.
  final ValueNotifier<double> controlsHeight = ValueNotifier(0);

  /// Altura medida do card de evento/restaurante (0 = fechado ou ainda não
  /// medido). A câmera reserva esse rodapé ao focar o local e ao enquadrar a
  /// rota, para o ponto e o fim da rota não ficarem sob o card.
  final ValueNotifier<double> contentCardHeight = ValueNotifier(0);

  CampusMapCamera? _camera;
  bool _disposed = false;
  Future<CampusLocationResult>? _locating;
  Future<void>? _loadingPucStops;
  Future<void>? _reloadingPucStops;
  Future<void>? _loadingContent;
  Future<void>? _reloadingContent;
  int _contentRequest = 0;
  int _revision = 0;
  int _locationRequest = 0;
  int _routeRequest = 0;
  int _pucStopRequest = 0;

  /// Usado pela view quando o style fica pronto, nunca durante o build.
  void attach(CampusMapCamera camera) {
    if (_disposed) throw StateError('Controller descartado.');
    if (_camera != null && !identical(_camera, camera)) {
      throw StateError('Use um controller por mapa.');
    }
    _camera = camera;
    _startRouteMonitoring();
  }

  void detach(CampusMapCamera camera) {
    if (!identical(_camera, camera)) return;
    _camera = null;
    _revision++;
    _locationRequest++;
    _routeRequest++;
    _pucStopRequest++;
    _locating = null;
    _stopRouteMonitoring();
    _automaticRequest = null;
  }

  Future<List<CampusPlace>> search(String query) {
    if (_disposed) throw StateError('Controller descartado.');
    return placeRepository.search(query);
  }

  Future<List<CampusPlace>> placesInCategory(
    CampusPlaceCategory category, {
    String query = '',
  }) {
    if (_disposed) throw StateError('Controller descartado.');
    return _catalog.inCategory(category, query: query);
  }

  /// A seleção já contém a âncora confirmada pela busca ou catálogo local.
  /// Não depende de uma segunda consulta remota para focar o mesmo lugar.
  Future<void> focusSelection(CampusPlace place) async {
    final camera = _camera;
    if (_disposed || camera == null) {
      throw StateError('Mapa ainda indisponível.');
    }
    await camera.focus(place);
  }

  Future<void> focusPlace(String placeId) async {
    final camera = _camera;
    final revision = _revision;
    if (_disposed || camera == null) {
      throw StateError('Mapa ainda indisponível.');
    }
    final place = await placeRepository.findById(placeId);
    if (_disposed || revision != _revision) return;
    if (place == null) throw ArgumentError('Local não encontrado.');
    await camera.focus(place);
  }

  Future<CampusLocationResult> moveToUser() {
    if (_locating case final pending?) return pending;
    final request = ++_locationRequest;
    return _locating = _moveToUser().whenComplete(() {
      if (request == _locationRequest) _locating = null;
    });
  }

  Future<CampusLocationResult> _moveToUser() async {
    final camera = _camera;
    final revision = _revision;
    if (_disposed || camera == null) {
      return const CampusLocationResult(CampusLocationStatus.mapUnavailable);
    }
    try {
      final result = await locationService.locate();
      if (_disposed || revision != _revision) {
        return const CampusLocationResult(CampusLocationStatus.mapUnavailable);
      }
      if (result.status == CampusLocationStatus.located) {
        final location = result.location;
        if (location == null || !location.isValid) {
          return const CampusLocationResult(CampusLocationStatus.error);
        }
        await camera.showUser(location);
      }
      return result;
    } catch (_) {
      return const CampusLocationResult(CampusLocationStatus.error);
    }
  }

  bool get canRoute => routeService != null;

  /// Rota a pé da posição atual até o prédio [placeId]. Um pedido novo,
  /// [clearRoute] ou a saída da tela cancelam o anterior (`cancelled`).
  Future<CampusRouteResult> routeTo(String placeId, {bool accessible = false}) {
    final CampusRouteTarget target;
    try {
      target = CampusRouteTarget.place(placeId);
    } on ArgumentError {
      // Id que o backend não aceita como prédio (ex.: UUID de área).
      _routeRequest++;
      _routeTarget = null;
      _automaticRequest = null;
      _stopRouteMonitoring();
      return Future.value(
        const CampusRouteResult.failed(
          CampusRouteFailure.destinationUnavailable,
        ),
      );
    }
    return routeToTarget(target, accessible: accessible);
  }

  /// Rota até um lugar da busca: prédio pelo id; área e sala pelo centro.
  Future<CampusRouteResult> routeToPlace(
    CampusPlace place, {
    bool accessible = false,
  }) =>
      routeToTarget(CampusRouteTarget.forPlace(place), accessible: accessible);

  /// Rota até [destination] (prédio ou coordenada), com o mesmo cancelamento
  /// de [routeTo].
  Future<CampusRouteResult> routeToTarget(
    CampusRouteTarget destination, {
    bool accessible = false,
  }) async {
    _stopRouteMonitoring();
    _routeTarget = null;
    _automaticRequest = null;
    final service = routeService;
    final camera = _camera;
    final revision = _revision;
    final request = ++_routeRequest;
    bool stale() =>
        _disposed || revision != _revision || request != _routeRequest;
    if (_disposed || camera == null) {
      return const CampusRouteResult.location(
        CampusLocationStatus.mapUnavailable,
      );
    }
    if (service == null) {
      return const CampusRouteResult.failed(CampusRouteFailure.unavailable);
    }
    final CampusLocationResult located;
    try {
      located = await locationService.locate();
    } catch (_) {
      return stale()
          ? const CampusRouteResult.cancelled()
          : const CampusRouteResult.location(CampusLocationStatus.error);
    }
    if (stale()) return const CampusRouteResult.cancelled();
    if (located.status != CampusLocationStatus.located) {
      return CampusRouteResult.location(located.status);
    }
    final origin = located.location;
    if (origin == null || !origin.isValid) {
      return const CampusRouteResult.location(CampusLocationStatus.error);
    }
    final CampusRoute route;
    try {
      route = await service.route(
        origin: origin,
        destination: destination,
        accessible: accessible,
      );
    } on CampusRouteException catch (erro) {
      return stale()
          ? const CampusRouteResult.cancelled()
          : CampusRouteResult.failed(erro.failure);
    } catch (_) {
      return stale()
          ? const CampusRouteResult.cancelled()
          : const CampusRouteResult.failed(CampusRouteFailure.unavailable);
    }
    if (stale()) return const CampusRouteResult.cancelled();
    try {
      await camera.showRoute(route);
    } catch (_) {
      return stale()
          ? const CampusRouteResult.cancelled()
          : const CampusRouteResult.location(
              CampusLocationStatus.mapUnavailable,
            );
    }
    // Clear/detach já invalidam a pintura. Uma resposta antiga não pode
    // limpar a linha de um pedido mais novo que acabou de ser mostrado.
    if (stale()) return const CampusRouteResult.cancelled();
    _routeTarget = destination;
    _routeAccessible = accessible;
    activeRoute.value = route;
    _nextAutomatic = _elapsed();
    _startRouteMonitoring();
    return CampusRouteResult.shown(route);
  }

  /// Remove a linha e cancela um cálculo em andamento.
  Future<void> clearRoute() async {
    if (_disposed) return;
    _routeRequest++;
    _routeTarget = null;
    _automaticRequest = null;
    _stopRouteMonitoring();
    activeRoute.value = null;
    final camera = _camera;
    if (camera != null) await _clear(camera);
  }

  Future<void> _clear(CampusMapCamera camera) async {
    try {
      await camera.clearRoute();
    } catch (_) {
      // Style descartado: a linha já não existe.
    }
  }

  void _resetDeviation() {
    _outsideStart = null;
    _outsideSince = null;
    _lastOutside = null;
  }

  void _stopRouteMonitoring() {
    _positionGeneration++;
    final subscription = _routePositions;
    _routePositions = null;
    if (subscription != null) {
      unawaited(subscription.cancel().catchError((_) {}));
    }
    _resetDeviation();
    _lastPositionCheck = null;
  }

  void _startRouteMonitoring() {
    final updates = switch (locationService) {
      CampusLocationUpdates service => service,
      _ => null,
    };
    if (_disposed ||
        _camera == null ||
        activeRoute.value == null ||
        _routeTarget == null ||
        _routePositions != null ||
        updates == null) {
      return;
    }
    final generation = ++_positionGeneration;
    try {
      _routePositions = updates.watch().listen(
        (location) {
          if (!_disposed && generation == _positionGeneration) {
            _checkRouteDeviation(location);
          }
        },
        onError: (Object _) {
          if (!_disposed && generation == _positionGeneration) {
            _resetDeviation();
          }
        },
        onDone: () {
          if (!_disposed && generation == _positionGeneration) {
            _routePositions = null;
            _resetDeviation();
          }
        },
      );
    } catch (_) {
      _resetDeviation();
    }
  }

  void _checkRouteDeviation(CampusUserLocation location) {
    final route = activeRoute.value;
    if (_camera == null ||
        route == null ||
        _routeTarget == null ||
        _automaticRequest != null) {
      return;
    }
    // Leitura aproximada não permite distinguir um desvio no campus.
    if (!location.isValid || location.accuracy > 25) {
      _resetDeviation();
      return;
    }
    final now = _elapsed();
    if (_lastPositionCheck case final last?
        when now - last < const Duration(seconds: 2)) {
      return;
    }
    _lastPositionCheck = now;
    if (now < _nextAutomatic) {
      _resetDeviation();
      return;
    }
    final tolerance = math.max(25.0, location.accuracy * 1.5);
    if (campusDistanceToRoute(location, route) <= tolerance) {
      _resetDeviation();
      return;
    }
    if (_outsideStart == null ||
        (_lastOutside != null &&
            now - _lastOutside! > const Duration(seconds: 30))) {
      _outsideStart = location;
      _outsideSince = now;
      _lastOutside = now;
      return;
    }
    _lastOutside = now;
    final movement = math.max(
      8.0,
      (location.accuracy + _outsideStart!.accuracy) / 2,
    );
    if (now - _outsideSince! < const Duration(seconds: 5) ||
        campusLocationDisplacement(_outsideStart!, location) < movement) {
      return;
    }
    _resetDeviation();
    unawaited(_recalculateRoute(location));
  }

  Future<void> _recalculateRoute(CampusUserLocation origin) async {
    final destination = _routeTarget;
    final previous = activeRoute.value;
    final service = routeService;
    final camera = _camera;
    if (destination == null ||
        previous == null ||
        service == null ||
        camera == null) {
      return;
    }
    final accessible = _routeAccessible;
    final revision = _revision;
    final request = ++_routeRequest;
    _automaticRequest = request;
    _nextAutomatic = _elapsed() + const Duration(seconds: 30);
    bool stale() =>
        _disposed || revision != _revision || request != _routeRequest;
    var drawing = false;
    var succeeded = false;
    try {
      final route = await service
          .route(
            origin: origin,
            destination: destination,
            accessible: accessible,
          )
          .timeout(const Duration(seconds: 10));
      if (stale()) return;
      if (route.destinationId != destination.key ||
          route.accessible != accessible) {
        throw StateError('Resposta de rota incompatível com o pedido.');
      }
      drawing = true;
      await camera.showRoute(route).timeout(const Duration(seconds: 5));
      if (stale()) return;
      activeRoute.value = route;
      succeeded = true;
    } catch (_) {
      // Sem snackbar automático. Falha conserva destino, perfil e rota.
      if (!stale() && drawing) {
        try {
          await camera.showRoute(previous).timeout(const Duration(seconds: 5));
        } catch (_) {}
      }
    } finally {
      if (!stale()) {
        _nextAutomatic = _elapsed() + Duration(seconds: succeeded ? 30 : 60);
        _resetDeviation();
      }
      if (_automaticRequest == request) _automaticRequest = null;
    }
  }

  bool get hasPucStops => pucStopService != null;

  CampusPucStop? pucStop(String id) {
    for (final stop in pucStops.value) {
      if (stop.id == id) return stop;
    }
    return null;
  }

  /// Uma vez por controller (nova tentativa só depois de falha). Falha não é
  /// erro de mapa: sem rede o mapa segue sem PucStops.
  Future<void> loadPucStops() => _loadingPucStops ??= _loadPucStops();

  /// Busca a lista de novo (app voltou ao primeiro plano): PucStop criado,
  /// movido ou desativado pela coordenação aparece, muda ou some sem reabrir
  /// o mapa. Falha mantém a lista anterior.
  Future<void> reloadPucStops() {
    if (_disposed || pucStopService == null) return Future.value();
    return _reloadingPucStops ??= _loadingPucStops = _loadPucStops()
        .whenComplete(() => _reloadingPucStops = null);
  }

  int _pucStopLoadRequest = 0;

  Future<void> _loadPucStops() async {
    final service = pucStopService;
    if (service == null || _disposed) return;
    final request = ++_pucStopLoadRequest;
    bool stale() => _disposed || request != _pucStopLoadRequest;
    try {
      final stops = await service.list();
      if (stale()) return;
      pucStops.value = List.unmodifiable(stops);
      // Card aberto de um PucStop desativado/removido da lista: fecha.
      final selected = selectedPucStop.value;
      if (selected != null && pucStop(selected) == null) selectPucStop(null);
    } catch (_) {
      if (!stale()) _loadingPucStops = null;
      return;
    }
    try {
      final ids = await service.collected();
      if (!stale()) {
        // Coletas são permanentes. Um GET iniciado antes do claim não pode
        // apagar uma confirmação recebida enquanto a consulta estava pendente.
        collectedPucStops.value = Set.unmodifiable({
          ...collectedPucStops.value,
          ...ids,
        });
      }
    } catch (_) {
      // Sem a lista de coletados o estado fica "disponível"; o servidor
      // continua barrando a segunda coleta (409).
    }
  }

  void selectPucStop(String? id) {
    if (_disposed) return;
    _pucStopRequest++;
    // Um card por vez.
    if (id != null) selectedContent.value = null;
    selectedPucStop.value = id;
  }

  bool get hasContent => contentService != null;

  /// Item atual da lista (por tipo e id); `null` se saiu da lista.
  CampusContent? content(CampusContentKind kind, String id) {
    final List<CampusContent> items = switch (kind) {
      CampusContentKind.event => events.value,
      CampusContentKind.restaurant => restaurants.value,
    };
    for (final item in items) {
      if (item.id == id) return item;
    }
    return null;
  }

  /// Abre (ou fecha, com `null`) o card de um evento/restaurante. Fecha o
  /// card do PucStop.
  void selectContent(CampusContent? item) {
    if (_disposed) return;
    if (item != null && selectedPucStop.value != null) selectPucStop(null);
    if (item == null) contentCardHeight.value = 0;
    selectedContent.value = item;
  }

  /// Uma vez por controller (nova tentativa só depois de falha). Falha não é
  /// erro de mapa: sem rede o mapa segue sem eventos e restaurantes.
  Future<void> loadContent() => _loadingContent ??= _loadContent();

  /// Busca de novo (app voltou ao primeiro plano ou "Tentar novamente"):
  /// evento criado/encerrado ou restaurante alterado pela coordenação
  /// aparece, muda ou some sem reabrir o mapa. Falha mantém a lista anterior.
  Future<void> reloadContent() {
    if (_disposed || contentService == null) return Future.value();
    return _reloadingContent ??= _loadingContent = _loadContent().whenComplete(
      () => _reloadingContent = null,
    );
  }

  Future<void> _loadContent() async {
    final service = contentService;
    if (service == null || _disposed) return;
    final request = ++_contentRequest;
    // Resposta de um pedido mais antigo não sobrescreve a de um mais novo.
    bool stale() => _disposed || request != _contentRequest;
    final results = await Future.wait([
      _loadList(service.events, events, eventsStatus, stale),
      _loadList(service.restaurants, restaurants, restaurantsStatus, stale),
    ]);
    if (stale()) return;
    if (results.contains(false)) _loadingContent = null;
    // Card aberto: troca pelo item novo, ou fecha se ele saiu da lista.
    final selected = selectedContent.value;
    if (selected != null) {
      final current = content(selected.kind, selected.id);
      if (current == null) {
        selectContent(null);
      } else if (!identical(current, selected)) {
        selectedContent.value = current;
      }
    }
  }

  Future<bool> _loadList<T>(
    Future<List<T>> Function() load,
    ValueNotifier<List<T>> target,
    ValueNotifier<CampusContentStatus> status,
    bool Function() stale,
  ) async {
    if (status.value != CampusContentStatus.ready) {
      status.value = CampusContentStatus.loading;
    }
    try {
      final items = await load();
      if (stale()) return true;
      target.value = List.unmodifiable(items);
      status.value = CampusContentStatus.ready;
      return true;
    } catch (_) {
      if (stale()) return true;
      if (status.value != CampusContentStatus.ready) {
        status.value = CampusContentStatus.failed;
      }
      return false;
    }
  }

  /// Leva a câmera até o item (sem posição: [ArgumentError]).
  Future<void> focusContent(CampusContent item) async {
    final camera = _camera;
    if (_disposed || camera == null) {
      throw StateError('Mapa ainda indisponível.');
    }
    final center = item.location?.center;
    if (center == null) throw ArgumentError('Local sem posição no mapa.');
    await camera.focus(
      CampusPlace(id: item.id, name: item.title, center: center),
    );
  }

  /// Rota até o local do item, pelo alvo informado pelo servidor.
  Future<CampusRouteResult> routeToContent(
    CampusContent item, {
    bool accessible = false,
  }) {
    final target = item.location?.routeTarget;
    if (target == null) {
      _routeRequest++;
      _routeTarget = null;
      _automaticRequest = null;
      _stopRouteMonitoring();
      return Future.value(
        const CampusRouteResult.failed(
          CampusRouteFailure.destinationUnavailable,
        ),
      );
    }
    return routeToTarget(target, accessible: accessible);
  }

  /// Cardápio vigente hoje; `null` sem cardápio. Lança
  /// [CampusContentException]. Restaurante desativado (`notFound`) recarrega
  /// a lista, o que fecha o card.
  Future<CampusMenu?> menuFor(String restaurantId) async {
    final service = contentService;
    if (_disposed || service == null) {
      throw const CampusContentException(CampusContentFailure.offline);
    }
    try {
      return await service.menu(restaurantId);
    } on CampusContentException catch (erro) {
      if (erro.failure == CampusContentFailure.notFound && !_disposed) {
        unawaited(reloadContent());
      }
      rethrow;
    } catch (_) {
      throw const CampusContentException(CampusContentFailure.offline);
    }
  }

  /// Uma leitura de GPS sob demanda (distância no card), sem mover a câmera
  /// e sem guardar a posição.
  Future<CampusLocationResult> locateOnce() async {
    if (_disposed) {
      return const CampusLocationResult(CampusLocationStatus.mapUnavailable);
    }
    try {
      final result = await locationService.locate();
      if (result.status == CampusLocationStatus.located &&
          result.location?.isValid != true) {
        return const CampusLocationResult(CampusLocationStatus.error);
      }
      return result;
    } catch (_) {
      return const CampusLocationResult(CampusLocationStatus.error);
    }
  }

  /// Coleta explícita (o usuário tocou "Coletar XP"): lê a posição agora e
  /// envia ao serviço, que valida a distância no servidor. Nunca automática.
  Future<CampusPucStopResult> claimPucStop(String id) async {
    final service = pucStopService;
    final revision = _revision;
    final request = ++_pucStopRequest;
    bool stale() =>
        _disposed || revision != _revision || request != _pucStopRequest;
    if (_disposed || service == null) {
      return const CampusPucStopResult.failed(CampusPucStopFailure.offline);
    }
    if (!service.canClaim) {
      return const CampusPucStopResult.failed(
        CampusPucStopFailure.unauthenticated,
      );
    }
    final located = await locateOnce();
    if (stale()) return const CampusPucStopResult.cancelled();
    if (located.status != CampusLocationStatus.located) {
      return CampusPucStopResult.location(located.status);
    }
    try {
      final claim = await service.claim(id, located.location!);
      // Coletou no servidor: vale mesmo que a tela tenha mudado.
      if (!_disposed) _markCollected(id);
      if (stale()) return const CampusPucStopResult.cancelled();
      return CampusPucStopResult.claimed(claim);
    } on CampusPucStopException catch (erro) {
      if (erro.failure == CampusPucStopFailure.alreadyCollected && !_disposed) {
        _markCollected(id);
      }
      if (stale()) return const CampusPucStopResult.cancelled();
      return CampusPucStopResult.failed(
        erro.failure,
        distanceMeters: erro.distanceMeters,
      );
    } catch (_) {
      if (stale()) return const CampusPucStopResult.cancelled();
      return const CampusPucStopResult.failed(CampusPucStopFailure.offline);
    }
  }

  void _markCollected(String id) {
    if (collectedPucStops.value.contains(id)) return;
    collectedPucStops.value = Set.unmodifiable({
      ...collectedPucStops.value,
      id,
    });
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _stopRouteMonitoring();
    _revision++;
    _routeRequest++;
    _pucStopRequest++;
    _camera = null;
    pucStops.dispose();
    collectedPucStops.dispose();
    selectedPucStop.dispose();
    events.dispose();
    restaurants.dispose();
    eventsStatus.dispose();
    restaurantsStatus.dispose();
    selectedContent.dispose();
    contentCardHeight.dispose();
    controlsHeight.dispose();
    activeRoute.dispose();
  }
}
