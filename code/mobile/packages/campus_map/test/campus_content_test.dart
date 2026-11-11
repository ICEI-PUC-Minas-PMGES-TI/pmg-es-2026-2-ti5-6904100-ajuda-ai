import 'dart:async';
import 'dart:convert';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_content_layer.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// Conteúdo como a coordenação cadastra (ids UUID do Ajuda-aí).
final _agora = DateTime.now();

final _feira = CampusEvent(
  id: '1a2b3c4d-1111-4a5b-8c6d-000000000001',
  title: 'Feira de Profissões',
  description: 'Estandes dos cursos no hall.',
  start: _agora.subtract(const Duration(hours: 1)),
  end: _agora.add(const Duration(hours: 2)),
  status: CampusEventStatus.ongoing,
  location: CampusContentLocation(
    kind: CampusContentLocationKind.building,
    id: 'P26',
    name: 'Biblioteca',
    center: const [-43.9931464, -19.92077335],
    routeTarget: CampusRouteTarget.place('P26'),
  ),
);
final _show = CampusEvent(
  id: '1a2b3c4d-1111-4a5b-8c6d-000000000002',
  title: 'Show na praça',
  start: _agora.add(const Duration(days: 3)),
  end: _agora.add(const Duration(days: 3, hours: 2)),
  status: CampusEventStatus.upcoming,
  location: CampusContentLocation(
    kind: CampusContentLocationKind.point,
    name: null,
    center: const [-43.9925, -19.9229],
    routeTarget: CampusRouteTarget.coordinate(
      longitude: -43.9925,
      latitude: -19.9229,
    ),
  ),
);

/// Prédio removido do mapa ativo: sem posição, sem rota; o card mostra texto.
final _palestra = CampusEvent(
  id: '1a2b3c4d-1111-4a5b-8c6d-000000000003',
  title: 'Palestra de boas-vindas',
  start: _agora.add(const Duration(days: 1)),
  end: _agora.add(const Duration(days: 1, hours: 1)),
  status: CampusEventStatus.upcoming,
  location: CampusContentLocation(
    kind: CampusContentLocationKind.building,
    id: 'P99',
    name: 'Prédio 99',
  ),
);

final _cantina = CampusRestaurant(
  id: '2b3c4d5e-2222-4a5b-8c6d-000000000001',
  title: 'Cantina do ICEI',
  description: 'Lanches e almoço.',
  location: CampusContentLocation(
    kind: CampusContentLocationKind.area,
    id: '5b1c9e2a-3d4f-4a6b-8c7d-9e0f1a2b3c4d',
    name: 'Praça de alimentação',
    center: const [-43.9919, -19.9237],
    routeTarget: CampusRouteTarget.coordinate(
      longitude: -43.9919,
      latitude: -19.9237,
    ),
  ),
  hours: [
    for (var dia = 0; dia < 7; dia++)
      CampusOpeningHours(day: dia, opens: '07:00', closes: '22:00'),
  ],
  openNow: true,
  menuToday: true,
);
final _quiosque = CampusRestaurant(
  id: '2b3c4d5e-2222-4a5b-8c6d-000000000002',
  title: 'Quiosque do Café',
  openNow: false,
  menuToday: false,
);

final _pucStop = CampusPucStop(
  id: '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10',
  name: 'Biblioteca Central',
  longitude: -43.994,
  latitude: -19.9226,
  radiusMeters: 40,
  xp: 50,
);

final _menuImagem = CampusMenu(
  url: Uri.parse('https://cdn.test/cardapios/cantina.png'),
  contentType: 'image/png',
  validFrom: DateTime(2026, 10, 12),
  validTo: DateTime(2026, 10, 18),
  sizeBytes: 120000,
);
final _menuPdf = CampusMenu(
  url: Uri.parse('https://cdn.test/cardapios/cantina.pdf'),
  contentType: 'application/pdf',
  validFrom: DateTime(2026, 10, 18),
  validTo: DateTime(2026, 10, 18),
);

const _location = CampusUserLocation(
  longitude: -43.99,
  latitude: -19.92,
  accuracy: 5,
);

void main() {
  group('modelos', () {
    test('valida id UUID, título e período do evento', () {
      for (final criar in <Object Function()>[
        () => CampusEvent(
          id: 'evento-1',
          title: 'x',
          start: _agora,
          end: _agora,
          status: CampusEventStatus.upcoming,
        ),
        () => CampusEvent(
          id: _feira.id.toUpperCase(),
          title: 'x',
          start: _agora,
          end: _agora,
          status: CampusEventStatus.upcoming,
        ),
        () => CampusEvent(
          id: _feira.id,
          title: '  ',
          start: _agora,
          end: _agora,
          status: CampusEventStatus.upcoming,
        ),
        () => CampusEvent(
          id: _feira.id,
          title: 'x',
          start: _agora,
          end: _agora.subtract(const Duration(minutes: 1)),
          status: CampusEventStatus.upcoming,
        ),
        () => CampusRestaurant(
          id: 'P26',
          title: 'x',
          openNow: true,
          menuToday: false,
        ),
      ]) {
        expect(criar, throwsArgumentError);
      }
      expect(_feira.start.isUtc, isTrue);
    });

    test('horário: dia 0..6, HH:mm e fecha depois de abrir', () {
      for (final (dia, abre, fecha) in [
        (7, '08:00', '10:00'),
        (-1, '08:00', '10:00'),
        (1, '8:00', '10:00'),
        (1, '08:00', '24:00'),
        (1, '10:00', '10:00'),
        (1, '12:00', '10:00'),
      ]) {
        expect(
          () => CampusOpeningHours(day: dia, opens: abre, closes: fecha),
          throwsArgumentError,
          reason: '$dia $abre $fecha',
        );
      }
      final r = CampusRestaurant(
        id: _quiosque.id,
        title: 'x',
        hours: [
          CampusOpeningHours(day: 1, opens: '18:00', closes: '21:00'),
          CampusOpeningHours(day: 1, opens: '11:00', closes: '14:00'),
          CampusOpeningHours(day: 2, opens: '08:00', closes: '09:00'),
        ],
        openNow: false,
        menuToday: false,
      );
      expect(r.hoursOn(1).map((h) => h.opens), ['11:00', '18:00']);
      expect(r.hoursOn(0), isEmpty);
    });

    test('local sem posição não tem rota; coordenada validada', () {
      final semPosicao = CampusContentLocation(
        kind: CampusContentLocationKind.building,
        id: 'P99',
        routeTarget: CampusRouteTarget.place('P99'),
      );
      expect(semPosicao.hasPosition, isFalse);
      expect(semPosicao.routeTarget, isNull);
      expect(
        () => CampusContentLocation(
          kind: CampusContentLocationKind.point,
          center: const [-200, 0],
        ),
        throwsArgumentError,
      );
    });

    test('cardápio: URL http(s), tipo suportado e vigência', () {
      expect(_menuImagem.isImage, isTrue);
      expect(_menuPdf.isPdf, isTrue);
      for (final criar in <CampusMenu Function()>[
        () => CampusMenu(
          url: Uri.parse('/cardapio.png'),
          contentType: 'image/png',
          validFrom: DateTime(2026),
          validTo: DateTime(2026),
        ),
        () => CampusMenu(
          url: Uri.parse('ftp://cdn.test/c.png'),
          contentType: 'image/png',
          validFrom: DateTime(2026),
          validTo: DateTime(2026),
        ),
        () => CampusMenu(
          url: Uri.parse('https://cdn.test/c.gif'),
          contentType: 'image/gif',
          validFrom: DateTime(2026),
          validTo: DateTime(2026),
        ),
        () => CampusMenu(
          url: Uri.parse('https://cdn.test/c.png'),
          contentType: 'image/png',
          validFrom: DateTime(2026, 2),
          validTo: DateTime(2026, 1),
        ),
      ]) {
        expect(criar, throwsArgumentError);
      }
    });
  });

  group('rótulos pt-BR', () {
    // Sábado, 17/10/2026, 10:00 no horário local do aparelho.
    final agora = DateTime(2026, 10, 17, 10);
    CampusEvent evento(DateTime inicio, DateTime fim) => CampusEvent(
      id: _feira.id,
      title: 'x',
      start: inicio,
      end: fim,
      status: CampusEventStatus.upcoming,
    );

    test('período do evento no horário local', () {
      expect(
        campusEventSchedule(
          evento(DateTime(2026, 10, 17, 14), DateTime(2026, 10, 17, 16, 30)),
          now: agora,
        ),
        'Hoje · 14:00–16:30',
      );
      expect(
        campusEventSchedule(
          evento(DateTime(2026, 10, 18, 9), DateTime(2026, 10, 18, 11)),
          now: agora,
        ),
        'Amanhã · 09:00–11:00',
      );
      expect(
        campusEventSchedule(
          evento(DateTime(2026, 10, 24, 19), DateTime(2026, 10, 24, 22)),
          now: agora,
        ),
        'sáb., 24/10 · 19:00–22:00',
      );
      expect(
        campusEventSchedule(
          evento(DateTime(2026, 10, 20, 8), DateTime(2026, 10, 22, 18)),
          now: agora,
        ),
        'ter., 20/10 08:00 – qui., 22/10 18:00',
      );
      // Instante em UTC (como o servidor manda) aparece no fuso local.
      final utc = evento(
        DateTime(2026, 10, 17, 14).toUtc(),
        DateTime(2026, 10, 17, 15).toUtc(),
      );
      expect(campusEventSchedule(utc, now: agora), 'Hoje · 14:00–15:00');
      expect(
        campusEventStatusLabel(CampusEventStatus.ongoing),
        'Acontecendo agora',
      );
      expect(campusEventStatusLabel(CampusEventStatus.upcoming), 'Em breve');
    });

    test('horário de hoje do restaurante (0 = domingo)', () {
      final r = CampusRestaurant(
        id: _quiosque.id,
        title: 'x',
        hours: [
          CampusOpeningHours(day: 6, opens: '18:00', closes: '21:00'),
          CampusOpeningHours(day: 6, opens: '11:00', closes: '14:00'),
          CampusOpeningHours(day: 0, opens: '08:00', closes: '12:00'),
        ],
        openNow: false,
        menuToday: false,
      );
      expect(
        campusRestaurantHoursToday(r, now: agora),
        'Hoje: 11:00–14:00, 18:00–21:00',
      );
      expect(
        campusRestaurantHoursToday(r, now: DateTime(2026, 10, 18, 9)),
        'Hoje: 08:00–12:00',
      );
      expect(
        campusRestaurantHoursToday(r, now: DateTime(2026, 10, 19, 9)),
        'Fechado hoje',
      );
      // Sem horário cadastrado: desconhecido, não "fechado".
      expect(
        campusRestaurantHoursToday(_quiosque, now: agora),
        'Horário não informado',
      );
    });
  });

  group('camadas', () {
    test('GeoJSON só com itens posicionados, tipo e destaque', () {
      final data = CampusContentLayer.geoJson(
        [_feira, _show, _palestra],
        [_cantina, _quiosque],
      );
      final features = data['features'] as List;
      expect(features.map((f) => f['properties']), [
        {
          'id': _feira.id,
          'kind': 'event',
          'name': 'Feira de Profissões',
          'active': true,
        },
        {
          'id': _show.id,
          'kind': 'event',
          'name': 'Show na praça',
          'active': false,
        },
        {
          'id': _cantina.id,
          'kind': 'restaurant',
          'name': 'Cantina do ICEI',
          'active': true,
        },
      ]);
      expect(features.first['geometry'], {
        'type': 'Point',
        'coordinates': [-43.9931464, -19.92077335],
      });
      expect(features.first['id'], 'event-${_feira.id}');
      expect(
        (CampusContentLayer.geoJson(const [], const [])['features'] as List),
        isEmpty,
      );
    });

    test('pinos a partir do zoom 15, nome a partir do 17', () {
      final layers = {for (final l in CampusContentLayer.layers) l['id']: l};
      final dot = layers[CampusContentLayer.dot]!;
      final label = layers[CampusContentLayer.label]!;
      expect(dot['type'], 'symbol');
      expect(dot['minzoom'], 15.0);
      expect(label['minzoom'], 17.0);
      expect((label['layout'] as Map).containsKey('icon-image'), isFalse);
      expect(CampusContentLayer.pickable, [CampusContentLayer.dot]);
      for (final layer in layers.values) {
        expect(layer['source'], CampusContentLayer.source);
      }
    });

    test(
      'ponto e nome acima do 3D (o local costuma ser o centro de um prédio)',
      () {
        final layers = {for (final l in CampusContentLayer.layers) l['id']: l};
        final dot = layers[CampusContentLayer.dot]!;
        expect(dot['slot'], 'top');
        expect(layers[CampusContentLayer.label]!['slot'], 'top');
        expect((dot['layout'] as Map)['symbol-z-elevate'], isTrue);
        // Pino do PUCMaps pelo tipo: evento roxo, restaurante com talheres.
        expect(
          jsonEncode((dot['layout'] as Map)['icon-image']),
          allOf(contains('campus-poi-event'), contains('campus-poi-food')),
        );
      },
    );
  });

  group('controller', () {
    late _Content service;
    late _Camera camera;
    late _Routes routes;
    late CampusMapController controller;
    setUp(() {
      service = _Content();
      camera = _Camera();
      routes = _Routes();
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: _Location(),
        routeService: routes,
        pucStopService: _PucStops(),
        contentService: service,
      )..attach(camera);
    });
    tearDown(() => controller.dispose());

    test('carrega eventos e restaurantes uma vez', () async {
      expect(controller.eventsStatus.value, CampusContentStatus.idle);
      await controller.loadContent();
      await controller.loadContent();
      expect(controller.events.value, [_feira, _show, _palestra]);
      expect(controller.restaurants.value, [_cantina, _quiosque]);
      expect(controller.eventsStatus.value, CampusContentStatus.ready);
      expect(service.eventCalls, 1);
      expect(service.restaurantCalls, 1);
    });

    test('sem eventos: lista vazia pronta, não é erro', () async {
      service.eventList = [];
      await controller.loadContent();
      expect(controller.events.value, isEmpty);
      expect(controller.eventsStatus.value, CampusContentStatus.ready);
    });

    test(
      'falha: estado de erro só na lista que falhou e nova tentativa',
      () async {
        service.eventError = Exception('offline');
        await controller.loadContent();
        expect(controller.eventsStatus.value, CampusContentStatus.failed);
        expect(controller.restaurantsStatus.value, CampusContentStatus.ready);
        service.eventError = null;
        await controller.loadContent();
        expect(controller.eventsStatus.value, CampusContentStatus.ready);
        expect(controller.events.value, hasLength(3));
      },
    );

    test(
      'recarregar (app voltou): novo aparece, encerrado some e fecha o card',
      () async {
        await controller.loadContent();
        controller.selectContent(_show);
        service.eventList = [_feira, _palestra];
        await controller.reloadContent();
        expect(controller.events.value, [_feira, _palestra]);
        expect(controller.selectedContent.value, isNull);
        expect(service.eventCalls, 2);
      },
    );

    test('recarregar troca o item aberto pela versão nova', () async {
      await controller.loadContent();
      controller.selectContent(_cantina);
      final fechada = CampusRestaurant(
        id: _cantina.id,
        title: _cantina.title,
        location: _cantina.location,
        openNow: false,
        menuToday: false,
      );
      service.restaurantList = [fechada];
      await controller.reloadContent();
      expect(controller.selectedContent.value, same(fechada));
    });

    test('recarregar sem rede mantém a lista anterior', () async {
      await controller.loadContent();
      service.eventError = Exception('offline');
      service.restaurantError = Exception('offline');
      await controller.reloadContent();
      expect(controller.events.value, hasLength(3));
      expect(controller.eventsStatus.value, CampusContentStatus.ready);
    });

    test('resposta atrasada de um pedido antigo é descartada', () async {
      final antigo = Completer<List<CampusEvent>>();
      service.pendingEvents = antigo;
      final primeiro = controller.loadContent();
      await Future<void>.delayed(Duration.zero);
      service.pendingEvents = null;
      service.eventList = [_show];
      await controller.reloadContent();
      antigo.complete([_feira, _show, _palestra]);
      await primeiro;
      expect(controller.events.value, [_show]);
    });

    test('sair da tela durante a carga não quebra', () async {
      final pendente = Completer<List<CampusEvent>>();
      service.pendingEvents = pendente;
      final carga = controller.loadContent();
      await Future<void>.delayed(Duration.zero);
      controller.dispose();
      pendente.complete([_feira]);
      await carga;
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
      );
    });

    test('um card por vez: conteúdo e PucStop se excluem', () async {
      await controller.loadContent();
      await controller.loadPucStops();
      controller.selectPucStop(_pucStop.id);
      controller.selectContent(_feira);
      expect(controller.selectedPucStop.value, isNull);
      expect(controller.selectedContent.value, _feira);
      controller.selectPucStop(_pucStop.id);
      expect(controller.selectedContent.value, isNull);
    });

    test('focar leva a câmera ao centro do local', () async {
      await controller.focusContent(_cantina);
      expect(camera.focused.single.center, [-43.9919, -19.9237]);
      expect(camera.focused.single.displayName, 'Cantina do ICEI');
      await expectLater(
        controller.focusContent(_palestra),
        throwsArgumentError,
      );
      controller.detach(camera);
      await expectLater(controller.focusContent(_feira), throwsStateError);
    });

    test('rota: prédio pelo id, área/ponto pela coordenada', () async {
      final predio = await controller.routeToContent(_feira);
      expect(predio.route, isNotNull);
      expect(routes.targets.last, CampusRouteTarget.place('P26'));
      await controller.routeToContent(_cantina, accessible: true);
      expect(
        routes.targets.last,
        CampusRouteTarget.coordinate(longitude: -43.9919, latitude: -19.9237),
      );
      expect(routes.accessible.last, isTrue);
      final semRota = await controller.routeToContent(_palestra);
      expect(semRota.failure, CampusRouteFailure.destinationUnavailable);
      expect(routes.targets, hasLength(2));
    });

    test(
      'cardápio: delega; restaurante desativado recarrega a lista',
      () async {
        await controller.loadContent();
        service.menuResult = _menuImagem;
        expect(await controller.menuFor(_cantina.id), _menuImagem);
        expect(service.menuCalls, [_cantina.id]);
        service.menuError = const CampusContentException(
          CampusContentFailure.notFound,
        );
        service.restaurantList = [_quiosque];
        await expectLater(
          controller.menuFor(_cantina.id),
          throwsA(isA<CampusContentException>()),
        );
        await Future<void>.delayed(Duration.zero);
        expect(service.restaurantCalls, 2);
        service.menuError = StateError('x');
        await expectLater(
          controller.menuFor(_quiosque.id),
          throwsA(
            isA<CampusContentException>().having(
              (e) => e.failure,
              'failure',
              CampusContentFailure.offline,
            ),
          ),
        );
      },
    );
  });

  group('tela', () {
    late _Content service;
    late _Camera camera;
    late _Routes routes;
    late CampusMapController controller;
    late List<Uri> abertos;
    bool abre = true;

    setUp(() {
      service = _Content();
      camera = _Camera();
      routes = _Routes();
      abertos = [];
      abre = true;
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: _Location(),
        routeService: routes,
        pucStopService: _PucStops(),
        contentService: service,
      )..attach(camera);
    });
    tearDown(() => controller.dispose());

    Future<void> mount(
      WidgetTester tester, {
      CampusMapController? other,
      bool showEvents = true,
      bool showRestaurants = true,
      bool opener = true,
    }) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CampusMapControls(
            controller: other ?? controller,
            showEvents: showEvents,
            showRestaurants: showRestaurants,
            openExternalUrl: opener
                ? (url) async {
                    abertos.add(url);
                    return abre;
                  }
                : null,
          ),
        ),
      ),
    );

    final eventos = find.byKey(const Key('campus-events-button'));
    final comer = find.byKey(const Key('campus-restaurants-button'));
    final card = find.byKey(const Key('campus-content-card'));

    Future<void> open(WidgetTester tester, Finder button) async {
      await tester.tap(button);
      await tester.pumpAndSettle();
    }

    Future<void> pick(WidgetTester tester, CampusContent item) async {
      await tester.tap(find.byKey(Key('campus-content-item-${item.id}')));
      await tester.pumpAndSettle();
    }

    testWidgets('atalhos só com serviço e flags ligadas', (tester) async {
      final semConteudo = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: _Location(),
      );
      addTearDown(semConteudo.dispose);
      await mount(tester, other: semConteudo);
      expect(eventos, findsNothing);
      expect(comer, findsNothing);
      await mount(tester, showRestaurants: false);
      expect(eventos, findsOneWidget);
      expect(comer, findsNothing);
      await mount(tester);
      expect(find.text('Eventos'), findsOneWidget);
      expect(find.text('Onde comer'), findsOneWidget);
    });

    testWidgets('lista de eventos: título, período, situação e local', (
      tester,
    ) async {
      await mount(tester);
      await open(tester, eventos);
      expect(find.text('Eventos no campus'), findsOneWidget);
      expect(find.text('Feira de Profissões'), findsOneWidget);
      expect(find.text(campusEventSchedule(_feira)), findsOneWidget);
      expect(find.text('Acontecendo agora'), findsOneWidget);
      expect(find.text('Em breve'), findsNWidgets(2));
      expect(
        find.descendant(
          of: find.byKey(const Key('campus-events-sheet')),
          matching: find.text('Biblioteca'),
        ),
        findsOneWidget,
      );
      expect(service.eventCalls, 1);
    });

    testWidgets('lista de restaurantes: aberto, horário de hoje e cardápio', (
      tester,
    ) async {
      await mount(tester);
      await open(tester, comer);
      expect(find.text('Cantina do ICEI'), findsOneWidget);
      expect(find.text('Aberto agora'), findsOneWidget);
      // Quiosque sem horário: sem selo aberto/fechado.
      expect(find.text('Fechado'), findsNothing);
      expect(find.text('Hoje: 07:00–22:00'), findsOneWidget);
      expect(find.text('Horário não informado'), findsOneWidget);
      expect(find.text('Fechado hoje'), findsNothing);
      expect(find.text('Cardápio de hoje'), findsOneWidget);
      expect(find.text('Praça de alimentação'), findsOneWidget);
    });

    testWidgets('vazio: mensagens próprias', (tester) async {
      service.eventList = [];
      service.restaurantList = [];
      await mount(tester);
      await open(tester, eventos);
      expect(find.text('Nenhum evento programado.'), findsOneWidget);
      await tester.tapAt(const Offset(10, 10)); // Fecha a lista.
      await tester.pumpAndSettle();
      await open(tester, comer);
      expect(find.text('Nenhum restaurante cadastrado.'), findsOneWidget);
    });

    testWidgets('sem rede: erro e "Tentar novamente" carrega', (tester) async {
      service.eventError = Exception('offline');
      await mount(tester);
      await open(tester, eventos);
      expect(find.byKey(const Key('campus-content-error')), findsOneWidget);
      expect(find.text('Tentar novamente'), findsOneWidget);
      service.eventError = null;
      await tester.tap(find.byKey(const Key('campus-content-retry')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-content-error')), findsNothing);
      expect(find.text('Feira de Profissões'), findsOneWidget);
    });

    testWidgets('escolher: fecha a lista, foca o mapa e abre o card', (
      tester,
    ) async {
      await mount(tester);
      await open(tester, eventos);
      await pick(tester, _feira);
      expect(find.byKey(const Key('campus-events-sheet')), findsNothing);
      expect(camera.focused.single.id, _feira.id);
      expect(card, findsOneWidget);
      expect(find.text('Feira de Profissões'), findsOneWidget);
      expect(find.text('Estandes dos cursos no hall.'), findsOneWidget);
      expect(find.text('Ver no mapa'), findsOneWidget);
      expect(find.text('Traçar rota'), findsOneWidget);
      expect(find.text('Ver cardápio'), findsNothing);
      await tester.tap(find.byKey(const Key('campus-content-focus')));
      await tester.pumpAndSettle();
      expect(camera.focused, hasLength(2));
      await tester.tap(find.byKey(const Key('campus-content-close')));
      await tester.pumpAndSettle();
      expect(card, findsNothing);
      expect(controller.selectedContent.value, isNull);
    });

    testWidgets('sem posição: texto no card, sem foco nem rota', (
      tester,
    ) async {
      await mount(tester);
      await open(tester, eventos);
      await pick(tester, _palestra);
      expect(camera.focused, isEmpty);
      expect(card, findsOneWidget);
      expect(find.text('Prédio 99'), findsOneWidget);
      expect(
        find.byKey(const Key('campus-content-no-position')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('campus-content-focus')), findsNothing);
      expect(find.byKey(const Key('campus-content-trace')), findsNothing);
    });

    testWidgets('sem serviço de rota: card sem "Traçar rota"', (tester) async {
      final semRota = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: _Location(),
        contentService: service,
      )..attach(camera);
      addTearDown(semRota.dispose);
      await mount(tester, other: semRota);
      await open(tester, comer);
      await pick(tester, _cantina);
      expect(find.text('Ver no mapa'), findsOneWidget);
      expect(find.byKey(const Key('campus-content-trace')), findsNothing);
      expect(find.text('Ver cardápio'), findsOneWidget);
    });

    testWidgets('traçar rota pela coordenada do local e resumo', (
      tester,
    ) async {
      await mount(tester);
      await open(tester, comer);
      await pick(tester, _cantina);
      await tester.tap(find.byKey(const Key('campus-content-trace')));
      await tester.pumpAndSettle();
      expect(routes.targets.single, isA<CampusRouteCoordinate>());
      expect(camera.routes, hasLength(1));
      expect(
        find.byKey(const Key('campus-content-route-summary')),
        findsOneWidget,
      );
      // Fechar o card apaga a linha.
      await tester.tap(find.byKey(const Key('campus-content-close')));
      await tester.pumpAndSettle();
      expect(camera.routes, isEmpty);
    });

    testWidgets('falha da rota usa as mensagens do mapa', (tester) async {
      routes.failure = CampusRouteFailure.destinationOutside;
      await mount(tester);
      await open(tester, comer);
      await pick(tester, _cantina);
      await tester.tap(find.byKey(const Key('campus-content-trace')));
      await tester.pumpAndSettle();
      expect(
        find.text('Este local fica longe dos caminhos do campus.'),
        findsOneWidget,
      );
      expect(camera.routes, isEmpty);
    });

    testWidgets('cardápio em imagem abre o visualizador', (tester) async {
      service.menuResult = _menuImagem;
      await mount(tester);
      await open(tester, comer);
      await pick(tester, _cantina);
      await tester.tap(find.byKey(const Key('campus-content-menu')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-menu-image')), findsOneWidget);
      expect(find.text('Cardápio · Cantina do ICEI'), findsOneWidget);
      final imagem = tester.widget<Image>(find.byType(Image));
      expect(
        (imagem.image as NetworkImage).url,
        'https://cdn.test/cardapios/cantina.png',
      );
      expect(abertos, isEmpty);
      await tester.tap(find.byTooltip('Fechar').last);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-menu-image')), findsNothing);
    });

    testWidgets('cardápio em PDF abre fora do app', (tester) async {
      service.menuResult = _menuPdf;
      await mount(tester);
      await open(tester, comer);
      await pick(tester, _cantina);
      await tester.tap(find.byKey(const Key('campus-content-menu')));
      await tester.pumpAndSettle();
      expect(abertos, [Uri.parse('https://cdn.test/cardapios/cantina.pdf')]);
      expect(find.byKey(const Key('campus-menu-link')), findsNothing);
    });

    testWidgets('PDF sem app para abrir: link para copiar', (tester) async {
      service.menuResult = _menuPdf;
      abre = false;
      String? copiado;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copiado = (call.arguments as Map)['text'] as String;
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      await mount(tester);
      await open(tester, comer);
      await pick(tester, _cantina);
      await tester.tap(find.byKey(const Key('campus-content-menu')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-menu-link')), findsOneWidget);
      expect(
        find.text('https://cdn.test/cardapios/cantina.pdf'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('campus-menu-copy')));
      await tester.pumpAndSettle();
      expect(find.text('Link copiado.'), findsOneWidget);
      expect(copiado, 'https://cdn.test/cardapios/cantina.pdf');
    });

    testWidgets('sem cardápio publicado e falha de rede', (tester) async {
      service.menuResult = null;
      await mount(tester);
      await open(tester, comer);
      await pick(tester, _cantina);
      await tester.tap(find.byKey(const Key('campus-content-menu')));
      await tester.pumpAndSettle();
      expect(find.text('Sem cardápio publicado para hoje.'), findsOneWidget);
      service.menuError = const CampusContentException(
        CampusContentFailure.offline,
      );
      await tester.tap(find.byKey(const Key('campus-content-menu')));
      await tester.pumpAndSettle();
      expect(
        find.text('Não foi possível carregar o cardápio. Verifique a conexão.'),
        findsOneWidget,
      );
    });

    testWidgets('toque no PucStop fecha o card de conteúdo (um por vez)', (
      tester,
    ) async {
      await controller.loadPucStops();
      await mount(tester);
      await open(tester, eventos);
      await pick(tester, _feira);
      expect(card, findsOneWidget);
      controller.selectPucStop(_pucStop.id);
      await tester.pumpAndSettle();
      expect(card, findsNothing);
      expect(find.byKey(const Key('campus-pucstop-card')), findsOneWidget);
      // E o contrário.
      controller.selectContent(_cantina);
      await tester.pumpAndSettle();
      expect(card, findsOneWidget);
      expect(find.byKey(const Key('campus-pucstop-card')), findsNothing);
    });

    testWidgets('busca fecha o card de conteúdo', (tester) async {
      await mount(tester);
      controller.selectContent(_cantina);
      await tester.pumpAndSettle();
      expect(card, findsOneWidget);
      await tester.enterText(find.byType(TextField), 'biblioteca');
      await tester.pumpAndSettle();
      // Resultado da busca (o card aberto tem o ListTile "Rota acessível").
      await tester.tap(
        find
            .byWidgetPredicate(
              (w) =>
                  w.key is ValueKey<String> &&
                  (w.key! as ValueKey<String>).value.startsWith(
                    'campus-search-result-',
                  ),
            )
            .first,
      );
      await tester.pumpAndSettle();
      expect(card, findsNothing);
      expect(find.byKey(const Key('campus-route-card')), findsOneWidget);
    });
  });
}

class _Content implements CampusContentService {
  List<CampusEvent> eventList = [_feira, _show, _palestra];
  List<CampusRestaurant> restaurantList = [_cantina, _quiosque];
  Object? eventError;
  Object? restaurantError;
  Completer<List<CampusEvent>>? pendingEvents;
  CampusMenu? menuResult;
  Object? menuError;
  int eventCalls = 0;
  int restaurantCalls = 0;
  final menuCalls = <String>[];

  @override
  Future<List<CampusEvent>> events() async {
    eventCalls++;
    if (pendingEvents case final p?) return p.future;
    if (eventError case final e?) throw e;
    return eventList;
  }

  @override
  Future<List<CampusRestaurant>> restaurants() async {
    restaurantCalls++;
    if (restaurantError case final e?) throw e;
    return restaurantList;
  }

  @override
  Future<CampusMenu?> menu(String restaurantId) async {
    menuCalls.add(restaurantId);
    if (menuError case final e?) throw e;
    return menuResult;
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

class _Routes implements CampusRouteService {
  final targets = <CampusRouteTarget>[];
  final accessible = <bool>[];
  CampusRouteFailure? failure;

  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async {
    targets.add(destination);
    this.accessible.add(accessible);
    if (failure case final f?) throw CampusRouteException(f);
    return CampusRoute(
      destinationId: destination.key,
      coordinates: const [
        [-43.99, -19.92],
        [-43.991, -19.921],
      ],
      distanceMeters: 148,
      durationSeconds: 106,
      accessible: accessible,
    );
  }
}

class _Location implements CampusLocationService {
  @override
  Future<CampusLocationResult> locate() async => const CampusLocationResult(
    CampusLocationStatus.located,
    location: _location,
  );

  @override
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}

class _PucStops implements CampusPucStopService {
  @override
  bool get canClaim => true;
  @override
  Future<List<CampusPucStop>> list() async => [_pucStop];
  @override
  Future<Set<String>> collected() async => const {};
  @override
  Future<CampusPucStopClaim> claim(String id, CampusUserLocation l) =>
      throw const CampusPucStopException(CampusPucStopFailure.offline);
}
