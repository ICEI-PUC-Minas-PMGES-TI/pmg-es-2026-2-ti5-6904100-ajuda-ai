import 'dart:async';

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
/// para calcular a rota pedida pelo usuário ou seu recálculo após desvio.
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

/// Capacidade opcional: o controller assina só com rota ativa e mapa visível.
abstract interface class CampusLocationUpdates {
  Stream<CampusUserLocation> watch();
}

/// Leitura explícita e atualizações durante a rota, sem serviço em background.
class GeolocatorCampusLocationService
    implements CampusLocationService, CampusLocationUpdates {
  GeolocatorCampusLocationService({GeolocatorPlatform? platform})
    : _platform = platform ?? GeolocatorPlatform.instance;

  final GeolocatorPlatform _platform;

  @override
  Stream<CampusUserLocation> watch() {
    StreamSubscription<Position>? native;
    var cancelled = false;
    late StreamController<CampusUserLocation> updates;
    Future<void> start() async {
      try {
        // A rota inicial já pediu permissão. Monitoramento nunca abre prompt.
        final enabled = await _platform.isLocationServiceEnabled();
        if (cancelled) return;
        final permission = await _platform.checkPermission();
        if (cancelled) return;
        if (!enabled ||
            (permission != LocationPermission.whileInUse &&
                permission != LocationPermission.always)) {
          unawaited(updates.close());
          return;
        }
        native = _platform
            .getPositionStream(
              locationSettings: const LocationSettings(
                accuracy: LocationAccuracy.high,
                distanceFilter: 5,
              ),
            )
            .listen(
              (position) {
                if (cancelled || updates.isClosed) return;
                // Ignorar leitura antiga em cache ao reabrir o app.
                if (DateTime.now().difference(position.timestamp).abs() >
                    const Duration(seconds: 15)) {
                  return;
                }
                final location = CampusUserLocation(
                  longitude: position.longitude,
                  latitude: position.latitude,
                  accuracy: position.accuracy,
                );
                if (location.isValid) updates.add(location);
              },
              onError: (Object _) {
                if (!updates.isClosed) unawaited(updates.close());
              },
              onDone: () {
                if (!updates.isClosed) unawaited(updates.close());
              },
            );
      } catch (_) {
        if (!cancelled) unawaited(updates.close());
      }
    }

    updates = StreamController<CampusUserLocation>(
      onListen: () => unawaited(start()),
      onCancel: () async {
        cancelled = true;
        try {
          await native?.cancel();
        } catch (_) {}
      },
    );
    return updates.stream;
  }

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
