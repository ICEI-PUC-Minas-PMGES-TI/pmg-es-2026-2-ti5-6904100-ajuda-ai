import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ajuda_ai/coordenacao/pares_recusados_matching.dart';
import 'package:ajuda_ai/coordenacao/tela_matching_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';

http.Response json(Object valor, [int status = 200]) => http.Response(
  jsonEncode(valor),
  status,
  headers: {'content-type': 'application/json'},
);
Map<String, dynamic> get par => {
  'id': 3,
  'padrinho': {'nome': 'Ana'},
  'apadrinhado': {'nome': 'Bia'},
  'responsavel': 'coord1',
  'motivo': 'Horários',
  'podeReconsiderar': true,
  'historico': [
    {
      'id': 3,
      'acao': 'recusado',
      'responsavel': 'coord1',
      'motivo': 'Horários',
    },
  ],
};

void main() {
  Widget tela(Widget filho) => MaterialApp(
    home: Scaffold(body: SingleChildScrollView(child: filho)),
  );
  testWidgets(
    'reconsiderar exige justificativa e não aprova o vínculo automaticamente',
    (tester) async {
      final pedidos = <http.Request>[];
      var alteracoes = 0;
      final api = CoordenacaoApi(
        accessToken: 'jwt',
        baseUrl: '',
        client: MockClient((pedido) async {
          pedidos.add(pedido);
          if (pedido.method == 'GET') return json([par]);
          expect(jsonDecode(pedido.body), {
            'justificativa': 'Informação complementada',
          });
          return json({'impedido': false, 'novaExecucaoNecessaria': true});
        }),
      );
      await tester.pumpWidget(
        tela(
          ParesRecusadosMatching(
            api: api,
            programa: '2026/2',
            onAlterado: () => alteracoes++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(pedidos.first.url.queryParameters['programa'], '2026/2');
      await tester.tap(find.text('Reconsiderar par'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Confirmar reconsideração'),
            )
            .onPressed,
        isNull,
      );
      await tester.enterText(
        find.byType(TextField),
        '  Informação complementada  ',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirmar reconsideração'));
      await tester.pumpAndSettle();
      expect(alteracoes, 1);
      expect(
        find.text('Nenhum par recusado está impedido neste ciclo.'),
        findsOneWidget,
      );
      expect(
        pedidos.last.url.path,
        '/coordenacao/matching/pares/3/reconsiderar',
      );
      expect(pedidos.any((p) => p.url.path.contains('/aprovar')), isFalse);
      expect(find.textContaining('Gere uma nova rodada'), findsOneWidget);
    },
  );
  testWidgets('conflito mantém o par e mostra o erro recebido', (tester) async {
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient(
        (pedido) async => pedido.method == 'GET'
            ? json([par])
            : json({'message': 'A decisão do par mudou.'}, 409),
      ),
    );
    await tester.pumpWidget(
      tela(ParesRecusadosMatching(api: api, programa: '2026/2')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reconsiderar par'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Reavaliado');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmar reconsideração'));
    await tester.pumpAndSettle();
    expect(find.textContaining('decisão do par mudou'), findsOneWidget);
    expect(find.text('Ana e Bia'), findsOneWidget);
  });
  testWidgets('resposta atrasada de outro ciclo não substitui a lista atual', (
    tester,
  ) async {
    final antiga = Completer<http.Response>();
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient(
        (pedido) async => pedido.url.queryParameters['programa'] == '2026/2'
            ? antiga.future
            : json([]),
      ),
    );
    await tester.pumpWidget(
      tela(
        ParesRecusadosMatching(
          key: const ValueKey('pares'),
          api: api,
          programa: '2026/2',
        ),
      ),
    );
    await tester.pump();
    await tester.pumpWidget(
      tela(
        ParesRecusadosMatching(
          key: const ValueKey('pares'),
          api: api,
          programa: '2027/1',
        ),
      ),
    );
    await tester.pumpAndSettle();
    antiga.complete(json([par]));
    await tester.pumpAndSettle();
    expect(find.text('Ana e Bia'), findsNothing);
    expect(
      find.text('Nenhum par recusado está impedido neste ciclo.'),
      findsOneWidget,
    );
  });
  testWidgets('tela principal ignora uma visão atrasada de outro ciclo', (
    tester,
  ) async {
    final antiga = Completer<http.Response>();
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient((pedido) async {
        if (pedido.url.path != '/coordenacao/matching') return json([]);
        if (pedido.url.queryParameters['programa'] == '2026/2') {
          return antiga.future;
        }
        return json({
          'podeExecutar': false,
          'bloqueios': ['Ciclo atual: aguardando inscrições'],
        });
      }),
    );
    Widget principal(String programa) => MaterialApp(
      home: TelaMatchingCoord(
        key: const ValueKey('matching'),
        api: api,
        programa: programa,
      ),
    );
    await tester.pumpWidget(principal('2026/2'));
    await tester.pump();
    await tester.pumpWidget(principal('2027/1'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Ciclo atual: aguardando inscrições'),
      findsOneWidget,
    );
    antiga.complete(json({'podeExecutar': true, 'bloqueios': []}));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('Ciclo atual: aguardando inscrições'),
      findsOneWidget,
    );
    expect(find.text('Pronto para executar'), findsNothing);
  });
  testWidgets('histórico mostra recusa e reconsideração sem apagar autores', (
    tester,
  ) async {
    await tester.pumpWidget(
      tela(
        const HistoricoParMatching(
          eventos: [
            {
              'id': 1,
              'acao': 'recusado',
              'responsavel': 'coord1',
              'motivo': 'Horários',
            },
            {
              'id': 2,
              'acao': 'reconsiderado',
              'responsavel': 'coord2',
              'motivo': 'Informação complementada',
            },
          ],
        ),
      ),
    );
    await tester.tap(find.text('Histórico das decisões do par'));
    await tester.pumpAndSettle();
    expect(find.text('Recusado por coord1'), findsOneWidget);
    expect(find.text('Reconsiderado por coord2'), findsOneWidget);
  });
  testWidgets(
    'sugestão desatualizada não oferece confirmação e informa o motivo',
    (tester) async {
      final api = CoordenacaoApi(
        accessToken: 'jwt',
        baseUrl: '',
        client: MockClient(
          (pedido) async => json({
            'id': 7,
            'status': 'obsoleta',
            'podeAprovar': false,
            'validade': {
              'mensagens': ['A configuração mudou.'],
            },
            'padrinho': {'nome': 'Ana'},
            'apadrinhado': {'nome': 'Bia'},
            'explicacao': {'score': 1, 'criterios': []},
          }),
        ),
      );
      await tester.pumpWidget(
        MaterialApp(home: TelaComparacaoMatching(api: api, id: 7)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Confirmar match'), findsNothing);
      expect(
        find.textContaining('Sugestão desatualizada. A configuração mudou.'),
        findsOneWidget,
      );
    },
  );
}
