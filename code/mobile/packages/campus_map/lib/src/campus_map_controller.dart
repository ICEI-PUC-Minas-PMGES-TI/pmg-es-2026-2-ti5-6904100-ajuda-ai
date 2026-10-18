import 'package:flutter/foundation.dart';

import 'campus_location_service.dart';
import 'campus_place.dart';
import 'campus_place_repository.dart';
import 'campus_pucstop.dart';
import 'campus_route.dart';

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

/// Um controller por tela. Não armazena posição nem estado global.
class CampusMapController {
  CampusMapController({
    CampusPlaceRepository? placeRepository,
    CampusLocationService? locationService,
    this.routeService,
    this.pucStopService,
  }) : placeRepository = placeRepository ?? LocalCampusPlaceRepository(),
       locationService = locationService ?? GeolocatorCampusLocationService();

  final CampusPlaceRepository placeRepository;
  final CampusLocationService locationService;

  /// Sem serviço não há rota: o pacote não calcula rota local.
  final CampusRouteService? routeService;

  /// Sem serviço não há PucStops no mapa.
  final CampusPucStopService? pucStopService;

  /// PucStops ativos carregados por [loadPucStops] (vazio até lá ou sem rede).
  final ValueNotifier<List<CampusPucStop>> pucStops = ValueNotifier(const []);

  /// Ids já coletados pelo usuário (do servidor + coletas desta tela).
  final ValueNotifier<Set<String>> collectedPucStops = ValueNotifier(const {});

  /// PucStop tocado no mapa (abre o card); `null` fecha.
  final ValueNotifier<String?> selectedPucStop = ValueNotifier(null);

  CampusMapCamera? _camera;
  bool _disposed = false;
  Future<CampusLocationResult>? _locating;
  Future<void>? _loadingPucStops;
  Future<void>? _reloadingPucStops;
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
  }

  void detach(CampusMapCamera camera) {
    if (!identical(_camera, camera)) return;
    _camera = null;
    _revision++;
    _locationRequest++;
    _routeRequest++;
    _pucStopRequest++;
    _locating = null;
  }

  Future<List<CampusPlace>> search(String query) {
    if (_disposed) throw StateError('Controller descartado.');
    return placeRepository.search(query);
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

  /// Rota a pé da posição atual até [placeId]. Um pedido novo, [clearRoute]
  /// ou a saída da tela cancelam o anterior (resultado `cancelled`).
  Future<CampusRouteResult> routeTo(
    String placeId, {
    bool accessible = false,
  }) async {
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
        destinationId: placeId,
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
    // Limpa se o pedido foi cancelado enquanto a linha era desenhada.
    if (stale()) {
      if (identical(_camera, camera)) await _clear(camera);
      return const CampusRouteResult.cancelled();
    }
    return CampusRouteResult.shown(route);
  }

  /// Remove a linha e cancela um cálculo em andamento.
  Future<void> clearRoute() async {
    _routeRequest++;
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

  Future<void> _loadPucStops() async {
    final service = pucStopService;
    if (service == null || _disposed) return;
    try {
      final stops = await service.list();
      if (_disposed) return;
      pucStops.value = List.unmodifiable(stops);
      // Card aberto de um PucStop desativado/removido da lista: fecha.
      final selected = selectedPucStop.value;
      if (selected != null && pucStop(selected) == null) selectPucStop(null);
    } catch (_) {
      _loadingPucStops = null;
      return;
    }
    try {
      final ids = await service.collected();
      if (!_disposed) collectedPucStops.value = Set.unmodifiable(ids);
    } catch (_) {
      // Sem a lista de coletados o estado fica "disponível"; o servidor
      // continua barrando a segunda coleta (409).
    }
  }

  void selectPucStop(String? id) {
    if (_disposed) return;
    _pucStopRequest++;
    selectedPucStop.value = id;
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
    _revision++;
    _routeRequest++;
    _pucStopRequest++;
    _camera = null;
    pucStops.dispose();
    collectedPucStops.dispose();
    selectedPucStop.dispose();
  }
}
