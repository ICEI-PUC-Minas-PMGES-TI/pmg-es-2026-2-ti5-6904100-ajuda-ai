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
}

class _Platform extends GeolocatorPlatform {
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
