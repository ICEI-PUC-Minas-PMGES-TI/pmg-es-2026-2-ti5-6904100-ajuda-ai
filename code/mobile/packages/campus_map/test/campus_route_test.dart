import 'dart:async';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_route_layer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

final _biblioteca = CampusPlace(
  id: 'P26',
  name: 'Biblioteca',
  code: '26',
  center: [-43.9931464, -19.92077335],
);
final _icei = CampusPlace(
  id: 'P34',
  name: 'ICEI',
  code: '34',
  center: [-43.9919, -19.9237],
);
const _location = CampusUserLocation(
  longitude: -43.99,
  latitude: -19.92,
  accuracy: 5,
);

CampusRoute _rota(String destino, {bool accessible = false}) => CampusRoute(
  destinationId: destino,
  coordinates: const [
    [-43.99, -19.92],
    [-43.991, -19.921],
  ],
  distanceMeters: 148,
  durationSeconds: accessible ? 130 : 106,
  accessible: accessible,
);

void main() {
  late _Location location;
  late _Camera camera;
  late _Routes routes;
  late CampusMapController controller;
  setUp(() {
    location = _Location();
    camera = _Camera();
    routes = _Routes();
    controller = CampusMapController(
      placeRepository: _Repository(),
      locationService: location,
      routeService: routes,
    )..attach(camera);
  });
  tearDown(() => controller.dispose());

  Future<void> mount(WidgetTester tester, {CampusMapController? other}) =>
      tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CampusMapControls(controller: other ?? controller),
          ),
        ),
      );

  Future<void> select(WidgetTester tester, String query) async {
    await tester.enterText(find.byType(TextField), query);
    await tester.pumpAndSettle();
    // Resultado da busca (o card também tem um ListTile: o seletor acessível).
    await tester.tap(find.widgetWithIcon(ListTile, Icons.place_outlined));
    await tester.pumpAndSettle();
  }

  final trace = find.byKey(const Key('campus-route-trace'));
  final card = find.byKey(const Key('campus-route-card'));
  final summary = find.byKey(const Key('campus-route-summary'));

  testWidgets('sem serviço de rota não há card', (tester) async {
    final semRota = CampusMapController(
      placeRepository: _Repository(),
      locationService: location,
    )..attach(camera);
    addTearDown(semRota.dispose);
    await mount(tester, other: semRota);
    await select(tester, 'biblioteca');
    expect(card, findsNothing);
    expect(camera.focused, ['P26']);
  });

  testWidgets('selecionar → card; traçar → linha, resumo e origem atual', (
    tester,
  ) async {
    await mount(tester);
    expect(card, findsNothing);
    await select(tester, 'biblioteca');
    expect(card, findsOneWidget);
    expect(find.text('Traçar rota'), findsOneWidget);
    expect(find.text('Rota acessível'), findsOneWidget);
    expect(routes.calls, isEmpty);
    expect(location.calls, 0); // GPS só ao pedir a rota.
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(location.calls, 1);
    expect(routes.calls, [('P26', false, _location)]);
    expect(camera.routes.single.destinationId, 'P26');
    expect(find.text('2 min a pé · 150 m'), findsOneWidget);
  });

  testWidgets('rota acessível: pedido acessível e troca refaz a rota', (
    tester,
  ) async {
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(find.text('Rota acessível'));
    await tester.pumpAndSettle();
    expect(routes.calls, isEmpty); // Sem rota na tela, só marca.
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(routes.calls.last.$2, isTrue);
    await tester.tap(find.text('Rota acessível'));
    await tester.pumpAndSettle();
    expect(routes.calls.map((c) => c.$2), [true, false]);
    expect(camera.routes.map((r) => r.accessible), [true, false]);
  });

  testWidgets('limpar remove a linha e fecha o card', (tester) async {
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Limpar rota'));
    await tester.pumpAndSettle();
    expect(card, findsNothing);
    expect(camera.cleared, greaterThanOrEqualTo(1));
    // Limpar a busca também limpa a rota.
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pumpAndSettle();
    final antes = camera.cleared;
    await tester.tap(find.byTooltip('Limpar busca'));
    await tester.pumpAndSettle();
    expect(card, findsNothing);
    expect(camera.cleared, antes + 1);
  });

  testWidgets('outro prédio apaga a rota anterior', (tester) async {
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pumpAndSettle();
    final antes = camera.cleared;
    await select(tester, 'icei');
    expect(camera.cleared, antes + 1);
    expect(summary, findsNothing);
    expect(find.text('ICEI'), findsWidgets);
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(routes.calls.last.$1, 'P34');
  });

  for (final (failure, message) in [
    (CampusRouteFailure.unavailable, 'Não foi possível calcular a rota agora.'),
    (CampusRouteFailure.outsideCampus, 'Você está longe dos caminhos'),
    (CampusRouteFailure.samePlace, 'Você já está neste local.'),
    (CampusRouteFailure.noPath, 'Não há rota até este local.'),
    (CampusRouteFailure.destinationUnavailable, 'ainda não tem rota'),
  ]) {
    testWidgets('falha $failure: mensagem e nenhuma linha', (tester) async {
      routes.failure = failure;
      await mount(tester);
      await select(tester, 'biblioteca');
      await tester.tap(trace);
      await tester.pumpAndSettle();
      expect(find.textContaining(message), findsOneWidget);
      expect(camera.routes, isEmpty);
      expect(card, findsOneWidget);
      // Pode tentar de novo.
      expect(tester.widget<FilledButton>(trace).onPressed, isNotNull);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('sem caminho acessível tem mensagem própria', (tester) async {
    routes.failure = CampusRouteFailure.noPath;
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(find.text('Rota acessível'));
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(find.text('Não há rota acessível até este local.'), findsOneWidget);
  });

  testWidgets('erro inesperado do serviço vira "agora não"', (tester) async {
    routes.error = StateError('rede');
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(
      find.text('Não foi possível calcular a rota agora.'),
      findsOneWidget,
    );
    expect(camera.routes, isEmpty);
  });

  testWidgets('falha ao refazer apaga a rota antiga', (tester) async {
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(summary, findsOneWidget);
    routes.failure = CampusRouteFailure.unavailable;
    final antes = camera.cleared;
    await tester.tap(find.text('Rota acessível'));
    await tester.pumpAndSettle();
    expect(summary, findsNothing);
    expect(camera.cleared, antes + 1);
  });

  testWidgets('permissão negada: mensagem de localização, sem pedido', (
    tester,
  ) async {
    location.status = CampusLocationStatus.denied;
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pumpAndSettle();
    expect(find.textContaining('Permissão negada'), findsOneWidget);
    expect(routes.calls, isEmpty);
  });

  testWidgets('limpar durante o cálculo: resposta tardia não desenha', (
    tester,
  ) async {
    final pending = Completer<CampusRoute>();
    routes.pending = pending;
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pump();
    expect(find.text('Calculando rota'), findsOneWidget);
    await tester.tap(find.byTooltip('Limpar rota'));
    await tester.pumpAndSettle();
    pending.complete(_rota('P26'));
    await tester.pumpAndSettle();
    expect(camera.routes, isEmpty);
    expect(card, findsNothing);
  });

  testWidgets('sair da tela durante o cálculo não desenha nem quebra', (
    tester,
  ) async {
    final pending = Completer<CampusRoute>();
    routes.pending = pending;
    await mount(tester);
    await select(tester, 'biblioteca');
    await tester.tap(trace);
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    controller.detach(camera);
    pending.complete(_rota('P26'));
    await tester.pumpAndSettle();
    expect(camera.routes, isEmpty);
    // Voltar: tela limpa, sem card.
    controller.attach(camera);
    await mount(tester);
    expect(card, findsNothing);
    expect(tester.takeException(), isNull);
  });

  group('controller', () {
    test('sem mapa: não liga o GPS', () async {
      controller.detach(camera);
      final r = await controller.routeTo('P26');
      expect(r.location, CampusLocationStatus.mapUnavailable);
      expect(location.calls, 0);
    });

    test('sem serviço: falha controlada', () async {
      final semRota = CampusMapController(
        placeRepository: _Repository(),
        locationService: location,
      )..attach(camera);
      addTearDown(semRota.dispose);
      expect(semRota.canRoute, isFalse);
      expect(
        (await semRota.routeTo('P26')).failure,
        CampusRouteFailure.unavailable,
      );
    });

    test('pedido novo cancela o anterior', () async {
      final pending = Completer<CampusRoute>();
      routes.pending = pending;
      final primeiro = controller.routeTo('P26');
      await Future<void>.delayed(Duration.zero);
      routes.pending = null;
      final segundo = await controller.routeTo('P34');
      pending.complete(_rota('P26'));
      expect((await primeiro).cancelled, isTrue);
      expect(segundo.route!.destinationId, 'P34');
      expect(camera.routes.map((r) => r.destinationId), ['P34']);
    });

    test('mapa indisponível ao desenhar não vira rota mostrada', () async {
      camera.fail = true;
      final r = await controller.routeTo('P26');
      expect(r.location, CampusLocationStatus.mapUnavailable);
      expect(r.route, isNull);
    });

    test('dispose cancela', () async {
      final pending = Completer<CampusRoute>();
      routes.pending = pending;
      final r = controller.routeTo('P26');
      await Future<void>.delayed(Duration.zero);
      controller.dispose();
      pending.complete(_rota('P26'));
      expect((await r).cancelled, isTrue);
      expect(camera.routes, isEmpty);
    });
  });

  test('CampusRoute valida a linha', () {
    expect(
      () => CampusRoute(
        destinationId: 'P26',
        coordinates: const [
          [-43.99, -19.92],
        ],
        distanceMeters: 0,
        durationSeconds: 0,
        accessible: false,
      ),
      throwsArgumentError,
    );
    expect(
      () => CampusRoute(
        destinationId: 'P26',
        coordinates: const [
          [-43.99, -19.92],
          [-43.99, 95],
        ],
        distanceMeters: 1,
        durationSeconds: 1,
        accessible: false,
      ),
      throwsArgumentError,
    );
  });

  test('resumo da rota', () {
    CampusRoute r(double m, int s) => CampusRoute(
      destinationId: 'P26',
      coordinates: const [
        [-43.99, -19.92],
        [-43.991, -19.921],
      ],
      distanceMeters: m,
      durationSeconds: s,
      accessible: false,
    );
    expect(campusRouteSummary(r(12, 9)), '1 min a pé · 10 m');
    expect(campusRouteSummary(r(655, 470)), '8 min a pé · 660 m');
    expect(campusRouteSummary(r(1234, 900)), '15 min a pé · 1,2 km');
  });

  test('camadas da linha: GeoJSON orientado, slot e oclusão', () {
    final feature = CampusRouteLayer.feature(_rota('P26'));
    expect(feature['geometry'], {
      'type': 'LineString',
      'coordinates': _rota('P26').coordinates,
    });
    final layers = CampusRouteLayer.layers;
    expect(layers.map((l) => l['id']), [
      CampusRouteLayer.casing,
      CampusRouteLayer.line,
    ]);
    for (final layer in layers) {
      expect(layer['type'], 'line');
      expect(layer['source'], CampusRouteLayer.source);
      expect(layer['slot'], 'middle');
      final paint = layer['paint'] as Map;
      expect(paint['line-occlusion-opacity'], greaterThan(0));
      expect(paint['line-emissive-strength'], 1.0);
    }
  });
}

class _Repository implements CampusPlaceRepository {
  @override
  Future<List<CampusPlace>> search(String query) async => switch (query) {
    'biblioteca' => [_biblioteca],
    'icei' => [_icei],
    _ => [],
  };

  @override
  Future<CampusPlace?> findById(String id) async =>
      [_biblioteca, _icei].where((p) => p.id == id).firstOrNull;
}

class _Location implements CampusLocationService {
  CampusLocationStatus status = CampusLocationStatus.located;
  int calls = 0;
  @override
  Future<CampusLocationResult> locate() async {
    calls++;
    return CampusLocationResult(
      status,
      location: status == CampusLocationStatus.located ? _location : null,
    );
  }

  @override
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}

class _Routes implements CampusRouteService {
  final calls = <(String, bool, CampusUserLocation)>[];
  CampusRouteFailure? failure;
  Object? error;
  Completer<CampusRoute>? pending;

  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required String destinationId,
    required bool accessible,
  }) async {
    calls.add((destinationId, accessible, origin));
    if (pending case final p?) return p.future;
    if (error case final e?) throw e;
    if (failure case final f?) throw CampusRouteException(f);
    return _rota(destinationId, accessible: accessible);
  }
}

class _Camera implements CampusMapCamera {
  final focused = <String>[];
  final routes = <CampusRoute>[];
  int cleared = 0;
  bool fail = false;
  @override
  Future<void> focus(CampusPlace place) async => focused.add(place.id);
  @override
  Future<void> showUser(CampusUserLocation location) async {}
  @override
  Future<void> showRoute(CampusRoute route) async {
    if (fail) throw StateError('Mapa indisponível.');
    routes.add(route);
  }

  @override
  Future<void> clearRoute() async {
    cleared++;
    routes.clear();
  }
}
