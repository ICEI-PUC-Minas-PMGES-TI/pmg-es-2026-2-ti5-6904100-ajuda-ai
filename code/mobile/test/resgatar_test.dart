import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_home.dart';
import 'package:ajuda_ai/tela_resgatar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
}
