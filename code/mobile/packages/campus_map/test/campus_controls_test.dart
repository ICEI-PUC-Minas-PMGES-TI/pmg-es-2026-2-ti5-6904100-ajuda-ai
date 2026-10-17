import 'dart:async';

import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

final _place = CampusPlace(
  id: 'P26',
  name: 'Biblioteca',
  code: '26',
  center: [-43.9931464, -19.92077335],
);
const _location = CampusUserLocation(
  longitude: -43.99,
  latitude: -19.92,
  accuracy: 5,
);

void main() {
  late _Repository repository;
  late _Location service;
  late _Camera camera;
  late CampusMapController controller;
  setUp(() {
    repository = _Repository();
    service = _Location();
    camera = _Camera();
    controller = CampusMapController(
      placeRepository: repository,
      locationService: service,
    )..attach(camera);
  });
  tearDown(() => controller.dispose());

  Future<void> mount(WidgetTester tester) => tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: CampusMapControls(controller: controller)),
    ),
  );

  testWidgets('campo, botão, vazio e seleção escondem resultados e teclado', (
    tester,
  ) async {
    await mount(tester);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byTooltip('Minha localização'), findsOneWidget);
    expect(find.byType(ListTile), findsNothing);
    expect(service.calls, 0);
    await tester.enterText(find.byType(TextField), 'biblioteca');
    await tester.pumpAndSettle();
    expect(find.byType(ListTile), findsOneWidget);
    await tester.tap(find.byType(ListTile));
    await tester.pumpAndSettle();
    expect(camera.focused, [_place.id]);
    expect(find.byType(ListTile), findsNothing);
    expect(tester.testTextInput.isVisible, isFalse);
    await tester.tap(find.byTooltip('Limpar busca'));
    await tester.pumpAndSettle();
    expect(camera.focused, [_place.id]); // Limpar não move a câmera.
  });

  testWidgets('sem resultado e falha da fonte têm mensagens controladas', (
    tester,
  ) async {
    await mount(tester);
    await tester.enterText(find.byType(TextField), 'inexistente');
    await tester.pumpAndSettle();
    expect(find.text('Nenhum local encontrado.'), findsOneWidget);
    repository.fail = true;
    await tester.enterText(find.byType(TextField), 'biblioteca');
    await tester.pumpAndSettle();
    expect(find.textContaining('Não foi possível buscar'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final (status, message) in [
    (CampusLocationStatus.denied, 'Permissão negada'),
    (CampusLocationStatus.deniedForever, 'Permissão de localização bloqueada'),
    (CampusLocationStatus.serviceDisabled, 'Ative a localização'),
    (CampusLocationStatus.error, 'Não foi possível obter'),
  ]) {
    testWidgets('localização $status não quebra a tela', (tester) async {
      service.status = status;
      await mount(tester);
      await tester.tap(find.byTooltip('Minha localização'));
      await tester.pumpAndSettle();
      expect(find.textContaining(message), findsOneWidget);
      expect(camera.locations, isEmpty);
      expect(tester.takeException(), isNull);
      if (status == CampusLocationStatus.deniedForever ||
          status == CampusLocationStatus.serviceDisabled) {
        await tester.tap(find.text('Configurações'));
        await tester.pumpAndSettle();
        expect(service.settings, 1);
      }
    });
  }

  testWidgets('busca → localização reutiliza câmera', (tester) async {
    await mount(tester);
    await tester.enterText(find.byType(TextField), '26');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(ListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Minha localização'));
    await tester.pumpAndSettle();
    expect(camera.focused, [_place.id]);
    expect(camera.locations, [_location]);
    expect(service.calls, 1);
  });

  testWidgets(
    'resposta remota atrasada não substitui consulta nova ou limpeza',
    (tester) async {
      final pending = Completer<List<CampusPlace>>();
      repository.pending = pending;
      await mount(tester);
      await tester.enterText(find.byType(TextField), 'antiga');
      repository.pending = null;
      await tester.enterText(find.byType(TextField), 'inexistente');
      await tester.pumpAndSettle();
      pending.complete([_place]);
      await tester.pumpAndSettle();
      expect(find.byType(ListTile), findsNothing);
      expect(find.text('Nenhum local encontrado.'), findsOneWidget);
    },
  );

  testWidgets(
    'sair e voltar descarta controles sem listener ou resposta tardia',
    (tester) async {
      final pending = Completer<CampusLocationResult>();
      service.pending = pending;
      await mount(tester);
      await tester.tap(find.byTooltip('Minha localização'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      controller.detach(camera);
      pending.complete(
        const CampusLocationResult(
          CampusLocationStatus.located,
          location: _location,
        ),
      );
      await tester.pumpAndSettle();
      expect(camera.locations, isEmpty);
      controller.attach(camera);
      service.pending = null;
      await mount(tester);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'controller evita GPS antes do mapa e invalida operações após detach',
    () async {
      controller.detach(camera);
      expect(
        (await controller.moveToUser()).status,
        CampusLocationStatus.mapUnavailable,
      );
      expect(service.calls, 0);
      controller.attach(camera);
      final pending = Completer<CampusLocationResult>();
      service.pending = pending;
      final first = controller.moveToUser();
      final second = controller.moveToUser();
      expect(first, same(second));
      controller.detach(camera);
      controller.attach(camera);
      pending.complete(
        const CampusLocationResult(
          CampusLocationStatus.located,
          location: _location,
        ),
      );
      expect((await first).status, CampusLocationStatus.mapUnavailable);
      expect(camera.locations, isEmpty);
      expect(service.calls, 1);
    },
  );

  test('focus por ID, ID ausente e descarte do controller', () async {
    await controller.focusPlace(_place.id);
    expect(camera.focused, [_place.id]);
    await expectLater(
      controller.focusPlace('inexistente'),
      throwsArgumentError,
    );
    controller.dispose();
    expect(() => controller.search('26'), throwsStateError);
    expect(
      (await controller.moveToUser()).status,
      CampusLocationStatus.mapUnavailable,
    );
  });
}

class _Repository implements CampusPlaceRepository {
  bool fail = false;
  Completer<List<CampusPlace>>? pending;
  @override
  Future<List<CampusPlace>> search(String query) async {
    if (pending != null) return pending!.future;
    if (fail) throw StateError('falha');
    return ['biblioteca', '26'].contains(query) ? [_place] : [];
  }

  @override
  Future<CampusPlace?> findById(String id) async =>
      id == _place.id ? _place : null;
}

class _Location implements CampusLocationService {
  CampusLocationStatus status = CampusLocationStatus.located;
  int calls = 0;
  int settings = 0;
  Completer<CampusLocationResult>? pending;
  @override
  Future<CampusLocationResult> locate() async {
    calls++;
    return pending != null
        ? pending!.future
        : CampusLocationResult(
            status,
            location: status == CampusLocationStatus.located ? _location : null,
          );
  }

  @override
  Future<bool> openAppSettings() async {
    settings++;
    return true;
  }

  @override
  Future<bool> openLocationSettings() async {
    settings++;
    return true;
  }
}

class _Camera implements CampusMapCamera {
  final focused = <String>[];
  final locations = <CampusUserLocation>[];
  @override
  Future<void> focus(CampusPlace place) async => focused.add(place.id);
  @override
  Future<void> showUser(CampusUserLocation location) async =>
      locations.add(location);
}
