import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ajuda_ai/tela_cadastro.dart';
import 'package:ajuda_ai/tela_cadastro_concluido.dart';
import 'package:ajuda_ai/tela_cadastro_perfil.dart';
import 'package:ajuda_ai/tela_cadastro_revisao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:ajuda_ai/tela_padrinho_definido.dart';

Future<void> _tocar(WidgetTester tester, Finder alvo) async {
  await tester.scrollUntilVisible(
    alvo,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

Future<void> _escolher<T>(
  WidgetTester tester,
  String dica,
  String opcao,
) async {
  await _tocar(tester, find.widgetWithText(DropdownButton<T>, dica));
  await tester.tap(find.text(opcao).last);
  await tester.pumpAndSettle();
}

Future<void> _preencherPasso2(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).first, 'Dicas sobre a rotina');
  await _tocar(tester, find.text('Selecione uma ou mais áreas'));
  await tester.tap(find.text('Projetos').last);
  await tester.pumpAndSettle();
  await _escolher<String>(tester, 'Selecione sua disponibilidade', 'Noite');
  await _escolher<String>(tester, 'Selecione', 'Feminino');
  await _escolher<bool>(tester, 'Selecione', 'Não');
  await _escolher<bool>(tester, 'Selecione uma opção', 'Sim');
}

void main() {
  testWidgets('período começa no 1º e pode ser alterado', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));

    expect(find.text('1º período'), findsOneWidget);
    expect(find.text('Passo 1 de 3'), findsOneWidget);

    await _tocar(tester, find.byType(DropdownButton<int>));
    await tester.tap(find.text('2º período').last);
    await tester.pumpAndSettle();

    expect(find.text('2º período'), findsOneWidget);
  });

  testWidgets('passo 2 não avança com campos obrigatórios vazios', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));
    await _tocar(tester, find.text('Continuar'));

    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(PerfilCadastroPage), findsOneWidget);
    expect(find.byType(RevisaoCadastroPage), findsNothing);
    expect(
      find.text('Preencha os campos destacados para continuar.'),
      findsOneWidget,
    );
  });

  testWidgets('fluxo passo 1 → 2 → 3 leva as respostas para a revisão', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));

    await _tocar(tester, find.text('Continuar'));
    expect(find.byType(PerfilCadastroPage), findsOneWidget);
    expect(find.text('Passo 2 de 3'), findsOneWidget);

    await _preencherPasso2(tester);
    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(RevisaoCadastroPage), findsOneWidget);
    expect(find.text('Passo 3 de 3'), findsOneWidget);
    expect(find.text('Dicas sobre a rotina'), findsOneWidget);
    expect(find.text('Projetos'), findsOneWidget);
    expect(find.text('Noite'), findsOneWidget);
    expect(find.text('Feminino'), findsOneWidget);
    expect(find.text('Não informado'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.byTooltip('Editar Gênero'));
    await tester.pumpAndSettle();

    expect(find.byType(PerfilCadastroPage), findsOneWidget);
    expect(find.byType(RevisaoCadastroPage), findsNothing);
    expect(find.text('Dicas sobre a rotina'), findsOneWidget);
  });

  testWidgets('enviar cadastro mostra a conclusão sem volta ao cadastro', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));
    await _tocar(tester, find.text('Continuar'));
    await _preencherPasso2(tester);
    await _tocar(tester, find.text('Continuar'));

    await _tocar(tester, find.text('Enviar cadastro'));

    expect(find.byType(CadastroConcluidoPage), findsOneWidget);
    expect(find.text('Cadastro concluído!'), findsOneWidget);
    expect(find.byType(CadastroPage), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Ir para meu perfil'));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.byType(CadastroConcluidoPage), findsNothing);
  });

  testWidgets('sino da conclusão abre o padrinho definido', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroConcluidoPage()));

    await tester.tap(find.byTooltip('Notificações'));
    await tester.pumpAndSettle();

    expect(find.byType(PadrinhoDefinidoPage), findsOneWidget);
    expect(find.text('Seu padrinho foi definido!'), findsOneWidget);
    expect(find.text('Thiago Moreira'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
