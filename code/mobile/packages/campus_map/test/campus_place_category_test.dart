import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

CampusSnapshot _snapshot() => CampusSnapshot.parse(
  File('assets/data/campus_footprints.geojson').readAsStringSync(),
);
LocalCampusPlaceRepository _repository() =>
    LocalCampusPlaceRepository(loadSnapshot: () async => _snapshot());

void main() {
  test('metadados de tipo vêm da importação por ID, sem alterar entidades', () {
    final exported = jsonDecode(
      File('../../../back/api/scripts/mapa/dados/pucmaps-12.json')
          .readAsStringSync(),
    ) as Map<String, dynamic>;
    final source = {
      for (final p in exported['predios'] as List)
        (p as Map<String, dynamic>)['id'] as String: p,
    };
    final snapshot = _snapshot();
    expect(snapshot.features, hasLength(82));
    expect(
      snapshot.metadata['classificationSource'],
      containsPair('field', 'predios.tipo'),
    );
    var classified = 0;
    for (final feature in snapshot.features) {
      final original = source[feature.id];
      final originalType = original?['tipo'];
      final included = CampusPlaceCategory.values.any(
        (category) => category.types.contains(originalType),
      );
      expect(feature.type, included ? originalType : null);
      if (feature.type != null) {
        classified++;
        expect(feature.properties['apiId'], original!['idOrigem']);
      }
    }
    expect(classified, 58);
    expect(snapshot.buildingCount, 82);
    expect(snapshot.areaCount, 0);
  });

  test('prédios acadêmicos reproduzem o conjunto original completo', () async {
    final ids = (await _repository().inCategory(CampusPlaceCategory.academic))
        .map((p) => p.id)
        .toSet();
    expect(ids, {
      'P01_R4751608',
      for (final n in [
        2,
        3,
        4,
        5,
        6,
        7,
        11,
        12,
        13,
        14,
        15,
        17,
        18,
        19,
        21,
        22,
        24,
        25,
        27,
        30,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        56,
        59,
        60,
        61,
        63,
        70,
        94,
      ])
        'P${n.toString().padLeft(2, '0')}',
      'P20_W88694480',
      'P20_W1519720025',
      'OSM_269543955',
      'OSM_1278031371',
      'OSM_1278041359',
      'OSM_1409922619',
    });
    expect(ids, hasLength(53));
    expect(
      (await _repository().inCategory(CampusPlaceCategory.academic))
          .take(4)
          .map((p) => p.code),
      ['1', '2', '3', '4'],
    );
  });

  for (final (category, ids) in [
    (CampusPlaceCategory.lab, {'P09', 'P10', 'P23'}),
    (CampusPlaceCategory.library, {'P26'}),
    (CampusPlaceCategory.sports, {'P65'}),
  ]) {
    test('${category.label}: IDs reais e nenhuma duplicação', () async {
      final places = await _repository().inCategory(category);
      expect(places.map((p) => p.id).toSet(), ids);
      expect(places, hasLength(ids.length));
      expect(places.every((p) => p.kind == CampusPlaceKind.building), isTrue);
    });
  }

  test(
    'categorias são disjuntas; preservam footprints com mesmo código',
    () async {
      final repository = _repository();
      final all = <CampusPlace>[];
      for (final category in CampusPlaceCategory.values) {
        all.addAll(await repository.inCategory(category));
      }
      expect(all, hasLength(58));
      expect(all.map((p) => p.id).toSet(), hasLength(58));
      expect(all.where((p) => p.code == '20'), hasLength(2));
      expect(all.where((p) => p.id == 'P01_W1519720030'), isEmpty);
      expect(all.where((p) => p.type == null), isEmpty);
    },
  );

  test(
    'tipos legados aceitos sem inferir por nome nem incluir salas/áreas',
    () {
      CampusPlace place(String? type, {CampusPlaceKind? kind}) => CampusPlace(
        id: 'P01',
        name: 'Sala de aula / laboratório / biblioteca / esporte',
        center: [-43.99, -19.92],
        type: type,
        kind: kind,
      );
      for (final type in [
        'ACADEMIC',
        'CLASSROOM',
        'AUDITORIUM',
        ' academic ',
      ]) {
        expect(CampusPlaceCategory.academic.contains(place(type)), isTrue);
      }
      for (final type in [
        null,
        'UNKNOWN',
        'LAB',
        'LIBRARY',
        'SPORTS',
        'SERVICE',
      ]) {
        expect(CampusPlaceCategory.academic.contains(place(type)), isFalse);
      }
      for (final kind in [CampusPlaceKind.room, CampusPlaceKind.area]) {
        expect(
          CampusPlaceCategory.academic.contains(place('CLASSROOM', kind: kind)),
          isFalse,
        );
      }
    },
  );

  test(
    'filtro textual opera dentro da categoria; busca global mantém contrato',
    () async {
      final repository = _repository();
      expect(await repository.search(''), isEmpty);
      expect(
        await repository.search('prédio'),
        hasLength(LocalCampusPlaceRepository.resultLimit),
      );
      expect(
        (await repository.inCategory(
          CampusPlaceCategory.library,
          query: ' BIBLIOTECA ',
        )).single.id,
        'P26',
      );
      expect(
        (await repository.inCategory(
          CampusPlaceCategory.lab,
          query: 'biologica',
        )).single.id,
        'P23',
      );
      expect(
        await repository.inCategory(
          CampusPlaceCategory.academic,
          query: 'biblioteca',
        ),
        isEmpty,
      );
      expect((await repository.search('biblioteca')).single.id, 'P26');
      expect(
        await repository.inCategory(CampusPlaceCategory.academic, query: ''),
        hasLength(53),
      );
    },
  );

  group('controles', () {
    late CampusMapController controller;
    late _Camera camera;
    late _Routes routes;
    setUp(() {
      camera = _Camera();
      routes = _Routes();
      controller = CampusMapController(
        placeRepository: _repository(),
        locationService: _Location(),
        routeService: routes,
        contentService: _Content(),
      )..attach(camera);
    });
    tearDown(() => controller.dispose());
    Future<void> mount(WidgetTester tester) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CampusMapControls(controller: controller)),
      ),
    );
    Future<void> open(WidgetTester tester) async {
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.tapAt(const Offset(790, 400));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('campus-category-quick-academic')));
      await tester.pumpAndSettle();
    }

    Future<void> category(
      WidgetTester tester,
      CampusPlaceCategory category,
    ) async {
      await tester.tap(find.byKey(Key('campus-category-${category.name}')));
      await tester.pumpAndSettle();
    }

    testWidgets('atalhos visíveis, roláveis e abrem diretamente a categoria', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(320, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await mount(tester);
      expect(find.byTooltip('Categorias de locais'), findsNothing);
      for (final c in CampusPlaceCategory.values) {
        expect(
          find.byKey(Key('campus-category-quick-${c.name}')),
          findsOneWidget,
        );
      }
      await tester.drag(
        find.byKey(const Key('campus-category-shortcuts')),
        const Offset(-550, 0),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('campus-category-quick-library')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('campus-category-place-P26')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('campus-category-place-P34')), findsNothing);
      Navigator.of(tester.element(find.text('Locais do campus'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField));
      tester.view.viewInsets = const FakeViewPadding(bottom: 260);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-category-shortcuts')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('atalhos respeitam fonte ampliada em tela estreita', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(320, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await mount(tester);
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('campus-category-quick-academic')),
        findsOneWidget,
      );
      await tester.drag(
        find.byKey(const Key('campus-category-shortcuts')),
        const Offset(-1600, 0),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('campus-category-quick-sports')));
      await tester.pumpAndSettle();
      await tester.drag(
        find.byKey(const Key('campus-category-results')),
        const Offset(0, -450),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('campus-category-place-P65')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'seleção foca o prédio, abre card normal e traça rota pelo ID',
      (tester) async {
        await mount(tester);
        await open(tester);
        expect(find.text('Locais do campus'), findsOneWidget);
        expect(find.byType(ChoiceChip), findsNWidgets(4));
        await category(tester, CampusPlaceCategory.library);
        await tester.tap(find.byKey(const Key('campus-category-place-P26')));
        await tester.pumpAndSettle();
        expect(camera.focused.single.id, 'P26');
        expect(
          camera.focused.single.center,
          (await _repository().findById('P26'))!.center,
        );
        expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
        await tester.tap(find.text('Traçar rota'));
        await tester.pumpAndSettle();
        expect(routes.targets.single, isA<CampusRoutePlace>());
        expect(routes.targets.single.key, 'P26');
        expect(camera.routes.single.destinationId, 'P26');
        expect(tester.takeException(), isNull);
      },
    );

    testWidgets(
      'busca preservada ao cancelar e continua global após categoria',
      (tester) async {
        await mount(tester);
        await tester.enterText(find.byType(TextField), '34');
        await tester.pumpAndSettle();
        await open(tester);
        await category(tester, CampusPlaceCategory.lab);
        await tester.enterText(
          find.byKey(const Key('campus-category-query')),
          'biologica',
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const Key('campus-category-place-P23')),
          findsOneWidget,
        );
        expect(
          find.byKey(const Key('campus-category-place-P09')),
          findsNothing,
        );
        Navigator.of(tester.element(find.text('Locais do campus'))).pop();
        await tester.pumpAndSettle();
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller!.text,
          '34',
        );
        await tester.enterText(find.byType(TextField), 'biblioteca');
        await tester.pumpAndSettle();
        await tester.tap(find.byType(ListTile));
        await tester.pumpAndSettle();
        expect(camera.focused.single.id, 'P26');
      },
    );

    testWidgets('Eventos e Onde comer mantêm listas e cards independentes', (
      tester,
    ) async {
      await controller.loadContent();
      await mount(tester);
      await open(tester);
      await category(tester, CampusPlaceCategory.sports);
      await tester.tap(find.byKey(const Key('campus-category-place-P65')));
      await tester.pumpAndSettle();
      for (final (button, id) in [
        ('campus-events-button', _Content.event.id),
        ('campus-restaurants-button', _Content.restaurant.id),
      ]) {
        await tester.tap(find.byKey(Key(button)));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key('campus-content-item-$id')));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('campus-content-card')), findsOneWidget);
        expect(find.byKey(const Key('campus-route-card')), findsNothing);
        expect(controller.selectedContent.value!.id, id);
      }
      await open(tester);
      await category(tester, CampusPlaceCategory.library);
      await tester.tap(find.byKey(const Key('campus-category-place-P26')));
      await tester.pumpAndSettle();
      expect(controller.selectedContent.value, isNull);
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
    });

    testWidgets('tela estreita e landscape com teclado não causam overflow', (
      tester,
    ) async {
      addTearDown(tester.view.resetViewInsets);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      for (final size in [const Size(320, 600), const Size(800, 360)]) {
        await tester.binding.setSurfaceSize(size);
        await mount(tester);
        await open(tester);
        tester.view.viewInsets = const FakeViewPadding(bottom: 140);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        Navigator.of(tester.element(find.text('Locais do campus'))).pop();
        tester.view.resetViewInsets();
        await tester.pumpAndSettle();
      }
    });
  });

  testWidgets('resposta antiga e descarte não sobrescrevem filtro novo', (
    tester,
  ) async {
    final catalog = _PendingCatalog();
    final controller = CampusMapController(placeCatalog: catalog);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CampusMapControls(controller: controller)),
      ),
    );
    await tester.tap(find.byKey(const Key('campus-category-quick-academic')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.byKey(const Key('campus-category-library')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('campus-category-place-P26')), findsOneWidget);
    catalog.pending.complete([]);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('campus-category-place-P26')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
    expect(tester.takeException(), isNull);
  });

  testWidgets('fechar o painel durante carga ignora resposta tardia', (
    tester,
  ) async {
    final catalog = _PendingCatalog();
    final controller = CampusMapController(placeCatalog: catalog);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CampusMapControls(controller: controller)),
      ),
    );
    await tester.tap(find.byKey(const Key('campus-category-quick-academic')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    Navigator.of(tester.element(find.text('Locais do campus'))).pop();
    await tester.pumpAndSettle();
    catalog.pending.complete(
      await _repository().inCategory(CampusPlaceCategory.academic),
    );
    await tester.pumpAndSettle();
    expect(find.text('Locais do campus'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });

  test(
    'foco da seleção local dispensa nova consulta e respeita detach',
    () async {
      final remote = _UnavailableRepository();
      final camera = _Camera();
      final controller = CampusMapController(
        placeRepository: remote,
        placeCatalog: _repository(),
      )..attach(camera);
      final place = (await controller.placesInCategory(
        CampusPlaceCategory.library,
      )).single;
      await controller.focusSelection(place);
      expect(camera.focused.single, same(place));
      expect(remote.calls, 0);
      controller.detach(camera);
      await expectLater(controller.focusSelection(place), throwsStateError);
      controller.dispose();
    },
  );
}

class _UnavailableRepository implements CampusPlaceRepository {
  int calls = 0;
  @override
  Future<CampusPlace?> findById(String id) async {
    calls++;
    throw StateError('offline');
  }

  @override
  Future<List<CampusPlace>> search(String query) async {
    calls++;
    throw StateError('offline');
  }
}

class _Camera implements CampusMapCamera {
  final focused = <CampusPlace>[];
  final routes = <CampusRoute>[];
  @override
  Future<void> focus(CampusPlace place) async => focused.add(place);
  @override
  Future<void> showUser(CampusUserLocation location) async {}
  @override
  Future<void> showRoute(CampusRoute route) async => routes.add(route);
  @override
  Future<void> clearRoute() async => routes.clear();
}

class _Location implements CampusLocationService {
  @override
  Future<CampusLocationResult> locate() async => const CampusLocationResult(
    CampusLocationStatus.located,
    location: CampusUserLocation(
      longitude: -43.99,
      latitude: -19.92,
      accuracy: 5,
    ),
  );
  @override
  Future<bool> openAppSettings() async => false;
  @override
  Future<bool> openLocationSettings() async => false;
}

class _Routes implements CampusRouteService {
  final targets = <CampusRouteTarget>[];
  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async {
    targets.add(destination);
    return CampusRoute(
      destinationId: destination.key,
      coordinates: [
        [-43.99, -19.92],
        [-43.991, -19.921],
      ],
      distanceMeters: 150,
      durationSeconds: 110,
      accessible: accessible,
    );
  }
}

class _Content implements CampusContentService {
  static final event = CampusEvent(
    id: '00000000-0000-0000-0000-000000000001',
    title: 'Evento de teste',
    start: DateTime(2026),
    end: DateTime(2027),
    status: CampusEventStatus.ongoing,
  );
  static final restaurant = CampusRestaurant(
    id: '00000000-0000-0000-0000-000000000002',
    title: 'Restaurante de teste',
    openNow: false,
    menuToday: false,
  );
  @override
  Future<List<CampusEvent>> events() async => [event];
  @override
  Future<List<CampusRestaurant>> restaurants() async => [restaurant];
  @override
  Future<CampusMenu?> menu(String id) async => null;
}

class _PendingCatalog implements CampusPlaceCatalog {
  final pending = Completer<List<CampusPlace>>();
  @override
  Future<List<CampusPlace>> inCategory(
    CampusPlaceCategory category, {
    String query = '',
  }) => category == CampusPlaceCategory.academic
      ? pending.future
      : _repository().inCategory(category, query: query);
}
