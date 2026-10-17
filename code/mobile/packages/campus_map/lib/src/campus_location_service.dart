import 'package:geolocator/geolocator.dart';

enum CampusLocationStatus {
  located,
  serviceDisabled,
  denied,
  deniedForever,
  error,
  mapUnavailable,
}

/// Posição efêmera: nunca gravada nem incluída em logs. Só sai do aparelho
/// quando o usuário pede uma rota (origem do [CampusRouteService]).
class CampusUserLocation {
  const CampusUserLocation({
    required this.longitude,
    required this.latitude,
    required this.accuracy,
  });

  final double longitude;
  final double latitude;
  final double accuracy;

  bool get isValid =>
      longitude.isFinite &&
      latitude.isFinite &&
      longitude.abs() <= 180 &&
      latitude.abs() <= 90 &&
      accuracy.isFinite &&
      accuracy >= 0;
}

class CampusLocationResult {
  const CampusLocationResult(this.status, {this.location});
  final CampusLocationStatus status;
  final CampusUserLocation? location;
}

abstract interface class CampusLocationService {
  Future<CampusLocationResult> locate();
  Future<bool> openAppSettings();
  Future<bool> openLocationSettings();
}

/// Uma leitura sob demanda, sem stream, serviço foreground ou background.
class GeolocatorCampusLocationService implements CampusLocationService {
  GeolocatorCampusLocationService({GeolocatorPlatform? platform})
    : _platform = platform ?? GeolocatorPlatform.instance;

  final GeolocatorPlatform _platform;

  @override
  Future<CampusLocationResult> locate() async {
    try {
      if (!await _platform.isLocationServiceEnabled()) {
        return const CampusLocationResult(CampusLocationStatus.serviceDisabled);
      }
      var permission = await _platform.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await _platform.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        return const CampusLocationResult(CampusLocationStatus.deniedForever);
      }
      if (permission == LocationPermission.denied) {
        return const CampusLocationResult(CampusLocationStatus.denied);
      }
      if (permission != LocationPermission.whileInUse &&
          permission != LocationPermission.always) {
        return const CampusLocationResult(CampusLocationStatus.error);
      }
      final position = await _platform.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      final location = CampusUserLocation(
        longitude: position.longitude,
        latitude: position.latitude,
        accuracy: position.accuracy,
      );
      return location.isValid
          ? CampusLocationResult(
              CampusLocationStatus.located,
              location: location,
            )
          : const CampusLocationResult(CampusLocationStatus.error);
    } on LocationServiceDisabledException {
      return const CampusLocationResult(CampusLocationStatus.serviceDisabled);
    } catch (_) {
      // Não expor mensagens do plugin: podem conter dados do dispositivo.
      return const CampusLocationResult(CampusLocationStatus.error);
    }
  }

  @override
  Future<bool> openAppSettings() => _platform.openAppSettings();

  @override
  Future<bool> openLocationSettings() => _platform.openLocationSettings();
}
