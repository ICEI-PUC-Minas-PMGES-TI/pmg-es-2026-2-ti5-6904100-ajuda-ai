import 'dart:convert';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_map_icons.dart';
import 'package:campus_map/src/campus_map_lighting.dart';
import 'package:campus_map/src/campus_place_layer.dart';
import 'package:campus_map/src/campus_poi.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' hide Size;

// Locais como vêm de `GET /mapa/predios` (pucmaps-12).
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
final _cantina = CampusPlace(
  id: 'P16',
  name: 'Cantina - Prédio 16',
  code: '16',
  type: 'CAFETERIA',
  kind: CampusPlaceKind.building,
  center: [-43.99299141, -19.92260803],
);
final _postoMedico = CampusPlace(
  id: 'P08',
  name: 'Posto Médico - Prédio 8',
  code: '8',
  type: 'SERVICE',
  kind: CampusPlaceKind.building,
  center: [-43.993316256, -19.922961489],
);
const _location = CampusUserLocation(
  longitude: -43.99,
  latitude: -19.92,
  accuracy: 5,
);

void main() {
  group('pinos do PUCMaps', () {
    test('portarias e alimentação têm pino; SERVICE não vira restaurante', () {
      final features =
          CampusPoiLayer.geoJson([
                _portaria,
                _cantina,
                _postoMedico,
              ])['features']
              as List;
      expect(features.map((f) => f['id']), ['GATE_9028126517', 'P16']);
      expect(features.map((f) => f['properties']['icon']), [
        CampusMapIcons.gate.id,
        CampusMapIcons.food.id,
      ]);
      expect(CampusPoiKind.fromType('restaurant'), CampusPoiKind.food);
      expect(CampusPoiKind.fromType('SERVICE'), isNull);
    });

    test('mesmo layout da camada campus-symbol do PUCMaps', () {
      for (final layer in [CampusPoiLayer.layer, CampusPlaceLayer.layer]) {
        final layout = layer['layout'] as Map;
        expect(layout['icon-size'], [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0.6,
          18,
          0.85,
          21,
          1.1,
        ]);
        expect(layout['icon-allow-overlap'], isTrue);
        expect(layout['icon-anchor'], 'center');
        expect(layout['symbol-z-elevate'], isTrue);
        expect((layer['paint'] as Map)['icon-occlusion-opacity'], 0.6);
        expect(layer['slot'], 'top');
      }
    });

    testWidgets('pino de 30 pt desenhado a 3× em PNG', (tester) async {
      await tester.runAsync(() async {
        final image = await CampusMapIcons.render(CampusMapIcons.gate);
        expect(image.width, 90);
        expect(image.height, 90);
        expect(image.data.take(8), [137, 80, 78, 71, 13, 10, 26, 10]);
      });
    });

    test(
      'controller carrega uma vez, ignora sem pino e o toque abre o card',
      () async {
        final catalog = _Poi([_portaria, _cantina, _postoMedico, _portaria]);
        final controller = CampusMapController(
          placeRepository: _Repository(),
          pointOfInterestCatalog: catalog,
        );
        addTearDown(controller.dispose);
        await controller.loadPointsOfInterest();
        await controller.loadPointsOfInterest();
        expect(catalog.calls, 1);
        expect(controller.pointsOfInterest.value.map((p) => p.id), [
          'GATE_9028126517',
          'P16',
        ]);
        final selected = <CampusPlace>[];
        final sub = controller.placeSelections.listen(selected.add);
        addTearDown(sub.cancel);
        controller.selectPointOfInterest('P16');
        controller.selectPointOfInterest('desconhecido');
        expect(selected.map((p) => p.id), ['P16']);
      },
    );

    test(
      'falha do catálogo deixa o mapa sem pinos e permite nova carga',
      () async {
        final catalog = _Poi([_portaria])..fail = true;
        final controller = CampusMapController(pointOfInterestCatalog: catalog);
        addTearDown(controller.dispose);
        await controller.loadPointsOfInterest();
        expect(controller.pointsOfInterest.value, isEmpty);
        catalog.fail = false;
        await controller.loadPointsOfInterest();
        expect(controller.pointsOfInterest.value.single.id, _portaria.id);
      },
    );
  });

  test(
    'um filtro por vez: chip de conteúdo e categoria se desmarcam',
    () async {
      final controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
      );
      addTearDown(controller.dispose);
      await controller.toggleCategory(CampusPlaceCategory.library);
      expect(controller.toggleContentFilter(CampusContentKind.event), isTrue);
      expect(controller.categoryFilter.value.category, isNull);
      await controller.toggleCategory(CampusPlaceCategory.sports);
      expect(controller.contentFilter.value, isNull);
      expect(
        controller.toggleContentFilter(CampusContentKind.restaurant),
        isTrue,
      );
      expect(
        controller.toggleContentFilter(CampusContentKind.restaurant),
        isFalse,
      );
      expect(controller.contentFilter.value, isNull);
    },
  );

  group('locais salvos', () {
    test('formato gravado ida e volta; item inválido é ignorado', () {
      final json = jsonDecode(
        jsonEncode(CampusSavedPlaceCodec.encode([_biblioteca, _portaria])),
      );
      final places = CampusSavedPlaceCodec.decode([
        ...json as List,
        {'id': 'x'},
        'lixo',
      ]);
      expect(places.map((p) => p.id), ['P26', 'GATE_9028126517']);
      expect(places.first.kind, CampusPlaceKind.building);
      expect(places.first.type, 'LIBRARY');
      expect(places.first.center, _biblioteca.center);
    });

    test('falha ao gravar desfaz a mudança e é relançada', () async {
      final store = _FailingStore();
      final controller = CampusMapController(savedPlacesStore: store);
      addTearDown(controller.dispose);
      await expectLater(controller.toggleSaved(_biblioteca), throwsStateError);
      expect(controller.savedPlaces.value, isEmpty);
      expect(controller.isSaved('P26'), isFalse);
    });

    testWidgets('Salvar local grava; chip Salvos lista, reabre e remove', (
      tester,
    ) async {
      final store = MemoryCampusSavedPlacesStore();
      final h = _Harness(savedPlacesStore: store);
      addTearDown(h.dispose);
      await h.mount(tester);
      h.controller.selectPlace(_biblioteca);
      await tester.pumpAndSettle();
      final save = find.byKey(const Key('campus-place-save'));
      expect(find.text('Salvar local'), findsOneWidget);
      // Terceira ação: no aparelho, o usuário rola o card para vê-la inteira.
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect((await store.load()).single.id, 'P26');
      expect(find.text('Remover dos salvos'), findsOneWidget);
      await tester.ensureVisible(find.byTooltip('Fechar'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Fechar'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-route-card')), findsNothing);

      final chip = find.byKey(const Key('campus-saved-button'));
      await tester.ensureVisible(chip);
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-saved-sheet')), findsOneWidget);
      await tester.tap(find.byKey(const Key('campus-saved-P26')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
      expect(h.camera.focused.last, 'P26');

      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(await store.load(), isEmpty);
      expect(find.text('Salvar local'), findsOneWidget);
    });

    testWidgets('sem store o card não oferece salvar', (tester) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.mount(tester);
      h.controller.selectPlace(_biblioteca);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-place-save')), findsNothing);
      expect(find.byKey(const Key('campus-saved-button')), findsNothing);
    });
  });

  group('card do local', () {
    testWidgets('hierarquia do PUCMaps: nome, ações e destaque no mapa', (
      tester,
    ) async {
      final h = _Harness(savedPlacesStore: MemoryCampusSavedPlacesStore());
      addTearDown(h.dispose);
      await h.mount(tester);
      h.controller.selectPlace(_cantina);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-place-sheet')), findsOneWidget);
      expect(find.byKey(const Key('campus-place-sheet-handle')), findsOne);
      expect(find.text('Cantina - Prédio 16'), findsWidgets);
      expect(find.text('Alimentação'), findsOneWidget);
      for (final text in [
        'Ir até aqui',
        'Escolher ponto de partida',
        'Salvar local',
      ]) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
      expect(h.controller.selectedPlace.value?.id, 'P16');
      await tester.tap(find.byTooltip('Fechar'));
      await tester.pumpAndSettle();
      expect(h.controller.selectedPlace.value, isNull);
    });

    testWidgets('arrastar o sheet até o fim fecha o card', (tester) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.mount(tester);
      h.controller.selectPlace(_biblioteca);
      await tester.pumpAndSettle();
      await tester.dragFrom(
        tester.getCenter(find.byKey(const Key('campus-place-sheet-handle'))),
        const Offset(0, 500),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-route-card')), findsNothing);
      expect(h.controller.selectedPlace.value, isNull);
    });
  });

  group('escolher ponto de partida', () {
    testWidgets('rota entre locais sem GPS, no modo acessível', (tester) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.mount(tester);
      h.controller.selectPlace(_biblioteca);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('campus-accessible-routes')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('campus-route-origin')));
      await tester.pumpAndSettle();
      final sheet = find.byKey(const Key('campus-origin-sheet'));
      expect(sheet, findsOneWidget);
      expect(find.text('Destino: Biblioteca'), findsOneWidget);
      await tester.enterText(
        find.descendant(of: sheet, matching: find.byType(TextField)),
        'portaria',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('campus-origin-GATE_9028126517')));
      await tester.pumpAndSettle();
      expect(h.routes.between, [
        (CampusRouteTarget.place('GATE_9028126517'), 'P26', true),
      ]);
      expect(h.location.calls, 0);
      expect(h.camera.routes.single.accessible, isTrue);
      expect(
        find.text('Partindo de Portaria 1 · rota acessível'),
        findsOneWidget,
      );
      // Trocar o modo refaz a rota a partir da mesma partida.
      await tester.tap(find.byKey(const Key('campus-accessible-routes')));
      await tester.pumpAndSettle();
      expect(h.routes.between.last.$3, isFalse);
      expect(h.routes.between.last.$1, CampusRouteTarget.place(_portaria.id));
    });

    testWidgets('serviço sem rota entre locais não mostra a ação', (
      tester,
    ) async {
      final h = _Harness(routes: _GpsOnlyRoutes());
      addTearDown(h.dispose);
      await h.mount(tester);
      h.controller.selectPlace(_biblioteca);
      await tester.pumpAndSettle();
      expect(find.text('Ir até aqui'), findsOneWidget);
      expect(find.byKey(const Key('campus-route-origin')), findsNothing);
    });
  });

  group('luz', () {
    test('mesma sequência do PUCMaps e rótulo do automático', () {
      final modes = [CampusLightMode.auto];
      for (var i = 0; i < 5; i++) {
        modes.add(modes.last.next);
      }
      expect(modes.map((m) => m.label), [
        'Auto',
        'Amanhecer',
        'Dia',
        'Entardecer',
        'Noite',
        'Auto',
      ]);
      expect(
        CampusLightMode.auto.labelAt(DateTime(2026, 11, 11, 16)),
        'Auto (Entardecer)',
      );
      expect(
        CampusLightMode.dusk.labelAt(DateTime(2026, 11, 11, 10)),
        'Entardecer',
      );
    });

    test(
      'modo fixo ignora o horário; voltar ao automático segue o relógio',
      () async {
        final style = _Style();
        final glows = <double>[];
        final lighting = CampusMapLighting(
          style,
          now: () => DateTime(2026, 11, 11, 10),
          isActive: () => true,
          onWindowGlow: (glow) async => glows.add(glow),
        );
        addTearDown(lighting.dispose);
        await lighting.refresh();
        expect(style.config['lightPreset'], 'day');
        expect(style.config['showPointOfInterestLabels'], false);
        expect(style.config['showTransitLabels'], false);
        await lighting.setMode(CampusLightMode.night);
        expect(style.config['lightPreset'], 'night');
        expect(lighting.windowGlow, 1);
        await lighting.setMode(CampusLightMode.dusk);
        expect(style.config['lightPreset'], 'dusk');
        await lighting.setMode(CampusLightMode.auto);
        expect(style.config['lightPreset'], 'day');
        expect(glows, [0, 1, .35, 0]);
      },
    );

    testWidgets('botão "Luz" alterna o modo no controller', (tester) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.mount(tester);
      final button = find.byKey(const Key('campus-light-button'));
      expect(find.textContaining('Luz: Auto'), findsOneWidget);
      for (final label in ['Amanhecer', 'Dia', 'Entardecer', 'Noite']) {
        await tester.tap(button);
        await tester.pump();
        expect(find.text('Luz: $label'), findsOneWidget);
      }
      expect(h.controller.lightMode.value, CampusLightMode.night);
      await tester.tap(button);
      await tester.pump();
      expect(h.controller.lightMode.value, CampusLightMode.auto);
    });
  });

  group('controles laterais', () {
    testWidgets('+ e − pedem ±1 nível; acessibilidade alterna o modo', (
      tester,
    ) async {
      final h = _Harness();
      addTearDown(h.dispose);
      await h.mount(tester);
      await tester.tap(find.byTooltip('Aumentar zoom'));
      await tester.tap(find.byTooltip('Diminuir zoom'));
      await tester.pumpAndSettle();
      expect(h.camera.zooms, [1, -1]);
      expect(h.controller.accessibleRoutes.value, isFalse);
      await tester.tap(find.byTooltip('Ativar rotas acessíveis'));
      await tester.pumpAndSettle();
      expect(h.controller.accessibleRoutes.value, isTrue);
      expect(find.byTooltip('Rotas acessíveis ativadas'), findsOneWidget);
      // Sem rota na tela: só marca o modo, não pede rota nem GPS.
      expect(h.routes.calls, isEmpty);
      expect(h.location.calls, 0);
    });

    testWidgets('sem serviço de rota não há botão de acessibilidade', (
      tester,
    ) async {
      final controller = CampusMapController(
        placeRepository: _Repository(),
        locationService: _Location(),
      );
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: CampusMapControls(controller: controller)),
        ),
      );
      expect(find.byKey(const Key('campus-accessible-routes')), findsNothing);
      expect(find.byTooltip('Minha localização'), findsOneWidget);
    });

    testWidgets(
      'ordem das categorias: Eventos, Prédios acadêmicos, Onde comer',
      (tester) async {
        final h = _Harness(content: _NoContent());
        addTearDown(h.dispose);
        await h.mount(tester);
        final labels = tester
            .widgetList<CampusCategoryChip>(find.byType(CampusCategoryChip))
            .map((chip) => chip.label)
            .toList();
        expect(labels.take(3), ['Eventos', 'Prédios acadêmicos', 'Onde comer']);
        expect(labels, containsAll(['Laboratórios', 'Biblioteca', 'Esportes']));
      },
    );
  });
}

class _Harness {
  _Harness({
    CampusSavedPlacesStore? savedPlacesStore,
    CampusRouteService? routes,
    CampusContentService? content,
  }) : routes = routes is _Routes ? routes : _Routes() {
    controller = CampusMapController(
      placeRepository: _Repository(),
      locationService: location,
      routeService: routes ?? this.routes,
      savedPlacesStore: savedPlacesStore,
      contentService: content,
    )..attach(camera);
  }

  final camera = _Camera();
  final location = _Location();
  final _Routes routes;
  late final CampusMapController controller;

  /// Tela de celular (412 × 915): o sheet a 45 % mostra as três ações, como
  /// no aparelho; a tela padrão de teste (800 × 600) cortaria o card.
  Future<void> mount(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(412, 915));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CampusMapControls(controller: controller)),
      ),
    );
  }

  void dispose() => controller.dispose();
}

class _Repository implements CampusPlaceRepository {
  @override
  Future<List<CampusPlace>> search(String query) async => [
    for (final place in [_biblioteca, _portaria, _cantina])
      if (place.displayName.toLowerCase().contains(query.toLowerCase())) place,
  ];

  @override
  Future<CampusPlace?> findById(String id) async {
    for (final place in [_biblioteca, _portaria, _cantina]) {
      if (place.id == id) return place;
    }
    return null;
  }
}

class _Poi implements CampusPointOfInterestCatalog {
  _Poi(this.places);
  final List<CampusPlace> places;
  bool fail = false;
  int calls = 0;

  @override
  Future<List<CampusPlace>> pointsOfInterest() async {
    calls++;
    if (fail) throw StateError('rede');
    return places;
  }
}

class _FailingStore implements CampusSavedPlacesStore {
  @override
  Future<List<CampusPlace>> load() async => const [];

  @override
  Future<void> save(List<CampusPlace> places) async =>
      throw StateError('disco cheio');
}

class _Location implements CampusLocationService {
  int calls = 0;

  @override
  Future<CampusLocationResult> locate() async {
    calls++;
    return const CampusLocationResult(
      CampusLocationStatus.located,
      location: _location,
    );
  }

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;
}

class _Camera implements CampusMapCamera, CampusMapZoom {
  final focused = <String>[];
  final routes = <CampusRoute>[];
  final zooms = <double>[];

  @override
  Future<void> focus(CampusPlace place) async => focused.add(place.id);

  @override
  Future<void> showUser(CampusUserLocation location) async {}

  @override
  Future<void> showRoute(CampusRoute route) async => routes.add(route);

  @override
  Future<void> clearRoute() async {}

  @override
  Future<void> zoomBy(double delta) async => zooms.add(delta);
}

CampusRoute _route(String destination, bool accessible) => CampusRoute(
  destinationId: destination,
  coordinates: const [
    [-43.99, -19.92],
    [-43.991, -19.921],
  ],
  distanceMeters: 148,
  durationSeconds: 106,
  accessible: accessible,
);

class _Routes implements CampusPlaceRouteService {
  final calls = <(String, bool)>[];
  final between = <(CampusRouteTarget, String, bool)>[];

  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async {
    calls.add((destination.key, accessible));
    return _route(destination.key, accessible);
  }

  @override
  Future<CampusRoute> routeBetween({
    required CampusRouteTarget origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async {
    between.add((origin, destination.key, accessible));
    return _route(destination.key, accessible);
  }
}

class _GpsOnlyRoutes implements CampusRouteService {
  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async => _route(destination.key, accessible);
}

class _NoContent implements CampusContentService {
  @override
  Future<List<CampusEvent>> events() async => const [];

  @override
  Future<List<CampusRestaurant>> restaurants() async => const [];

  @override
  Future<CampusMenu?> menu(String restaurantId) async => null;
}

class _Style implements StyleManager {
  final config = <String, Object?>{};

  @override
  Future<List<StyleObjectInfo?>> getStyleImports() async => [
    StyleObjectInfo(id: 'basemap', type: 'style'),
  ];

  @override
  Future<void> setStyleImportConfigProperty(
    String importId,
    String configName,
    Object value,
  ) async {
    config[configName] = value;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
