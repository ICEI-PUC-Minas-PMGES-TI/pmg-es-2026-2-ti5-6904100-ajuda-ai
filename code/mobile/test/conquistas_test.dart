import 'dart:convert';

import 'package:ajuda_ai/models/conquista.dart';
import 'package:ajuda_ai/services/conquistas_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_conquistas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _json = {'content-type': 'application/json; charset=utf-8'};

const _novaA = {'id': 'a', 'contexto': '2026/2'};

Map<String, Object?> _colecao({
  List<Map<String, String>> novas = const [_novaA],
  List<Map<String, Object?>> extras = const [],
}) => {
  'ciclo': '2026/2',
  'obtidas': [
    {
      'id': 'a',
      'nome': 'Explorador',
      'descricao': 'Coletou totens pelo campus.',
      'imagemUrl': null,
      'criterioTexto': 'Coletar 3 PucStops no semestre.',
      'contexto': '2026/2',
      'xpCreditado': 20,
      'desbloqueadaEm': '2026-11-27T15:00:00.000Z',
      'arquivada': false,
    },
    {
      'id': 'b',
      'nome': 'Veterano',
      'descricao': 'Chegou longe.',
      'imagemUrl': null,
      'criterioTexto': 'Chegar ao nível 2.',
      'contexto': 'GERAL',
      'xpCreditado': 0,
      'desbloqueadaEm': '2026-10-01T15:00:00.000Z',
      'arquivada': true,
    },
    ...extras,
  ],
  'disponiveis': [
    {
      'id': 'c',
      'nome': 'Missionário',
      'descricao': 'Missões em série.',
      'imagemUrl': null,
      'criterio': 'MISSOES_CONCLUIDAS',
      'criterioTexto': 'Concluir 5 missões no semestre.',
      'xp': 10,
      'progresso': {'atual': 2, 'meta': 5},
    },
  ],
  'novas': novas,
};

void main() {
  group('modelo', () {
    test('lê a coleção, o contexto e o aviso das novas', () {
      final c = ColecaoConquistas.fromJson(_colecao())!;
      expect(c.obtidas.map((o) => o.nome), ['Explorador', 'Veterano']);
      expect(c.obtidas.first.rotuloContexto, 'Semestre 2026/2');
      expect(c.obtidas.last.rotuloContexto, 'Conquista de carreira');
      expect(c.obtidas.last.arquivada, isTrue);
      expect(c.disponiveis.single.fracao, closeTo(0.4, 0.001));
      expect(c.avisoNovas, 'Conquista desbloqueada: Explorador!');
      expect(
        ColecaoConquistas.fromJson(
          _colecao(
            novas: [
              _novaA,
              {'id': 'b', 'contexto': 'GERAL'},
            ],
          ),
        )!.avisoNovas,
        'Você desbloqueou 2 conquistas!',
      );
      expect(
        ColecaoConquistas.fromJson(_colecao(novas: []))!.avisoNovas,
        isNull,
      );
    });

    test('mesma conquista em dois semestres: só o desbloqueio novo é novo', () {
      // "Explorador" já obtida em 2026/1 e de novo agora, em 2026/2.
      final c = ColecaoConquistas.fromJson(
        _colecao(
          extras: [
            {
              'id': 'a',
              'nome': 'Explorador',
              'descricao': 'Coletou totens pelo campus.',
              'criterioTexto': 'Coletar 3 PucStops no semestre.',
              'contexto': '2026/1',
              'xpCreditado': 20,
              'desbloqueadaEm': '2026-05-27T15:00:00.000Z',
              'arquivada': false,
            },
          ],
        ),
      )!;
      expect(c.obtidas.where((o) => o.id == 'a'), hasLength(2));
      expect(c.obtidas.where(c.ehNova).map((o) => o.contexto), ['2026/2']);
      expect(c.avisoNovas, 'Conquista desbloqueada: Explorador!');
      // Formato antigo (só o id) não marca nada como novo.
      expect(
        ColecaoConquistas.fromJson({
          ..._colecao(),
          'novas': ['a'],
        })!.avisoNovas,
        isNull,
      );
    });

    test('vistas para confirmar: só as novas exibidas', () {
      final c = ColecaoConquistas.fromJson(_colecao())!;
      expect(c.vistasParaConfirmar, [
        {'id': 'a', 'contexto': '2026/2'},
      ]);
      expect(
        ColecaoConquistas.fromJson(_colecao(novas: []))!.vistasParaConfirmar,
        isEmpty,
      );
    });

    test('resposta malformada vira null, sem quebrar', () {
      expect(ColecaoConquistas.fromJson({'obtidas': 'x'}), isNull);
      expect(ConquistaDisponivel.fromJson({'id': 'x', 'nome': 'y'}), isNull);
    });
  });

  group('confirmação em lotes', () {
    final vistas = [
      for (var i = 0; i < 450; i++) {'id': 'id-$i', 'contexto': '2026/2'},
    ];

    test(
      'mais de 200 avisos: lotes de até 200, todos enviados uma vez',
      () async {
        final lotes = <List<Object?>>[];
        final api = ConquistasApi(
          client: MockClient((pedido) async {
            lotes.add(
              (jsonDecode(pedido.body) as Map<String, dynamic>)['vistas']
                  as List,
            );
            return http.Response('{"marcadas":0}', 200, headers: _json);
          }),
        );
        await api.confirmarVistas('tk', vistas);
        expect(lotes.map((l) => l.length), [200, 200, 50]);
        expect(lotes.expand((l) => l).toList(), vistas);
      },
    );

    test('um lote recusado não barra os outros; o erro sobe no fim', () async {
      var pedidos = 0;
      final api = ConquistasApi(
        client: MockClient((pedido) async {
          pedidos++;
          return pedidos == 2
              ? http.Response('{"message":"x"}', 400, headers: _json)
              : http.Response('{"marcadas":0}', 200, headers: _json);
        }),
      );
      await expectLater(api.confirmarVistas('tk', vistas), throwsA(anything));
      expect(pedidos, 3);
    });

    test('nada a confirmar: nenhum pedido', () async {
      var pedidos = 0;
      final api = ConquistasApi(
        client: MockClient((pedido) async {
          pedidos++;
          return http.Response('{}', 200, headers: _json);
        }),
      );
      await api.confirmarVistas('tk', const []);
      expect(pedidos, 0);
    });
  });

  group('tela', () {
    final sessao = SessaoUsuario.atual;
    late List<http.Request> pedidos;

    setUp(() {
      pedidos = [];
      sessao.limpar();
      sessao.configurarApi(ParticipacoesApi()..accessToken = 'tk');
    });

    tearDown(sessao.limpar);

    ConquistasApi api({int status = 200}) => ConquistasApi(
      client: MockClient((pedido) async {
        pedidos.add(pedido);
        if (pedido.method == 'POST') {
          return http.Response('{"marcadas":1}', 200, headers: _json);
        }
        return status == 200
            ? http.Response(jsonEncode(_colecao()), 200, headers: _json)
            : http.Response('{"message":"x"}', status, headers: _json);
      }),
    );

    testWidgets('mostra a coleção, o critério, o progresso e o aviso da nova', (
      tester,
    ) async {
      await tester.pumpWidget(MaterialApp(home: TelaConquistas(api: api())));
      await tester.pumpAndSettle();

      expect(pedidos.first.url.path, '/me/conquistas');
      expect(pedidos.first.headers['authorization'], 'Bearer tk');
      // Depois de exibir o aviso, confirma só a novidade exibida.
      expect(pedidos, hasLength(2));
      expect(pedidos.last.method, 'POST');
      expect(pedidos.last.url.path, '/me/conquistas/vistas');
      expect(jsonDecode(pedidos.last.body), {
        'vistas': [
          {'id': 'a', 'contexto': '2026/2'},
        ],
      });
      expect(find.text('Explorador'), findsOneWidget);
      expect(find.text('Nova!'), findsOneWidget);
      expect(find.text('Conquista desbloqueada: Explorador!'), findsOneWidget);
      expect(
        find.textContaining('Coletar 3 PucStops no semestre.'),
        findsOneWidget,
      );
      expect(find.textContaining('Conquista de carreira'), findsOneWidget);
      expect(find.text('Missionário'), findsOneWidget);
      expect(find.textContaining('Vale +10 XP.'), findsOneWidget);
      expect(find.text('2 de 5'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });

    testWidgets('falha mostra a mensagem e deixa tentar de novo', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(home: TelaConquistas(api: api(status: 500))),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Não foi possível carregar'), findsOneWidget);
      // Falhou ao carregar: nada é confirmado, o aviso volta depois.
      expect(pedidos.where((p) => p.method == 'POST'), isEmpty);
      await tester.tap(find.text('Tentar novamente'));
      await tester.pumpAndSettle();
      expect(pedidos, hasLength(2));
    });

    testWidgets('sem sessão não chama a API', (tester) async {
      sessao.configurarApi(ParticipacoesApi());
      await tester.pumpWidget(MaterialApp(home: TelaConquistas(api: api())));
      await tester.pumpAndSettle();
      expect(pedidos, isEmpty);
      expect(find.textContaining('Entre na sua conta'), findsOneWidget);
    });
  });
}
