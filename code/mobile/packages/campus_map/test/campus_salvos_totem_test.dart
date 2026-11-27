import 'dart:math' as math;

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_map_icons.dart';
import 'package:campus_map/src/campus_saved_layer.dart';
import 'package:campus_map/src/three_d/campus_totem_spin.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

final _biblioteca = CampusPlace(
  id: 'P26',
  name: 'Biblioteca',
  code: '26',
  type: 'LIBRARY',
  kind: CampusPlaceKind.building,
  center: [-43.9931464, -19.92077335],
);
final _portaria = CampusPlace(
  id: 'GATE_9028126517',
  name: 'Portaria 1',
  type: 'GATE',
  kind: CampusPlaceKind.building,
  center: [-43.9896082, -19.922374],
);

void main() {
  late _Camera camera;
  late MemoryCampusSavedPlacesStore store;
  late CampusMapController controller;

  setUp(() async {
    camera = _Camera();
    store = MemoryCampusSavedPlacesStore([_biblioteca, _portaria]);
    controller = CampusMapController(
      placeRepository: LocalCampusPlaceRepository(),
      locationService: _Location(),
      contentService: _NoContent(),
      savedPlacesStore: store,
    )..attach(camera);
    await controller.loadSavedPlaces();
  });
  tearDown(() => controller.dispose());

  Future<void> mount(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 915));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CampusMapControls(controller: controller)),
      ),
    );
  }

  group('locais salvos visíveis', () {
    testWidgets('chip "Salvos" logo após os três principais, com contador', (
      tester,
    ) async {
      await mount(tester);
      final labels = tester
          .widgetList<CampusCategoryChip>(find.byType(CampusCategoryChip))
          .map((chip) => chip.label)
          .toList();
      expect(labels.take(4), [
        'Eventos',
        'Prédios acadêmicos',
        'Onde comer',
        'Salvos (2)',
      ]);
    });

    testWidgets('chip filtra o mapa, lista os salvos e abre o card focado', (
      tester,
    ) async {
      await mount(tester);
      await controller.toggleCategory(CampusPlaceCategory.library);
      final chip = find.byKey(const Key('campus-saved-button'));
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(controller.savedFilter.value, isTrue);
      // Filtro único: a categoria anterior sai.
      expect(controller.categoryFilter.value.category, isNull);
      expect(tester.widget<CampusCategoryChip>(chip).selected, isTrue);
      expect(find.byKey(const Key('campus-saved-sheet')), findsOneWidget);
      await tester.tap(find.byKey(const Key('campus-saved-GATE_9028126517')));
      await tester.pumpAndSettle();
      // Foco (câmera centralizada) e card do local.
      expect(camera.focused, ['GATE_9028126517']);
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
      expect(find.text('Portaria 1'), findsWidgets);
      // Tocar de novo no chip devolve o mapa completo.
      await tester.tap(find.byTooltip('Fechar'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(controller.savedFilter.value, isFalse);
      expect(find.byKey(const Key('campus-saved-sheet')), findsNothing);
    });

    testWidgets('busca vazia mostra os salvos; tocar foca e abre o card', (
      tester,
    ) async {
      await mount(tester);
      await tester.tap(find.byType(TextField));
      await tester.pump();
      expect(find.byKey(const Key('campus-search-saved')), findsOneWidget);
      expect(find.text('Locais salvos'), findsOneWidget);
      await tester.tap(find.byKey(const Key('campus-search-saved-P26')));
      await tester.pumpAndSettle();
      expect(camera.focused, ['P26']);
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
      // Digitar troca os salvos pelos resultados da busca.
      await tester.enterText(find.byType(TextField), 'bib');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-search-saved')), findsNothing);
    });

    testWidgets('pino do salvo no mapa abre o card', (tester) async {
      await mount(tester);
      controller.selectSavedPlace('P26');
      await tester.pumpAndSettle();
      expect(camera.focused, ['P26']);
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
      controller.selectSavedPlace('desconhecido');
      await tester.pumpAndSettle();
      expect(camera.focused, ['P26']);
    });

    test('pinos dos salvos: um por local, ícone de marcador', () {
      final features =
          CampusSavedLayer.geoJson([_biblioteca, _portaria])['features']
              as List;
      expect(features.map((f) => f['id']), ['P26', 'GATE_9028126517']);
      expect(features.first['geometry']['coordinates'], _biblioteca.center);
      expect(
        (CampusSavedLayer.layer['layout'] as Map)['icon-image'],
        CampusMapIcons.saved.id,
      );
    });

    test('chip de categoria ou conteúdo desmarca "Salvos"', () {
      expect(controller.toggleSavedFilter(), isTrue);
      expect(controller.toggleContentFilter(CampusContentKind.event), isTrue);
      expect(controller.savedFilter.value, isFalse);
      controller.toggleSavedFilter();
      // A categoria desmarca na hora; os pontos dela carregam depois.
      controller.toggleCategory(CampusPlaceCategory.sports).ignore();
      expect(controller.savedFilter.value, isFalse);
    });
  });

  group('giro do topo do totem (PUCMaps)', () {
    test('toque parado ou arraste lento não gira', () {
      expect(CampusTotemSpin.fromVelocity(0), isNull);
      expect(CampusTotemSpin.fromVelocity(0.05), isNull);
    });

    test('arraste rápido gira no sentido do dedo e freia até parar', () {
      final right = CampusTotemSpin.fromVelocity(1.5)!;
      final left = CampusTotemSpin.fromVelocity(-1.5)!;
      expect(right.degrees, greaterThan(CampusTotemSpin.minDegrees));
      expect(left.degrees, -right.degrees);
      expect(right.duration, lessThanOrEqualTo(const Duration(seconds: 5)));
      expect(CampusTotemSpin.at(10, right.degrees, 0), 10);
      expect(CampusTotemSpin.at(10, right.degrees, 1), 10 + right.degrees);
      // Atrito constante: metade do tempo já percorre 3/4 do giro.
      expect(CampusTotemSpin.at(0, 100, 0.5), 75);
    });

    test('velocidade de soltura usa a janela de amostras do arraste', () {
      expect(CampusTotemSpin.releaseVelocity(const []), 0);
      expect(
        CampusTotemSpin.releaseVelocity(const [
          (Duration(milliseconds: 0), 100),
          (Duration(milliseconds: 50), 200),
        ]),
        2,
      );
    });

    test('recompensa: faíscas proporcionais à energia do giro', () {
      final fraco = CampusTotemSpin.sparkles(0.45, math.Random(1));
      final forte = CampusTotemSpin.sparkles(1, math.Random(1));
      expect(forte.length, greaterThan(fraco.length));
    });
  });

  testWidgets('tipografia do mapa: Inter (pesos reais), não Poppins', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(412, 915));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(fontFamily: 'Poppins'),
        home: Scaffold(body: CampusMapControls(controller: controller)),
      ),
    );
    String? family(String text) => tester
        .renderObject<RenderParagraph>(find.text(text))
        .text
        .style
        ?.fontFamily;
    expect(family('Prédios acadêmicos'), CampusMapStyle.fontFamily);
    controller.selectPlace(_biblioteca);
    await tester.pumpAndSettle();
    expect(family('Remover dos salvos'), CampusMapStyle.fontFamily);
  });
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
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}

class _Camera implements CampusMapCamera {
  final focused = <String>[];
  @override
  Future<void> focus(CampusPlace place) async => focused.add(place.id);
  @override
  Future<void> showUser(CampusUserLocation location) async {}
  @override
  Future<void> showRoute(CampusRoute route) async {}
  @override
  Future<void> clearRoute() async {}
}

class _NoContent implements CampusContentService {
  @override
  Future<List<CampusEvent>> events() async => const [];
  @override
  Future<List<CampusRestaurant>> restaurants() async => const [];
  @override
  Future<CampusMenu?> menu(String restaurantId) async => null;
}
