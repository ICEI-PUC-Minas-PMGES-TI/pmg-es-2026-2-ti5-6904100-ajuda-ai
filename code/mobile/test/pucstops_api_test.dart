import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/services/pucstops_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_home.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response json(Object corpo, [int status = 200]) => http.Response(
  jsonEncode(corpo),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

const _biblioteca = {
  'id': '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10',
  'nome': 'Biblioteca Central',
  'latitude': -19.9226,
  'longitude': -43.994,
  'raioMetros': 40,
  'xp': 50,
};
const _posicao = CampusUserLocation(
  longitude: -43.99388524,
  latitude: -19.9226,
  accuracy: 8.5,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => SessaoUsuario.atual.limpar());

  MapaApiPucStopService servico(
    Future<http.Response> Function(http.Request) responder, {
    String? token = 'jwt',
  }) => MapaApiPucStopService(
    accessToken: () => token,
    baseUrl: 'http://api.test',
    client: MockClient(responder),
  );

  test(
    'lista pública: GET sem token; item fora do contrato é ignorado',
    () async {
      late http.Request pedido;
      final lista = await servico((r) async {
        pedido = r;
        return json([
          _biblioteca,
          {'id': 'x'},
          {..._biblioteca, 'id': 'Inválido!'},
          // Id legado do PUCMaps não é identidade de produção.
          {..._biblioteca, 'id': 'totem_biblioteca'},
        ]);
      }).list();
      expect(pedido.method, 'GET');
      expect(pedido.url.toString(), 'http://api.test/mapa/pucstops');
      expect(pedido.headers['authorization'], isNull);
      expect(lista.single.id, '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10');
      expect(lista.single.radiusMeters, 40);
    },
  );

  test('nenhum PucStop cadastrado: lista vazia, sem erro', () async {
    expect(await servico((_) async => json([])).list(), isEmpty);
  });

  test('coletados: GET /me/pucstops com JWT; sem login nem chama', () async {
    late http.Request pedido;
    final ids = await servico((r) async {
      pedido = r;
      return json([
        {'pucstopId': '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10', 'xp': 50, 'claimedAt': 'x'},
      ]);
    }).collected();
    expect(pedido.url.path, '/me/pucstops');
    expect(pedido.headers['authorization'], 'Bearer jwt');
    expect(ids, {'3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10'});

    var chamadas = 0;
    final anonimo = servico((r) async {
      chamadas++;
      return json([]);
    }, token: null);
    expect(await anonimo.collected(), isEmpty);
    expect(anonimo.canClaim, isFalse);
    expect(chamadas, 0);
  });

  test(
    'coleta: POST com a posição só no corpo; usuário e XP nunca enviados',
    () async {
      late http.Request pedido;
      final coleta = await servico((r) async {
        pedido = r;
        return json({
          'pucstopId': '3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10',
          'xpGanho': 50,
          'xpTotal': 320,
          'claimedAt': '2026-10-17T20:00:00.000Z',
          'distanciaMetros': 12,
        }, 201);
      }).claim('3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10', _posicao);
      expect(pedido.method, 'POST');
      expect(
        pedido.url.toString(),
        'http://api.test/mapa/pucstops/3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10/claim',
      );
      expect(pedido.url.hasQuery, isFalse);
      expect(pedido.headers['authorization'], 'Bearer jwt');
      expect(jsonDecode(pedido.body), {
        'latitude': -19.9226,
        'longitude': -43.99388524,
        'accuracy': 8.5,
      });
      expect(coleta.xpGained, 50);
      expect(coleta.xpTotal, 320);
      expect(coleta.distanceMeters, 12);
    },
  );

  test(
    'erros do servidor viram falhas do pacote (sem 500 para regra)',
    () async {
      Future<CampusPucStopException> falha(http.Response resposta) async {
        try {
          await servico((_) async => resposta)
              .claim('3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10', _posicao);
        } on CampusPucStopException catch (e) {
          return e;
        }
        fail('deveria falhar');
      }

      expect(
        (await falha(json({'motivo': 'ja-coletado'}, 409))).failure,
        CampusPucStopFailure.alreadyCollected,
      );
      final fora = await falha(
        json({
          'motivo': 'fora-do-alcance',
          'distanciaMetros': 52.3,
          'raioMetros': 40,
        }, 422),
      );
      expect(fora.failure, CampusPucStopFailure.outOfRange);
      expect(fora.distanceMeters, 52.3);
      expect(
        (await falha(json({'motivo': 'precisao-insuficiente'}, 422))).failure,
        CampusPucStopFailure.imprecise,
      );
      expect(
        (await falha(json({'motivo': 'inativo'}, 422))).failure,
        CampusPucStopFailure.unavailable,
      );
      expect(
        (await falha(json({'message': 'x'}, 404))).failure,
        CampusPucStopFailure.unavailable,
      );
      for (final status in [401, 403]) {
        expect(
          (await falha(json({'message': 'x'}, status))).failure,
          CampusPucStopFailure.unauthenticated,
        );
      }
      expect(
        (await falha(json({'message': 'x'}, 500))).failure,
        CampusPucStopFailure.offline,
      );
      expect(
        (await falha(
          json({
            'pucstopId': 'outro',
            'xpGanho': 1,
            'xpTotal': 1,
            'distanciaMetros': 1,
          }, 201),
        )).failure,
        CampusPucStopFailure.offline,
      );
    },
  );

  test('backend fora do ar ou resposta atrasada: offline', () async {
    final semRede = servico(
      (_) async => throw http.ClientException('sem rede'),
    );
    await expectLater(
      semRede.claim('3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10', _posicao),
      throwsA(
        isA<CampusPucStopException>().having(
          (e) => e.failure,
          'failure',
          CampusPucStopFailure.offline,
        ),
      ),
    );
    final lento = MapaApiPucStopService(
      accessToken: () => 'jwt',
      baseUrl: 'http://api.test',
      timeout: const Duration(milliseconds: 10),
      client: MockClient((_) => Completer<http.Response>().future),
    );
    await expectLater(
      lento.claim('3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10', _posicao),
      throwsA(isA<CampusPucStopException>()),
    );
  });

  test('sem login: coleta recusada sem rede', () async {
    var chamadas = 0;
    await expectLater(
      servico((_) async {
        chamadas++;
        return json({});
      }, token: null).claim('3f6c2a1e-8b4d-4c2a-9e1f-0a7b5c3d2e10', _posicao),
      throwsA(
        isA<CampusPucStopException>().having(
          (e) => e.failure,
          'failure',
          CampusPucStopFailure.unauthenticated,
        ),
      ),
    );
    expect(chamadas, 0);
  });

  testWidgets('perfil: XP global visível para qualquer aluno com sessão', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
    await tester.pump();
    expect(find.byKey(const Key('perfil-xp')), findsNothing);
    SessaoUsuario.atual.xp.value = 1275;
    await tester.pump();
    expect(find.text('1.275 XP'), findsOneWidget);
  });

  group('XP na home', () {
    testWidgets('mostra o saldo real de GET /me/xp', (tester) async {
      late http.Request pedido;
      SessaoUsuario.atual
        ..assumirSessao(
          accessToken: 'jwt-camila',
          nome: 'Camila Duarte',
          email: 'camila@pucminas.edu.br',
        )
        ..configurarXpApi(
          XpApi(
            baseUrl: 'http://api.test',
            client: MockClient((r) async {
              pedido = r;
              return json({'saldo': 1275, 'atualizadoEm': null});
            }),
          ),
        );
      await tester.pumpWidget(const MaterialApp(home: HomePage()));
      await tester.pumpAndSettle();
      expect(pedido.url.path, '/me/xp');
      expect(pedido.headers['authorization'], 'Bearer jwt-camila');
      expect(find.text('1.275'), findsOneWidget);
      expect(find.text('1430'), findsNothing);
    });

    testWidgets('coleta no mapa atualiza o mesmo saldo', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: HomePage()));
      expect(find.text('0'), findsOneWidget);
      SessaoUsuario.atual.xp.value = 320;
      await tester.pump();
      expect(find.text('320'), findsOneWidget);
    });

    testWidgets('API fora do ar: mantém o valor, sem erro na tela', (
      tester,
    ) async {
      SessaoUsuario.atual
        ..assumirSessao(
          accessToken: 'jwt',
          nome: 'Camila Duarte',
          email: 'camila@pucminas.edu.br',
        )
        ..configurarXpApi(
          XpApi(
            baseUrl: 'http://api.test',
            client: MockClient((_) async => throw http.ClientException('x')),
          ),
        );
      await tester.pumpWidget(const MaterialApp(home: HomePage()));
      await tester.pumpAndSettle();
      expect(find.text('0'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
