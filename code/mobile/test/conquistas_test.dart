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

Map<String, Object?> _colecao({List<String> novas = const ['a']}) => {
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
        ColecaoConquistas.fromJson(_colecao(novas: ['a', 'b']))!.avisoNovas,
        'Você desbloqueou 2 conquistas!',
      );
      expect(
        ColecaoConquistas.fromJson(_colecao(novas: []))!.avisoNovas,
        isNull,
      );
    });

    test('resposta malformada vira null, sem quebrar', () {
      expect(ColecaoConquistas.fromJson({'obtidas': 'x'}), isNull);
      expect(ConquistaDisponivel.fromJson({'id': 'x', 'nome': 'y'}), isNull);
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

      expect(pedidos.single.url.path, '/me/conquistas');
      expect(pedidos.single.headers['authorization'], 'Bearer tk');
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
