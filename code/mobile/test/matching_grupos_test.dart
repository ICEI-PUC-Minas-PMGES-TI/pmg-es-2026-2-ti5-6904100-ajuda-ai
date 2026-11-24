import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ajuda_ai/coordenacao/grupos_matching.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';

http.Response json(Object dados, [int status = 200]) => http.Response(
  jsonEncode(dados),
  status,
  headers: {'content-type': 'application/json'},
);
Map<String, dynamic> grupos({bool aberto = true, String nome = 'Origem'}) => {
  'podeMovimentar': aberto,
  'grupos': [
    {
      'id': 1,
      'nome': nome,
      'padrinho': {'id': 1, 'nome': 'Ana'},
      'ocupacao': 1,
      'apadrinhados': [
        {'id': 100, 'nome': 'Bia', 'vinculoId': 7},
      ],
    },
  ],
  'historico': [],
  'inconsistencias': [],
};
Map<String, dynamic> get destinos => {
  'programa': '2026/2',
  'destinos': [
    {
      'padrinhoId': 2,
      'nome': 'Destino',
      'vagas': 2,
      'capacidade': 3,
      'permitido': true,
      'compatibilidade': {'aderencia': 1, 'cobertura': .5},
    },
    {
      'padrinhoId': 3,
      'nome': 'Lotado',
      'vagas': 0,
      'capacidade': 3,
      'permitido': false,
      'bloqueio': 'Capacidade atingida.',
    },
  ],
};
Widget tela(CoordenacaoApi api, [String programa = '2026/2']) => MaterialApp(
  home: Scaffold(
    body: SingleChildScrollView(
      child: GruposMatchingCoord(api: api, programa: programa),
    ),
  ),
);

Future<void> escolherDestino(WidgetTester tester) async {
  await tester.tap(find.text('Transferir Bia'));
  await tester.pumpAndSettle();
  await tester.tap(find.byType(DropdownButtonFormField<int>));
  await tester.pumpAndSettle();
  await tester.tap(find.textContaining('Destino · 2 vaga(s)').last);
  await tester.pumpAndSettle();
}

void main() {
  test(
    'identificador de operação é UUID v4 e não se repete entre intenções',
    () {
      final ids = List.generate(20, (_) => novoIdOperacaoMatching());
      expect(ids.toSet().length, 20);
      for (final id in ids) {
        expect(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ).hasMatch(id),
          isTrue,
        );
      }
    },
  );
  testWidgets('transferir exige motivo e usa uma operação atômica', (
    tester,
  ) async {
    final posts = <http.Request>[];
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient((pedido) async {
        if (pedido.method == 'POST') {
          posts.add(pedido);
          return json({});
        }
        return json(
          pedido.url.path.endsWith('/destinos') ? destinos : grupos(),
        );
      }),
    );
    await tester.pumpWidget(tela(api));
    await tester.pumpAndSettle();
    await escolherDestino(tester);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Confirmar transferência'),
          )
          .onPressed,
      isNull,
    );
    expect(find.textContaining('Cobertura: 50%'), findsOneWidget);
    await tester.enterText(
      find.byType(TextField),
      '  Melhor disponibilidade  ',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmar transferência'));
    await tester.pumpAndSettle();
    expect(posts, hasLength(1));
    expect(
      posts.single.url.path,
      '/coordenacao/matching/vinculos/7/transferir',
    );
    expect(jsonDecode(posts.single.body), containsPair('padrinhoDestinoId', 2));
    expect(
      jsonDecode(posts.single.body),
      containsPair('motivo', 'Melhor disponibilidade'),
    );
    expect(find.text('Transferência confirmada.'), findsOneWidget);
  });
  testWidgets(
    'falha permite repetir exatamente o mesmo identificador e destino',
    (tester) async {
      final corpos = <Map<String, dynamic>>[];
      final api = CoordenacaoApi(
        accessToken: 'jwt',
        baseUrl: '',
        client: MockClient((pedido) async {
          if (pedido.method == 'POST') {
            corpos.add(Map<String, dynamic>.from(jsonDecode(pedido.body)));
            return corpos.length == 1
                ? json({'message': 'Resultado indisponível'}, 500)
                : json({});
          }
          return json(
            pedido.url.path.endsWith('/destinos') ? destinos : grupos(),
          );
        }),
      );
      await tester.pumpWidget(tela(api));
      await tester.pumpAndSettle();
      await escolherDestino(tester);
      await tester.enterText(find.byType(TextField), 'Acompanhamento');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirmar transferência'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Resultado indisponível'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
      await tester.tap(find.text('Tentar mesma transferência'));
      await tester.pumpAndSettle();
      expect(corpos, hasLength(2));
      expect(corpos[1], corpos[0]);
    },
  );
  testWidgets('trocar ciclo ignora resposta antiga de grupos', (tester) async {
    final antigo = Completer<http.Response>();
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient(
        (pedido) async => pedido.url.queryParameters['programa'] == '2026/2'
            ? antigo.future
            : json(grupos(nome: 'Ciclo atual')),
      ),
    );
    await tester.pumpWidget(tela(api));
    await tester.pump();
    await tester.pumpWidget(tela(api, '2027/1'));
    await tester.pumpAndSettle();
    antigo.complete(json(grupos(nome: 'Ciclo antigo')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Ciclo atual'), findsOneWidget);
    expect(find.textContaining('Ciclo antigo'), findsNothing);
  });
  testWidgets('ciclo encerrado mostra grupos e desabilita transferência', (
    tester,
  ) async {
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient((_) async => json(grupos(aberto: false))),
    );
    await tester.pumpWidget(tela(api));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Transferir Bia'))
          .onPressed,
      isNull,
    );
  });
  testWidgets(
    'diálogo não envia transferência quando a seleção de ciclo mudou',
    (tester) async {
      var atual = true;
      var posts = 0;
      final api = CoordenacaoApi(
        accessToken: 'jwt',
        baseUrl: '',
        client: MockClient((p) async {
          if (p.method == 'POST') {
            posts++;
          }
          return json(destinos);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TransferirVinculoDialog(
              api: api,
              programa: '2026/2',
              pessoa: const {'id': 100, 'nome': 'Bia', 'vinculoId': 7},
              aindaNoCiclo: () => atual,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<int>));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Destino · 2 vaga(s)').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Acompanhamento');
      await tester.pumpAndSettle();
      atual = false;
      await tester.tap(find.text('Confirmar transferência'));
      await tester.pumpAndSettle();
      expect(posts, 0);
      expect(find.textContaining('ciclo selecionado mudou'), findsOneWidget);
    },
  );
}
