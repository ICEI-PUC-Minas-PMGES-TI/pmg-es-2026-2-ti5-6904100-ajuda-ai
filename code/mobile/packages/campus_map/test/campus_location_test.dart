import 'dart:async';

import 'package:campus_map/campus_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';

void main() {
  late _Platform platform;
  late GeolocatorCampusLocationService service;
  setUp(() {
    platform = _Platform();
    service = GeolocatorCampusLocationService(platform: platform);
  });
  tearDown(() => platform.positions.close());

  test(
    'rota ativa monitora posições; fechar a rota encerra a assinatura',
    () async {
      final controller = CampusMapController(
        locationService: service,
        routeService: _Routes(),
      );
      final camera = _Camera();
      controller.attach(camera);
      addTearDown(controller.dispose);
      expect(platform.positions.hasListener, isFalse);
      await controller.routeTo('P26');
      await Future<void>.delayed(Duration.zero);
      expect(platform.positions.hasListener, isTrue);
      await controller.clearRoute();
      await Future<void>.delayed(Duration.zero);
      expect(platform.positions.hasListener, isFalse);
    },
  );

  test('serviço desligado não pede permissão nem posição', () async {
    platform.enabled = false;
    expect(
      (await service.locate()).status,
      CampusLocationStatus.serviceDisabled,
    );
    expect(platform.calls, ['service']);
  });

  for (final permission in [
    LocationPermission.whileInUse,
    LocationPermission.always,
  ]) {
    test(
      'concedida $permission: leitura única com precisão e timeout',
      () async {
        platform.permission = permission;
        final result = await service.locate();
        expect(result.status, CampusLocationStatus.located);
        expect(result.location!.accuracy, 5);
        expect(result.location!.latitude, -19.92);
        expect(result.location!.longitude, -43.99);
        expect(platform.calls, ['service', 'check', 'position']);
        expect(platform.settings!.timeLimit, const Duration(seconds: 15));
        expect(platform.settings!.accuracy, LocationAccuracy.high);
      },
    );
  }

  for (final (permission, status) in [
    (LocationPermission.whileInUse, CampusLocationStatus.located),
    (LocationPermission.denied, CampusLocationStatus.denied),
    (LocationPermission.deniedForever, CampusLocationStatus.deniedForever),
  ]) {
    test('solicitação explícita retorna $status', () async {
      platform.permission = LocationPermission.denied;
      platform.requestResult = permission;
      expect((await service.locate()).status, status);
      expect(platform.calls, [
        'service',
        'check',
        'request',
        if (status == CampusLocationStatus.located) 'position',
      ]);
    });
  }

  test('permanentemente negada não solicita novamente', () async {
    platform.permission = LocationPermission.deniedForever;
    expect((await service.locate()).status, CampusLocationStatus.deniedForever);
    expect(platform.calls, ['service', 'check']);
    expect(await service.openAppSettings(), isTrue);
    expect(await service.openLocationSettings(), isTrue);
  });

  for (final error in [
    StateError('falha'),
    TimeoutException('tempo'),
    const LocationServiceDisabledException(),
  ]) {
    test('erro ${error.runtimeType} controlado', () async {
      platform.error = error;
      final result = await service.locate();
      expect(
        result.status,
        error is LocationServiceDisabledException
            ? CampusLocationStatus.serviceDisabled
            : CampusLocationStatus.error,
      );
      expect(result.location, isNull);
    });
  }

  test(
    'posição fora do campus é válida; coordenada inválida vira erro',
    () async {
      platform.latitude = 0;
      platform.longitude = 0;
      expect((await service.locate()).status, CampusLocationStatus.located);
      platform.latitude = 91;
      expect((await service.locate()).status, CampusLocationStatus.error);
    },
  );

  test('permissão indeterminada não lê GPS', () async {
    platform.permission = LocationPermission.unableToDetermine;
    expect((await service.locate()).status, CampusLocationStatus.error);
    expect(platform.calls, ['service', 'check']);
  });

  test('watch não pede permissão negada nem assina o GPS', () async {
    platform.permission = LocationPermission.denied;
    expect(await service.watch().toList(), isEmpty);
    expect(platform.calls, ['service', 'check']);
    expect(platform.positions.hasListener, isFalse);
  });

  test(
    'cancelar durante check de permissão impede assinatura tardia',
    () async {
      final pending = Completer<LocationPermission>();
      platform.checking = pending;
      final subscription = service.watch().listen((_) {});
      await Future<void>.delayed(Duration.zero);
      await subscription.cancel();
      pending.complete(LocationPermission.whileInUse);
      await Future<void>.delayed(Duration.zero);
      expect(platform.positions.hasListener, isFalse);
    },
  );

  test('watch só emite leitura recente válida; erro encerra o GPS', () async {
    final received = <CampusUserLocation>[];
    final subscription = service.watch().listen(received.add);
    await Future<void>.delayed(Duration.zero);
    expect(platform.streamSettings!.distanceFilter, 5);
    expect(platform.streamSettings!.accuracy, LocationAccuracy.high);
    platform.positions.add(
      _nativePosition(
        timestamp: DateTime.now().subtract(const Duration(minutes: 1)),
      ),
    );
    platform.positions.add(_nativePosition(latitude: 91));
    platform.positions.add(_nativePosition());
    await Future<void>.delayed(Duration.zero);
    expect(received, hasLength(1));
    platform.positions.addError(StateError('GPS interrompido'));
    await Future<void>.delayed(Duration.zero);
    expect(platform.positions.hasListener, isFalse);
    await subscription.cancel();
  });
}

Position _nativePosition({DateTime? timestamp, double latitude = -19.92}) =>
    Position(
      longitude: -43.99,
      latitude: latitude,
      timestamp: timestamp ?? DateTime.now(),
      accuracy: 5,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );

class _Platform extends GeolocatorPlatform {
  final positions = StreamController<Position>.broadcast();
  LocationSettings? streamSettings;
  Completer<LocationPermission>? checking;
  @override
  Stream<Position> getPositionStream({LocationSettings? locationSettings}) {
    streamSettings = locationSettings;
    return positions.stream;
  }

  bool enabled = true;
  LocationPermission permission = LocationPermission.whileInUse;
  LocationPermission requestResult = LocationPermission.whileInUse;
  Object? error;
  final calls = <String>[];
  LocationSettings? settings;
  double latitude = -19.92;
  double longitude = -43.99;

  @override
  Future<bool> isLocationServiceEnabled() async {
    calls.add('service');
    return enabled;
  }

  @override
  Future<LocationPermission> checkPermission() async {
    calls.add('check');
    if (checking case final pending?) return pending.future;
    return permission;
  }

  @override
  Future<LocationPermission> requestPermission() async {
    calls.add('request');
    return requestResult;
  }

  @override
  Future<Position> getCurrentPosition({
    LocationSettings? locationSettings,
  }) async {
    calls.add('position');
    settings = locationSettings;
    if (error != null) throw error!;
    return Position(
      longitude: longitude,
      latitude: latitude,
      timestamp: DateTime(2026),
      accuracy: 5,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );
  }

  @override
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}

class _Routes implements CampusRouteService {
  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async => CampusRoute(
    destinationId: destination.key,
    coordinates: [
      [origin.longitude, origin.latitude],
      [-43.991, -19.921],
    ],
    distanceMeters: 150,
    durationSeconds: 100,
    accessible: accessible,
  );
}

class _Camera implements CampusMapCamera {
  @override
  Future<void> focus(CampusPlace place) async {}
  @override
  Future<void> showUser(CampusUserLocation location) async {}
  @override
  Future<void> showRoute(CampusRoute route) async {}
  @override
  Future<void> clearRoute() async {}
}
