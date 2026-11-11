import 'dart:async';
import 'dart:math' as math;

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_route_deviation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _latitude = -19.922;
const _longitude = -43.992;
const _metersPerDegree = 6371008.8 * math.pi / 180;
CampusUserLocation _position(double x, double y, {double accuracy = 5}) =>
    CampusUserLocation(
      longitude:
          _longitude +
          x / (_metersPerDegree * math.cos(_latitude * math.pi / 180)),
      latitude: _latitude + y / _metersPerDegree,
      accuracy: accuracy,
    );
List<double> _point(double x, double y) {
  final p = _position(x, y);
  return [p.longitude, p.latitude];
}

CampusRoute _route(
  CampusUserLocation origin,
  CampusRouteTarget target,
  bool accessible, {
  double distance = 200,
}) => CampusRoute(
  destinationId: target.key,
  coordinates: [
    [origin.longitude, origin.latitude],
    _point(200, 0),
  ],
  distanceMeters: distance,
  durationSeconds: distance.round(),
  accessible: accessible,
);

final _area = CampusPlace(
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Área',
  kind: CampusPlaceKind.area,
  center: _point(200, 0),
);
final _room = CampusPlace(
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Sala',
  kind: CampusPlaceKind.room,
  center: _point(200, 0),
);
final _event = CampusEvent(
  id: '10000000-0000-4000-8000-000000000003',
  title: 'Evento',
  start: DateTime.utc(2026),
  end: DateTime.utc(2026, 1, 2),
  status: CampusEventStatus.ongoing,
  location: CampusContentLocation(
    kind: CampusContentLocationKind.point,
    center: _point(200, 0),
    routeTarget: CampusRouteTarget.coordinate(
      longitude: _point(200, 0)[0],
      latitude: _point(200, 0)[1],
    ),
  ),
);
final _restaurant = CampusRestaurant(
  id: '10000000-0000-4000-8000-000000000004',
  title: 'Restaurante',
  location: CampusContentLocation(
    kind: CampusContentLocationKind.building,
    id: 'P16',
    center: _point(200, 0),
    routeTarget: CampusRouteTarget.place('P16'),
  ),
  hours: const [],
  openNow: true,
  menuToday: false,
);

void main() {
  group('distância aos segmentos no campus', () {
    final line = _route(_position(0, 0), CampusRouteTarget.place('P26'), false);
    for (final (x, y, distance) in [
      (50.0, 0.0, 0.0),
      (50.0, 5.0, 5.0),
      (50.0, 80.0, 80.0),
      (-10.0, 0.0, 10.0),
      (210.0, 0.0, 10.0),
      (0.0, 0.0, 0.0),
      (200.0, 0.0, 0.0),
    ]) {
      test('ponto ($x, $y): $distance m (inclui início/fim)', () {
        expect(
          campusDistanceToRoute(_position(x, y), line),
          closeTo(distance, 0.05),
        );
      });
    }
    test(
      'segmento degenerado não divide por zero e usa o trecho mais próximo',
      () {
        final route = CampusRoute(
          destinationId: 'P26',
          coordinates: [
            _point(0, 0),
            _point(0, 0),
            _point(100, 0),
            _point(100, 100),
          ],
          distanceMeters: 200,
          durationSeconds: 200,
          accessible: false,
        );
        expect(
          campusDistanceToRoute(_position(95, 50), route),
          closeTo(5, 0.05),
        );
      },
    );
  });

  group('recálculo automático', () {
    late _Location location;
    late _Routes routes;
    late _Camera camera;
    late CampusMapController controller;
    var elapsed = Duration.zero;
    setUp(() {
      elapsed = Duration.zero;
      location = _Location();
      routes = _Routes();
      camera = _Camera();
      controller = CampusMapController(
        locationService: location,
        routeService: routes,
        elapsed: () => elapsed,
      )..attach(camera);
    });
    tearDown(() async {
      controller.dispose();
      await location.positions.close();
    });
    Future<void> sample(
      int seconds,
      double x,
      double y, {
      double accuracy = 5,
    }) async {
      elapsed = Duration(seconds: seconds);
      location.positions.add(_position(x, y, accuracy: accuracy));
      await Future<void>.delayed(Duration.zero);
    }

    Future<void> deviate() async {
      await sample(0, 0, 50);
      await sample(6, 12, 50);
    }

    test(
      'A/B: próximo da rota, ruído e precisão ampliada não chamam API',
      () async {
        await controller.routeTo('P26');
        for (var i = 0; i < 10; i++) {
          await sample(i * 3, i * 6, i.isEven ? 5 : 20);
        }
        await sample(40, 70, 30, accuracy: 25); // tolerância 37,5 m.
        await sample(46, 85, 30, accuracy: 25);
        expect(routes.calls, hasLength(1));
      },
    );

    test('C: spike fora seguido de retorno não confirma desvio', () async {
      await controller.routeTo('P26');
      await sample(0, 0, 100);
      await sample(6, 10, 0);
      await sample(12, 20, 100);
      await sample(18, 30, 0);
      expect(routes.calls, hasLength(1));
    });

    test(
      'GPS impreciso, leitura inválida e oscilação parado não confirmam',
      () async {
        await controller.routeTo('P26');
        await sample(0, 0, 80, accuracy: 40);
        await sample(6, 15, 80, accuracy: 40);
        await sample(12, 0, 80);
        await sample(18, 0, 80);
        await sample(24, 3, 82);
        await sample(30, 15, 80, accuracy: double.nan);
        await sample(36, 20, 80);
        expect(routes.calls, hasLength(1));
      },
    );

    test(
      'D/E: desvio confirmado usa último sample sem pedir outro GPS',
      () async {
        await controller.routeTo('P26');
        final old = controller.activeRoute.value;
        await deviate();
        expect(routes.calls, hasLength(2));
        expect(routes.calls.last.origin.latitude, _position(12, 50).latitude);
        expect(routes.calls.last.origin.longitude, _position(12, 50).longitude);
        expect(location.locates, 1);
        expect(controller.activeRoute.value, isNot(same(old)));
        expect(camera.shown.last, same(controller.activeRoute.value));
        expect(routes.calls.last.accessible, isFalse);
      },
    );

    final destinations =
        <String, Future<CampusRouteResult> Function(CampusMapController)>{
          'prédio': (c) => c.routeTo('P26', accessible: true),
          'área': (c) => c.routeToPlace(_area, accessible: true),
          'sala': (c) => c.routeToPlace(_room, accessible: true),
          'evento': (c) => c.routeToContent(_event, accessible: true),
          'restaurante': (c) => c.routeToContent(_restaurant, accessible: true),
          'ponto livre': (c) => c.routeToTarget(
            CampusRouteTarget.coordinate(
              longitude: _point(200, 0)[0],
              latitude: _point(200, 0)[1],
            ),
            accessible: true,
          ),
        };
    for (final entry in destinations.entries) {
      test(
        'F/G: preserva destino lógico ${entry.key} e modo acessível',
        () async {
          await entry.value(controller);
          final target = routes.calls.single.destination;
          await deviate();
          expect(routes.calls, hasLength(2));
          expect(routes.calls.last.destination, same(target));
          expect(routes.calls.last.accessible, isTrue);
          expect(controller.activeRoute.value!.accessible, isTrue);
        },
      );
    }

    test('H: cooldown e requisição em andamento impedem tempestade', () async {
      await controller.routeTo('P26');
      final pending = Completer<CampusRoute>();
      routes.pending = pending;
      await deviate();
      for (var t = 7; t <= 20; t++) {
        await sample(t, t.toDouble(), 130);
      }
      expect(routes.calls, hasLength(2));
      final call = routes.calls.last;
      pending.complete(_route(call.origin, call.destination, call.accessible));
      await Future<void>.delayed(Duration.zero);
      for (var t = 22; t < 50; t += 3) {
        await sample(t, t.toDouble(), 130);
      }
      expect(routes.calls, hasLength(2));
      await sample(51, 60, 130);
      await sample(57, 75, 130);
      expect(routes.calls, hasLength(3));
    });

    test(
      'I: resposta automática antiga não sobrescreve destino novo',
      () async {
        await controller.routeTo('P26');
        final pending = Completer<CampusRoute>();
        routes.pending = pending;
        await deviate();
        final oldCall = routes.calls.last;
        await controller.routeTo('P34', accessible: true);
        final current = controller.activeRoute.value;
        pending.complete(_route(oldCall.origin, oldCall.destination, false));
        await Future<void>.delayed(Duration.zero);
        expect(controller.activeRoute.value, same(current));
        expect(camera.shown.last.destinationId, 'P34');
        expect(camera.shown.last.accessible, isTrue);
        expect(camera.clears, 0);
      },
    );

    test(
      'J: offline mantém rota/destino e só tenta novamente após backoff',
      () async {
        await controller.routeTo('P26', accessible: true);
        final previous = controller.activeRoute.value;
        final target = routes.calls.single.destination;
        routes.fail = true;
        await deviate();
        expect(controller.activeRoute.value, same(previous));
        for (var t = 10; t <= 60; t += 5) {
          await sample(t, t.toDouble(), 50);
        }
        expect(routes.calls, hasLength(2));
        routes.fail = false;
        await sample(66, 80, 50);
        await sample(72, 95, 50);
        expect(routes.calls, hasLength(3));
        expect(routes.calls.last.destination, same(target));
        expect(routes.calls.last.accessible, isTrue);
      },
    );

    test('I: pintura antiga cancelada não limpa rota nova', () async {
      await controller.routeTo('P26');
      final painting = Completer<void>();
      camera.pendingDraw = painting;
      await deviate();
      await controller.routeTo('P34', accessible: true);
      final current = controller.activeRoute.value;
      painting.complete();
      await Future<void>.delayed(Duration.zero);
      expect(controller.activeRoute.value, same(current));
      expect(camera.shown.last.destinationId, 'P34');
      expect(camera.clears, 0);
    });

    test(
      'G: resposta incompatível não substitui uma rota acessível por comum',
      () async {
        await controller.routeTo('P26', accessible: true);
        final previous = controller.activeRoute.value;
        routes.wrongProfile = true;
        await deviate();
        expect(routes.calls.last.accessible, isTrue);
        expect(controller.activeRoute.value, same(previous));
        expect(camera.shown.last.accessible, isTrue);
      },
    );

    testWidgets(
      'J: timeout libera recálculo, ignora resposta tardia e respeita backoff',
      (tester) async {
        await controller.routeTo('P26');
        final previous = controller.activeRoute.value;
        final pending = Completer<CampusRoute>();
        routes.pending = pending;
        location.positions.add(_position(0, 50));
        await tester.pump();
        elapsed = const Duration(seconds: 6);
        location.positions.add(_position(12, 50));
        await tester.pump();
        final call = routes.calls.last;
        elapsed = const Duration(seconds: 17);
        await tester.pump(const Duration(seconds: 11));
        expect(controller.activeRoute.value, same(previous));
        pending.complete(_route(call.origin, call.destination, false));
        await tester.pump();
        expect(controller.activeRoute.value, same(previous));
        elapsed = const Duration(seconds: 40);
        location.positions.add(_position(30, 50));
        await tester.pump();
        expect(routes.calls, hasLength(2));
        elapsed = const Duration(seconds: 78);
        location.positions.add(_position(45, 50));
        await tester.pump();
        elapsed = const Duration(seconds: 84);
        location.positions.add(_position(60, 50));
        await tester.pump();
        expect(routes.calls, hasLength(3));
        expect(controller.activeRoute.value, isNot(same(previous)));
      },
    );

    test(
      'K: limpar para monitoramento imediatamente e ignora resposta tardia',
      () async {
        await controller.routeTo('P26');
        final pending = Completer<CampusRoute>();
        routes.pending = pending;
        await deviate();
        final call = routes.calls.last;
        await controller.clearRoute();
        expect(location.positions.hasListener, isFalse);
        await sample(20, 30, 100);
        pending.complete(_route(call.origin, call.destination, false));
        await Future<void>.delayed(Duration.zero);
        expect(routes.calls, hasLength(2));
        expect(controller.activeRoute.value, isNull);
        expect(camera.shown, isEmpty);
      },
    );

    test(
      'L: detach pausa GPS e resposta tardia; resume confirma desvio do zero',
      () async {
        await controller.routeTo('P26');
        await sample(0, 0, 50);
        controller.detach(camera);
        expect(location.positions.hasListener, isFalse);
        await sample(6, 15, 50);
        controller.attach(camera);
        await sample(12, 30, 50);
        expect(routes.calls, hasLength(1));
        await sample(18, 45, 50);
        expect(routes.calls, hasLength(2));
      },
    );

    test(
      'L: dispose cancela assinatura e não aplica recálculo pendente',
      () async {
        await controller.routeTo('P26');
        final pending = Completer<CampusRoute>();
        routes.pending = pending;
        await deviate();
        final call = routes.calls.last;
        final shown = camera.shown.single;
        controller.dispose();
        expect(location.positions.hasListener, isFalse);
        pending.complete(_route(call.origin, call.destination, false));
        await Future<void>.delayed(Duration.zero);
        expect(camera.shown, [shown]);
      },
    );

    testWidgets(
      'card e acessibilidade permanecem; resumo muda sem snackbar de recálculo',
      (tester) async {
        final repo = LocalCampusPlaceRepository();
        controller.dispose();
        controller = CampusMapController(
          placeRepository: repo,
          locationService: location,
          routeService: routes,
          elapsed: () => elapsed,
        )..attach(camera);
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: CampusMapControls(controller: controller)),
          ),
        );
        await tester.enterText(find.byType(TextField), 'Biblioteca');
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithIcon(ListTile, Icons.place_outlined).first,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Rota acessível'));
        await tester.tap(find.byKey(const Key('campus-route-trace')));
        await tester.pumpAndSettle();
        final first = controller.activeRoute.value;
        elapsed = Duration.zero;
        location.positions.add(_position(0, 50));
        await tester.pump();
        elapsed = const Duration(seconds: 6);
        location.positions.add(_position(12, 50));
        await tester.pumpAndSettle();
        expect(controller.activeRoute.value, isNot(same(first)));
        expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
        expect(find.byKey(const Key('campus-route-summary')), findsOneWidget);
        expect(routes.calls.last.accessible, isTrue);
        expect(find.byType(SnackBar), findsNothing);
        await tester.tap(find.byTooltip('Limpar rota'));
        await tester.pumpAndSettle();
        expect(location.positions.hasListener, isFalse);
        expect(find.byKey(const Key('campus-route-card')), findsNothing);
      },
    );
  });
}

class _Location implements CampusLocationService, CampusLocationUpdates {
  final positions = StreamController<CampusUserLocation>.broadcast(sync: true);
  int locates = 0;
  @override
  Future<CampusLocationResult> locate() async {
    locates++;
    return CampusLocationResult(
      CampusLocationStatus.located,
      location: _position(0, 0),
    );
  }

  @override
  Stream<CampusUserLocation> watch() => positions.stream;
  @override
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}

class _Routes implements CampusRouteService {
  final calls =
      <
        ({
          CampusUserLocation origin,
          CampusRouteTarget destination,
          bool accessible,
        })
      >[];
  Completer<CampusRoute>? pending;
  bool fail = false;
  bool wrongProfile = false;
  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async {
    calls.add((
      origin: origin,
      destination: destination,
      accessible: accessible,
    ));
    final p = pending;
    pending = null;
    if (p != null) return p.future;
    if (fail) throw const CampusRouteException(CampusRouteFailure.unavailable);
    return _route(
      origin,
      destination,
      wrongProfile ? !accessible : accessible,
      distance: calls.length * 200,
    );
  }
}

class _Camera implements CampusMapCamera {
  Completer<void>? pendingDraw;
  final shown = <CampusRoute>[];
  int clears = 0;
  @override
  Future<void> focus(CampusPlace place) async {}
  @override
  Future<void> showUser(CampusUserLocation location) async {}
  @override
  Future<void> showRoute(CampusRoute route) async {
    shown.add(route);
    final pending = pendingDraw;
    pendingDraw = null;
    if (pending != null) await pending.future;
  }

  @override
  Future<void> clearRoute() async {
    clears++;
    shown.clear();
  }
}
