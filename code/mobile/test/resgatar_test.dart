import 'dart:convert';

import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/services/lojinha_api.dart';
import 'package:ajuda_ai/tela_home.dart';
import 'package:ajuda_ai/tela_resgatar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('botão Resgatar da home abre a tela de resgate', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: HomePage()));

    await tester.tap(find.text('Resgatar'));
    await tester.pumpAndSettle();

    expect(find.byType(ResgatarPage), findsOneWidget);
    // Saldo real (sem login no teste: 0), não mais o exemplo fixo 1.430.
    expect(find.text('0 XP'), findsOneWidget);
    expect(find.text('Nenhum item disponível ainda'), findsOneWidget);
  });

  testWidgets('item só pode ser resgatado com saldo e estoque', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ResgatarPage(
          saldoXp: 500,
          itens: [
            ItemResgate(
              id: 1,
              nome: 'Caneca PUC',
              descricao: 'Caneca oficial',
              custoXp: 300,
              estoque: 5,
            ),
            ItemResgate(
              id: 2,
              nome: 'Moletom',
              descricao: 'Moletom do curso',
              custoXp: 2000,
            ),
            ItemResgate(
              id: 3,
              nome: 'Garrafa',
              descricao: 'Garrafa térmica',
              custoXp: 100,
              estoque: 0,
            ),
          ],
        ),
      ),
    );

    expect(find.text('300 XP · 5 disponíveis'), findsOneWidget);
    expect(find.text('2.000 XP · Faltam 1.500 XP'), findsOneWidget);
    expect(find.text('100 XP · Esgotado'), findsOneWidget);

    final botoes = tester
        .widgetList<FilledButton>(find.byType(FilledButton))
        .toList();
    expect(botoes.map((b) => b.onPressed != null), [true, false, false]);

    await tester.tap(find.byWidget(botoes.first));
    await tester.pumpAndSettle();
    expect(find.text('Resgatar Caneca PUC?'), findsOneWidget);
  });

  testWidgets('carrega recompensas e atualiza o XP após resgate', (
    tester,
  ) async {
    SessaoUsuario.atual.assumirSessao(
      accessToken: 'token',
      nome: 'Ana',
      email: 'ana@pucminas.edu.br',
    );
    var estoque = 1;
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient((req) async {
        if (req.method == 'POST') {
          estoque = 0;
          return http.Response(
            jsonEncode({
              'id': 'comprovante',
              'saldoApos': 70,
              'saldoAtual': 70,
            }),
            201,
          );
        }
        return http.Response(
          jsonEncode([
            {
              'id': 'item',
              'nome': 'Caneca',
              'descricao': 'Azul',
              'custoXp': 30,
              'estoque': estoque,
              'condicoesRetirada': 'Secretaria',
            },
          ]),
          200,
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(home: ResgatarPage(saldoXp: 100, api: api)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Caneca'), findsOneWidget);
    await tester.tap(find.byType(FilledButton).first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Secretaria'), findsOneWidget);
    await tester.tap(find.text('Resgatar').last);
    await tester.pumpAndSettle();
    expect(SessaoUsuario.atual.xp.value, 70);
    expect(find.text('70 XP'), findsOneWidget);
    expect(find.text('30 XP · Esgotado'), findsOneWidget);
    expect(find.textContaining('comprovante'), findsOneWidget);
  });
}
