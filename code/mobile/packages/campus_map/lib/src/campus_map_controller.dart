import 'campus_location_service.dart';
import 'campus_place.dart';
import 'campus_place_repository.dart';

/// Ponte pequena para a câmera; permite testar sem a engine nativa.
abstract interface class CampusMapCamera {
  Future<void> focus(CampusPlace place);
  Future<void> showUser(CampusUserLocation location);
}

/// Um controller por tela. Não armazena posição nem estado global.
class CampusMapController {
  CampusMapController({
    CampusPlaceRepository? placeRepository,
    CampusLocationService? locationService,
  }) : placeRepository = placeRepository ?? LocalCampusPlaceRepository(),
       locationService = locationService ?? GeolocatorCampusLocationService();

  final CampusPlaceRepository placeRepository;
  final CampusLocationService locationService;
  CampusMapCamera? _camera;
  bool _disposed = false;
  Future<CampusLocationResult>? _locating;
  int _revision = 0;
  int _locationRequest = 0;

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

  void dispose() {
    _disposed = true;
    _revision++;
    _camera = null;
  }
}
