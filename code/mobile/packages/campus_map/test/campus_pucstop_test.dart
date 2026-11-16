import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_pucstop_layer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// PucStops como a coordenação cadastra (id UUID do Ajuda-aí).
final _biblioteca = CampusPucStop(
  id: '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10',
  name: 'Biblioteca Central',
  longitude: -43.994,
  latitude: -19.9226,
  radiusMeters: 40,
  xp: 50,
);
final _medicina = CampusPucStop(
  id: '9d2e4b7a-1c3f-4a5b-8e6d-2f0c1b9a8e77',
  name: 'Bloco de Medicina',
  longitude: -43.992,
  latitude: -19.9215,
  radiusMeters: 40,
  xp: 45,
);

/// ~12 m a leste da biblioteca (dentro do raio).
const _perto = CampusUserLocation(
  longitude: -43.99388524,
  latitude: -19.9226,
  accuracy: 8,
);

/// Medicina: ~242 m da biblioteca (fora do raio).
const _longe = CampusUserLocation(
  longitude: -43.992,
  latitude: -19.9215,
  accuracy: 8,
);

void main() {
  group('CampusPucStop', () {
    test('valida id, nome, posição, raio e XP', () {
      const valido = '00000000-0000-4000-8000-000000000001';
      expect(
        CampusPucStop(
          id: valido,
          name: 'x',
          longitude: 0,
          latitude: 0,
          radiusMeters: 40,
          xp: 1,
        ).id,
        valido,
      );
      for (final criar in <CampusPucStop Function()>[
        // Ids antigos do PUCMaps, nomes e UUID fora do formato não são aceitos.
        for (final id in [
          'Totem X',
          'totem_biblioteca',
          'Biblioteca Central',
          '3F6C2A1E-8B4D-4C2A-9E1F-0A7B5C3D2E10',
          '3f6c2a1e8b4d4c2a9e1f0a7b5c3d2e10',
        ])
          () => CampusPucStop(
            id: id,
            name: 'x',
            longitude: 0,
            latitude: 0,
            radiusMeters: 40,
            xp: 1,
          ),
        () => CampusPucStop(
          id: valido,
          name: ' ',
          longitude: 0,
          latitude: 0,
          radiusMeters: 40,
          xp: 1,
        ),
        () => CampusPucStop(
          id: valido,
          name: 'x',
          longitude: 200,
          latitude: 0,
          radiusMeters: 40,
          xp: 1,
        ),
        () => CampusPucStop(
          id: valido,
          name: 'x',
          longitude: 0,
          latitude: 0,
          radiusMeters: 0,
          xp: 1,
        ),
        () => CampusPucStop(
          id: valido,
          name: 'x',
          longitude: 0,
          latitude: 0,
          radiusMeters: 40,
          xp: 0,
        ),
      ]) {
        expect(criar, throwsArgumentError);
      }
    });

    test('distância aproximada (só para a interface)', () {
      expect(_biblioteca.distanceFrom(_perto), closeTo(12, 0.2));
      // PostGIS (ST_Distance geography): 242,231 m e 12,015 m.
      expect(_biblioteca.distanceFrom(_longe), closeTo(242.23, 0.5));
      expect(campusDistanceLabel(12.4), '12 m');
      expect(campusDistanceLabel(1530), '1,5 km');
    });
  });

  group('totem no manifesto', () {
    late Map<String, dynamic> json;
    setUp(() {
      json = jsonDecode(
        File('assets/data/campus_models.json').readAsStringSync(),
      ) as Map<String, dynamic>;
    });

    test('r3 traz só o modelo do totem (posições vêm da API)', () {
      final manifest = CampusModelManifest.parse(jsonEncode(json));
      final totem = manifest.pucStopModel!;
      expect(totem.id, 'totem');
      expect(totem.path, 'models/pucstops/torre_pucstop.glb');
      expect(totem.bytes, 3096036);
      expect(totem.orientation, [0, 0, 180]);
      // 12 m de altura num modelo de 16,39 unidades (PUCMaps).
      expect(totem.scale, closeTo(0.7322, 0.0001));
      final pucstops = json['pucstops'] as Map<String, dynamic>;
      expect(pucstops.keys, isNot(contains('instances')));
      expect(jsonEncode(pucstops), isNot(contains('latitude')));
    });

    test('seção inválida desliga só o totem; prédios e ambiente seguem', () {
      for (final alterar in <void Function(Map<String, dynamic>)>[
        (s) => (s['models'] as List).add((s['models'] as List).first),
        (s) => (s['models'] as List).first['path'] =
            'models/props/torre_pucstop.glb',
        (s) => (s['models'] as List).first['path'] =
            'models/pucstops/debug_totem.glb',
        (s) => (s['models'] as List).first['kind'] = 'vehicle',
        (s) => (s['placement'] as Map)['heightMeters'] = 0,
        (s) => (s['placement'] as Map)['orientation'] = [0, 180],
      ]) {
        final copia = jsonDecode(jsonEncode(json)) as Map<String, dynamic>;
        alterar(copia['pucstops'] as Map<String, dynamic>);
        final manifest = CampusModelManifest.parse(jsonEncode(copia));
        expect(manifest.pucStopModel, isNull);
        expect(manifest.lod0, hasLength(12));
        expect(manifest.vegetation, isNotNull);
      }
      json.remove('pucstops');
      expect(CampusModelManifest.parse(jsonEncode(json)).pucStopModel, isNull);
    });
  });

  group('camadas', () {
    test('GeoJSON com estado por PucStop, sem dados do usuário', () {
      final data = CampusPucStopLayer.geoJson(
        [_biblioteca, _medicina],
        {_medicina.id},
      );
      final features = data['features'] as List;
      expect(features.map((f) => f['properties']), [
        {
          'id': _biblioteca.id,
          'name': 'Biblioteca Central',
          'xp': 50,
          'state': 'available',
        },
        {
          'id': _medicina.id,
          'name': 'Bloco de Medicina',
          'xp': 45,
          'state': 'collected',
        },
      ]);
      expect(features.first['geometry']['coordinates'], [-43.994, -19.9226]);
    });

    test('zoom mínimo: pontos 15, totem 16,5, nome 17,5; estado em texto', () {
      final layers = {for (final l in CampusPucStopLayer.layers) l['id']: l};
      expect(layers[CampusPucStopLayer.dot]!['minzoom'], 15.0);
      expect(layers[CampusPucStopLayer.halo]!['minzoom'], 15.0);
      expect(layers[CampusPucStopLayer.label]!['minzoom'], 17.5);
      // Coletado: "✓ nome"; disponível: "nome · +XP".
      expect(
        jsonEncode(layers[CampusPucStopLayer.label]!['layout']['text-field']),
        allOf(contains('✓'), contains(' XP')),
      );
      expect(CampusPucStopLayer.pickable, [
        CampusPucStopLayer.dot,
        CampusPucStopLayer.halo,
        CampusPucStopLayer.aura,
      ]);
      final manifest = CampusModelManifest.parse(
        File('assets/data/campus_models.json').readAsStringSync(),
      );
      final totem = CampusPucStopLayer.totemLayer(manifest.pucStopModel!);
      expect(totem['type'], 'model');
      expect(totem['source'], CampusPucStopLayer.modelSource);
      expect(totem['minzoom'], 16.5);
      // Sem filtro de estado: o totem fica no mapa depois da coleta.
      expect(totem.containsKey('filter'), isFalse);
      // Topo (anéis + joia) gira pelo feature-state, como no PUCMaps.
      final rotation = jsonEncode(totem['paint']['model-rotation']);
      expect(rotation, contains('Aneis_Bronze'));
      expect(rotation, contains('Joia_Azul'));
      expect(rotation, contains('"feature-state","topo"'));
    });

    test('totem continua depois da coleta e ganha aura verde', () {
      final manifest = CampusModelManifest.parse(
        File('assets/data/campus_models.json').readAsStringSync(),
      );
      final model = manifest.pucStopModel!;
      final url = Uri.parse('https://cdn.test/models/pucstops/torre.glb');
      final models = CampusPucStopLayer.models(
        [_biblioteca, _medicina],
        model,
        url,
      );
      // Um modelo por PucStop, coletado ou não, com o topo endereçável.
      expect(models.keys, [_biblioteca.id, _medicina.id]);
      expect(models[_medicina.id]['position'], [
        _medicina.longitude,
        _medicina.latitude,
      ]);
      expect(models[_medicina.id]['nodeOverrideNames'], [
        'Aneis_Bronze',
        'Joia_Azul',
      ]);
      expect(models[_medicina.id]['orientation'], [0, 0, 180]);
      final layers = {for (final l in CampusPucStopLayer.layers) l['id']: l};
      for (final id in [CampusPucStopLayer.aura, CampusPucStopLayer.ring]) {
        expect(layers[id]!['filter'], [
          '==',
          ['get', 'state'],
          'collected',
        ]);
        expect(
          jsonEncode(layers[id]!['paint']),
          contains('#22c55e'.toUpperCase()),
        );
      }
      expect(layers[CampusPucStopLayer.halo]!['filter'], [
        '==',
        ['get', 'state'],
        'available',
      ]);
      expect(jsonDecode(CampusPucStopLayer.topRotation(90)), {
        'topo': [0.0, 90.0, 0.0],
      });
    });
  });

  group('controller', () {
    late _Location location;
    late _PucStops service;
    late CampusMapController controller;
    setUp(() {
      location = _Location();
      service = _PucStops();
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: location,
        pucStopService: service,
      );
    });
    tearDown(() => controller.dispose());

    test('carrega lista e coletados uma vez; nunca coleta sozinho', () async {
      service.collectedIds = {_medicina.id};
      await controller.loadPucStops();
      await controller.loadPucStops();
      expect(controller.pucStops.value, [_biblioteca, _medicina]);
      expect(controller.collectedPucStops.value, {_medicina.id});
      expect(service.listCalls, 1);
      expect(service.claims, isEmpty);
      expect(location.calls, 0);
    });

    test('resposta antiga não ressuscita PucStop após recarga', () async {
      final antiga = Completer<List<CampusPucStop>>();
      service.pendingList = antiga;
      final carga = controller.loadPucStops();
      service.pendingList = null;
      service.stops = [_biblioteca];
      await controller.reloadPucStops();
      antiga.complete([_biblioteca, _medicina]);
      await carga;
      expect(controller.pucStops.value, [_biblioteca]);
    });

    test(
      'consulta iniciada antes da coleta não apaga a coleta confirmada',
      () async {
        final antigos = Completer<Set<String>>();
        service.pendingCollected = antigos;
        final carga = controller.loadPucStops();
        await Future<void>.delayed(Duration.zero);
        await controller.claimPucStop(_biblioteca.id);
        antigos.complete({});
        await carga;
        expect(controller.collectedPucStops.value, {_biblioteca.id});
      },
    );

    test(
      'lista indisponível: mapa sem PucStops e nova tentativa depois',
      () async {
        service.listError = Exception('offline');
        await controller.loadPucStops();
        expect(controller.pucStops.value, isEmpty);
        service.listError = null;
        await controller.loadPucStops();
        expect(controller.pucStops.value, hasLength(2));
      },
    );

    test('sem PucStops cadastrados: mapa sem totens, sem erro', () async {
      service.stops = [];
      await controller.loadPucStops();
      expect(controller.pucStops.value, isEmpty);
      expect(controller.pucStop(_biblioteca.id), isNull);
    });

    test('recarregar reflete a coordenação: criado aparece, movido muda, inativo some', () async {
      service.stops = [];
      await controller.loadPucStops();
      expect(controller.pucStops.value, isEmpty);

      // Criado pela coordenação.
      service.stops = [_biblioteca];
      await controller.reloadPucStops();
      expect(controller.pucStops.value, [_biblioteca]);

      // Reposicionado (mesmo id, outra posição e XP).
      final movida = CampusPucStop(
        id: _biblioteca.id,
        name: _biblioteca.name,
        longitude: -43.9935,
        latitude: -19.9221,
        radiusMeters: 30,
        xp: 80,
      );
      service.stops = [movida, _medicina];
      await controller.reloadPucStops();
      expect(controller.pucStop(_biblioteca.id)?.longitude, -43.9935);
      expect(controller.pucStop(_biblioteca.id)?.xp, 80);

      // Card aberto num PucStop que a coordenação desativa: fecha.
      controller.selectPucStop(_medicina.id);
      service.stops = [movida];
      await controller.reloadPucStops();
      expect(controller.pucStop(_medicina.id), isNull);
      expect(controller.selectedPucStop.value, isNull);
      expect(service.listCalls, 4);
    });

    test('recarregar sem rede mantém a lista anterior', () async {
      await controller.loadPucStops();
      service.listError = Exception('offline');
      await controller.reloadPucStops();
      expect(controller.pucStops.value, [_biblioteca, _medicina]);
    });

    test(
      'coleta funciona para PucStop criado depois de abrir o mapa',
      () async {
        service.stops = [];
        await controller.loadPucStops();
        service.stops = [_biblioteca];
        await controller.reloadPucStops();
        final result = await controller.claimPucStop(_biblioteca.id);
        expect(result.claim?.pucStopId, _biblioteca.id);
        expect(controller.collectedPucStops.value, {_biblioteca.id});
      },
    );

    test('coletados indisponíveis não impedem a lista', () async {
      service.collectedError = Exception('401');
      await controller.loadPucStops();
      expect(controller.pucStops.value, hasLength(2));
      expect(controller.collectedPucStops.value, isEmpty);
    });

    test('coleta: lê GPS uma vez, envia e marca coletado', () async {
      await controller.loadPucStops();
      final result = await controller.claimPucStop(_biblioteca.id);
      expect(result.claim?.xpGained, 50);
      expect(location.calls, 1);
      expect(service.claims, [(_biblioteca.id, _perto)]);
      expect(controller.collectedPucStops.value, {_biblioteca.id});
    });

    test('já coletado no servidor também marca coletado', () async {
      service.failure = CampusPucStopFailure.alreadyCollected;
      final result = await controller.claimPucStop(_biblioteca.id);
      expect(result.failure, CampusPucStopFailure.alreadyCollected);
      expect(controller.collectedPucStops.value, {_biblioteca.id});
    });

    test('fora do alcance traz a distância do servidor e não marca', () async {
      service.failure = CampusPucStopFailure.outOfRange;
      service.distance = 231.4;
      final result = await controller.claimPucStop(_biblioteca.id);
      expect(result.failure, CampusPucStopFailure.outOfRange);
      expect(result.distanceMeters, 231.4);
      expect(controller.collectedPucStops.value, isEmpty);
    });

    test('sem sessão: não liga o GPS nem chama o servidor', () async {
      service.canClaim = false;
      final result = await controller.claimPucStop(_biblioteca.id);
      expect(result.failure, CampusPucStopFailure.unauthenticated);
      expect(location.calls, 0);
      expect(service.claims, isEmpty);
    });

    test('permissão negada: resultado de localização, nada enviado', () async {
      location.status = CampusLocationStatus.denied;
      final result = await controller.claimPucStop(_biblioteca.id);
      expect(result.location, CampusLocationStatus.denied);
      expect(service.claims, isEmpty);
    });

    test('erro inesperado vira offline', () async {
      service.error = StateError('x');
      final result = await controller.claimPucStop(_biblioteca.id);
      expect(result.failure, CampusPucStopFailure.offline);
    });

    test('resposta atrasada com o card trocado é cancelada', () async {
      service.pending = Completer();
      final pedido = controller.claimPucStop(_biblioteca.id);
      await Future<void>.delayed(Duration.zero);
      controller.selectPucStop(_medicina.id);
      service.pending!.complete(_claim(_biblioteca));
      expect((await pedido).cancelled, isTrue);
      // O servidor coletou: o estado reflete, mesmo sem mostrar o resultado.
      expect(controller.collectedPucStops.value, {_biblioteca.id});
    });

    test('sair da tela durante a coleta não quebra', () async {
      service.pending = Completer();
      final pedido = controller.claimPucStop(_biblioteca.id);
      await Future<void>.delayed(Duration.zero);
      controller.dispose();
      service.pending!.complete(_claim(_biblioteca));
      expect((await pedido).cancelled, isTrue);
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
      );
    });
  });

  group('card', () {
    late _Location location;
    late _PucStops service;
    late CampusMapController controller;
    late List<CampusPucStopClaim> claimed;

    setUp(() async {
      location = _Location();
      service = _PucStops();
      claimed = [];
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: location,
        routeService: _Routes(),
        pucStopService: service,
      );
      await controller.loadPucStops();
    });
    tearDown(() => controller.dispose());

    Future<void> mount(
      WidgetTester tester, {
      String? Function(CampusPucStop)? aviso,
    }) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CampusMapControls(
            controller: controller,
            onPucStopClaimed: claimed.add,
            pucStopRewardNotice: aviso,
          ),
        ),
      ),
    );

    Future<void> select(WidgetTester tester, CampusPucStop stop) async {
      controller.selectPucStop(stop.id);
      await tester.pumpAndSettle();
    }

    /// Topo girado até parar: a view chama isto ao fim da animação do giro.
    Future<void> spin(WidgetTester tester) async {
      controller.completePucStopSpin(_biblioteca.id);
      await tester.pump();
    }

    String hint(WidgetTester tester) => tester
        .widgetList<Text>(
          find.descendant(
            of: find.byKey(const Key('campus-pucstop-hint')),
            matching: find.byType(Text),
          ),
        )
        .single
        .data!;

    String state(WidgetTester tester) => tester
        .widgetList<Text>(
          find.descendant(
            of: find.byKey(const Key('campus-pucstop-state')),
            matching: find.byType(Text),
          ),
        )
        .single
        .data!;

    testWidgets('BL-50: crédito parcial pelo teto e subida de nível', (
      tester,
    ) async {
      service.resposta = const CampusPucStopClaim(
        pucStopId: 'biblioteca',
        xpGained: 20,
        coinsGained: 20,
        xpTotal: 400,
        distanceMeters: 12,
        capReached: true,
        levelUp: true,
        levelNumber: 4,
        levelName: 'Descoberta',
      );
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(find.text('+20 XP · +20 moedas'), findsOneWidget);
      expect(
        find.text('Você chegou ao limite de XP de totens deste semestre.'),
        findsOneWidget,
      );
      expect(find.text('Subiu para o nível 4 · Descoberta!'), findsOneWidget);
      expect(state(tester), 'XP coletado!');
    });

    testWidgets('BL-50: teto já cheio registra a visita sem XP', (
      tester,
    ) async {
      service.resposta = const CampusPucStopClaim(
        pucStopId: 'biblioteca',
        xpGained: 0,
        xpTotal: 400,
        distanceMeters: 12,
        capReached: true,
      );
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(find.text('Sem XP desta vez'), findsOneWidget);
      expect(state(tester), 'Visita registrada');
      expect(find.textContaining('+0'), findsNothing);
    });

    testWidgets('BL-50: aviso do teto aparece antes do giro', (tester) async {
      await mount(
        tester,
        aviso: (stop) => 'Restam 20 XP no seu limite: esta coleta vale 20 XP.',
      );
      await select(tester, _biblioteca);
      expect(find.byKey(const Key('campus-pucstop-notice')), findsOneWidget);
      expect(
        hint(tester),
        'Arraste para os lados e gire o topo para coletar o XP.',
      );
      expect(service.claims, isEmpty);
    });

    testWidgets('no alcance: abrir não coleta; XP só depois de girar o topo', (
      tester,
    ) async {
      await mount(tester);
      expect(find.byKey(const Key('campus-pucstop-card')), findsNothing);
      await select(tester, _biblioteca);
      expect(find.text('Biblioteca Central'), findsOneWidget);
      expect(find.text('+50 XP'), findsOneWidget);
      expect(state(tester), 'Você está no alcance');
      expect(find.text('A 12 m · raio de 40 m'), findsOneWidget);
      expect(
        hint(tester),
        'Arraste para os lados e gire o topo para coletar o XP.',
      );
      expect(service.claims, isEmpty, reason: 'abrir o totem não coleta');
      // Sem botão de coleta: a ação é o giro.
      expect(find.byKey(const Key('campus-pucstop-claim')), findsNothing);
      // Giro de outro totem (fora de foco) é ignorado.
      controller.completePucStopSpin(_medicina.id);
      await tester.pump();
      expect(service.claims, isEmpty);

      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, hasLength(1));
      expect(find.text('+50 XP · +50 moedas'), findsOneWidget);
      expect(state(tester), 'XP coletado!');
      expect(hint(tester), 'Gire o topo quando quiser: o XP já é seu.');
      expect(claimed.single.xpTotal, 320);
      // Girar de novo não coleta outra vez.
      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, hasLength(1));
    });

    testWidgets('fora de alcance: estado em texto e atualizar distância', (
      tester,
    ) async {
      location.next = _longe;
      await mount(tester);
      await select(tester, _biblioteca);
      expect(state(tester), 'Fora de alcance: aproxime-se');
      expect(hint(tester), 'Aproxime-se e gire o topo para coletar.');
      location.next = _perto;
      await tester.tap(find.byKey(const Key('campus-pucstop-measure')));
      await tester.pumpAndSettle();
      expect(state(tester), 'Você está no alcance');
    });

    testWidgets('servidor recusa por alcance: mensagem com a distância', (
      tester,
    ) async {
      service.failure = CampusPucStopFailure.outOfRange;
      service.distance = 52.3;
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(
        find.text('Você está a 52 m. Chegue a 40 m para coletar.'),
        findsOneWidget,
      );
      expect(state(tester), 'Fora de alcance: aproxime-se');
      expect(claimed, isEmpty);
    });

    testWidgets('já coletado: totem segue girável, sem nova coleta', (
      tester,
    ) async {
      controller.collectedPucStops.value = {_biblioteca.id};
      await mount(tester);
      await select(tester, _biblioteca);
      expect(state(tester), 'Já coletado');
      expect(
        hint(tester),
        'Já coletado neste semestre. Você ainda pode girar o topo.',
      );
      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, isEmpty);
    });

    testWidgets('segunda coleta recusada pelo servidor vira "já coletado"', (
      tester,
    ) async {
      service.failure = CampusPucStopFailure.alreadyCollected;
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(find.text('Você já coletou este PucStop.'), findsOneWidget);
      expect(state(tester), 'Já coletado');
    });

    testWidgets('sem sessão: explica que coletar exige login', (tester) async {
      service.canClaim = false;
      await mount(tester);
      await select(tester, _biblioteca);
      expect(find.byKey(const Key('campus-pucstop-login')), findsOneWidget);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, isEmpty);
      expect(location.calls, 1, reason: 'só a leitura da distância');
    });

    testWidgets('backend fora do ar: mensagem e nada coletado', (tester) async {
      service.failure = CampusPucStopFailure.offline;
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(
        find.text('Não foi possível coletar agora. Verifique a conexão.'),
        findsOneWidget,
      );
      expect(controller.collectedPucStops.value, isEmpty);
    });

    testWidgets('cancelar coleta pendente libera botão para nova tentativa', (
      tester,
    ) async {
      service.pending = Completer();
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pump();
      // Detach ao ir para segundo plano invalida a operação, mas mantém o card.
      final camera = _Camera();
      controller.attach(camera);
      controller.detach(camera);
      service.pending!.completeError(
        const CampusPucStopException(CampusPucStopFailure.offline),
      );
      await tester.pumpAndSettle();
      expect(find.text('Coletando…'), findsNothing);
      // Um novo giro tenta de novo.
      service.pending = null;
      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, hasLength(2));
      expect(tester.takeException(), isNull);
    });

    testWidgets('indisponível no servidor: estado próprio, sem botão', (
      tester,
    ) async {
      service.failure = CampusPucStopFailure.unavailable;
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(state(tester), 'Indisponível no momento');
      expect(find.byKey(const Key('campus-pucstop-hint')), findsNothing);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, hasLength(1));
    });

    testWidgets('permissão de GPS negada: distância indisponível e aviso', (
      tester,
    ) async {
      location.status = CampusLocationStatus.denied;
      await mount(tester);
      await select(tester, _biblioteca);
      expect(find.text('Distância indisponível'), findsOneWidget);
      expect(find.textContaining('Permissão negada'), findsOneWidget);
      await spin(tester);
      await tester.pumpAndSettle();
      expect(service.claims, isEmpty);
    });

    testWidgets('resposta atrasada depois de fechar o card não aparece', (
      tester,
    ) async {
      service.pending = Completer();
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pump();
      expect(find.text('Coletando…'), findsOneWidget);
      await tester.tap(find.byKey(const Key('campus-pucstop-close')));
      await tester.pumpAndSettle();
      service.pending!.complete(_claim(_biblioteca));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campus-pucstop-card')), findsNothing);
      expect(claimed, isEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sair da tela com coleta pendente não quebra', (tester) async {
      service.pending = Completer();
      await mount(tester);
      await select(tester, _biblioteca);
      await spin(tester);
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      service.pending!.complete(_claim(_biblioteca));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(claimed, isEmpty);
    });

    testWidgets('foco no totem esconde busca e controles; fechar devolve', (
      tester,
    ) async {
      await mount(tester);
      await select(tester, _biblioteca);
      expect(find.byKey(const Key('campus-pucstop-card')), findsOneWidget);
      expect(find.byKey(const Key('campus-route-card')), findsNothing);
      expect(find.byType(TextField), findsNothing);
      expect(find.byTooltip('Minha localização'), findsNothing);
      await tester.tap(find.byKey(const Key('campus-pucstop-close')));
      await tester.pumpAndSettle();
      expect(controller.selectedPucStop.value, isNull);
      expect(find.byKey(const Key('campus-pucstop-card')), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
    });
  });
}

CampusPucStopClaim _claim(CampusPucStop stop) => CampusPucStopClaim(
  pucStopId: stop.id,
  xpGained: stop.xp,
  xpTotal: 320,
  distanceMeters: 12,
);

class _Location implements CampusLocationService {
  CampusLocationStatus status = CampusLocationStatus.located;
  CampusUserLocation next = _perto;
  int calls = 0;
  @override
  Future<CampusLocationResult> locate() async {
    calls++;
    return CampusLocationResult(
      status,
      location: status == CampusLocationStatus.located ? next : null,
    );
  }

  @override
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}

class _PucStops implements CampusPucStopService {
  Completer<List<CampusPucStop>>? pendingList;
  Completer<Set<String>>? pendingCollected;
  Set<String> collectedIds = {};
  Object? listError;
  Object? collectedError;
  CampusPucStopFailure? failure;
  double? distance;
  Object? error;
  Completer<CampusPucStopClaim>? pending;

  /// Resposta personalizada do servidor (teto, subida de nível).
  CampusPucStopClaim? resposta;
  int listCalls = 0;
  final claims = <(String, CampusUserLocation)>[];

  /// O que o servidor devolve agora (a coordenação pode mudar entre chamadas).
  List<CampusPucStop> stops = [_biblioteca, _medicina];

  @override
  bool canClaim = true;

  @override
  Future<List<CampusPucStop>> list() async {
    listCalls++;
    if (pendingList case final p?) return p.future;
    if (listError case final e?) throw e;
    return stops;
  }

  @override
  Future<Set<String>> collected() async {
    if (pendingCollected case final p?) return p.future;
    if (collectedError case final e?) throw e;
    return collectedIds;
  }

  @override
  Future<CampusPucStopClaim> claim(
    String pucStopId,
    CampusUserLocation location,
  ) async {
    claims.add((pucStopId, location));
    if (pending case final p?) return p.future;
    if (error case final e?) throw e;
    if (failure case final f?) {
      throw CampusPucStopException(f, distanceMeters: distance);
    }
    if (resposta case final r?) return r;
    return _claim(pucStopId == _biblioteca.id ? _biblioteca : _medicina);
  }
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

class _Routes implements CampusRouteService {
  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) => throw const CampusRouteException(CampusRouteFailure.unavailable);
}
