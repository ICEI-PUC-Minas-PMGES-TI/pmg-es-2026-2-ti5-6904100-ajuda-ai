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

  group('descoberta cartográfica', () {
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
    Future<void> tapCategory(
      WidgetTester tester,
      CampusPlaceCategory category,
    ) async {
      final target = find.byKey(Key('campus-category-quick-${category.name}'));
      await tester.ensureVisible(target);
      await tester.tap(target);
      await tester.pumpAndSettle();
    }

    testWidgets(
      'nenhum ponto por padrão; uma categoria, toggle, sem sheet nem foco',
      (tester) async {
        await mount(tester);
        expect(controller.categoryFilter.value.places, isEmpty);
        for (final (category, ids) in [
          (
            CampusPlaceCategory.academic,
            (await _repository().inCategory(CampusPlaceCategory.academic))
                .map((p) => p.id)
                .toSet(),
          ),
          (CampusPlaceCategory.lab, {'P09', 'P10', 'P23'}),
          (CampusPlaceCategory.library, {'P26'}),
          (CampusPlaceCategory.sports, {'P65'}),
        ]) {
          await tapCategory(tester, category);
          final state = controller.categoryFilter.value;
          expect(state.category, category);
          expect(state.places.map((p) => p.id).toSet(), ids);
          expect(state.places.length, ids.length);
          expect(
            tester
                .widget<FilterChip>(
                  find.byKey(Key('campus-category-quick-${category.name}')),
                )
                .selected,
            isTrue,
          );
          expect(find.byType(BottomSheet), findsNothing);
          expect(find.byType(ListTile), findsNothing);
          expect(camera.focused, isEmpty);
        }
        await tapCategory(tester, CampusPlaceCategory.sports);
        expect(controller.categoryFilter.value.category, isNull);
        expect(controller.categoryFilter.value.places, isEmpty);
      },
    );
    testWidgets(
      'marcador resolve ID, abre card da busca, foco e rota acessível',
      (tester) async {
        await mount(tester);
        await tapCategory(tester, CampusPlaceCategory.library);
        controller.selectCategoryPlace(
          'P09',
        ); // toque antigo após troca de filtro
        await tester.pumpAndSettle();
        expect(camera.focused, isEmpty);
        controller.selectCategoryPlace('P26');
        await tester.pumpAndSettle();
        expect(camera.focused.single.id, 'P26');
        expect(
          camera.focused.single.center,
          (await _repository().findById('P26'))!.center,
        );
        expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
        await tester.tap(find.byType(Switch));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Traçar rota'));
        await tester.pumpAndSettle();
        expect(routes.targets.single.key, 'P26');
        expect(camera.routes.single.accessible, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
    testWidgets(
      'iniciar busca limpa categoria; resultados globais e seleção preservados',
      (tester) async {
        await mount(tester);
        await tapCategory(tester, CampusPlaceCategory.lab);
        await tester.enterText(find.byType(TextField), 'biblioteca');
        await tester.pumpAndSettle();
        expect(controller.categoryFilter.value.category, isNull);
        expect(controller.categoryFilter.value.places, isEmpty);
        await tester.tap(find.byType(ListTile));
        await tester.pumpAndSettle();
        expect(camera.focused.single.id, 'P26');
        expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
      },
    );
    testWidgets('Eventos e Onde comer mantêm conteúdo e cards independentes', (
      tester,
    ) async {
      await controller.loadContent();
      await mount(tester);
      await tapCategory(tester, CampusPlaceCategory.sports);
      for (final (button, id) in [
        ('campus-events-button', _Content.event.id),
        ('campus-restaurants-button', _Content.restaurant.id),
      ]) {
        await tester.tap(find.byKey(Key(button)));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key('campus-content-item-$id')));
        await tester.pumpAndSettle();
        expect(controller.selectedContent.value!.id, id);
        expect(find.byKey(const Key('campus-content-card')), findsOneWidget);
        expect(
          controller.categoryFilter.value.category,
          CampusPlaceCategory.sports,
        );
      }
      controller.selectCategoryPlace('P65');
      await tester.pumpAndSettle();
      expect(controller.selectedContent.value, isNull);
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
    });
    testWidgets('reentrada dos controles e fonte ampliada em tela estreita', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(320, 600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await mount(tester);
      await tapCategory(tester, CampusPlaceCategory.sports);
      expect(controller.categoryFilter.value.places.single.id, 'P65');
      await tester.pumpWidget(const SizedBox());
      await mount(tester);
      controller.selectCategoryPlace('P65');
      await tester.pumpAndSettle();
      expect(camera.focused, hasLength(1)); // listener anterior foi removido
      expect(tester.takeException(), isNull);
    });
  });

  test(
    'resposta antiga não repõe pontos após troca, busca ou descarte',
    () async {
      for (final mode in ['switch', 'clear', 'dispose']) {
        final catalog = _PendingCatalog();
        final controller = CampusMapController(placeCatalog: catalog);
        final old = controller.toggleCategory(CampusPlaceCategory.academic);
        if (mode == 'switch') {
          await controller.toggleCategory(CampusPlaceCategory.library);
        } else if (mode == 'clear') {
          controller.clearCategory();
        } else {
          controller.dispose();
        }
        catalog.pending.complete(
          await _repository().inCategory(CampusPlaceCategory.academic),
        );
        await old;
        if (mode != 'dispose') {
          expect(
            controller.categoryFilter.value.places.map((p) => p.id),
            mode == 'switch' ? ['P26'] : isEmpty,
          );
          controller.dispose();
        }
      }
    },
  );
  test('falha permite tentar novamente e coleção não duplica IDs', () async {
    final catalog = _RetryCatalog();
    final controller = CampusMapController(placeCatalog: catalog);
    await expectLater(
      controller.toggleCategory(CampusPlaceCategory.library),
      throwsStateError,
    );
    expect(controller.categoryFilter.value.category, isNull);
    await controller.toggleCategory(CampusPlaceCategory.library);
    expect(controller.categoryFilter.value.places.single.id, 'P26');
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

class _RetryCatalog implements CampusPlaceCatalog {
  int requests = 0;
  @override
  Future<List<CampusPlace>> inCategory(
    CampusPlaceCategory category, {
    String query = '',
  }) async {
    if (requests++ == 0) throw StateError('offline');
    final places = await _repository().inCategory(category);
    return [...places, ...places];
  }
}
