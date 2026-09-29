import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/tela_cadastro.dart';
import 'package:ajuda_ai/tela_cadastro_concluido.dart';
import 'package:ajuda_ai/tela_cadastro_perfil.dart';
import 'package:ajuda_ai/tela_cadastro_revisao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:ajuda_ai/tela_padrinho_definido.dart';
import 'package:ajuda_ai/tela_participacao.dart';

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

Future<void> _irParaFormulario(WidgetTester tester) async {
  await _tocar(tester, find.text('Continuar'));
  await _tocar(tester, find.text('Quero ser apadrinhado'));
  await _tocar(tester, find.text('Continuar'));
}

Widget _escolhaNoPeriodo(int periodo) => MaterialApp(
  home: ParticipacaoPage(
    dados: DadosCadastro(
      nome: 'Camila Duarte',
      email: 'camila@pucminas.edu.br',
      curso: 'Engenharia de Software',
      periodo: periodo,
      turno: 'Noite',
    ),
  ),
);

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
    expect(find.text('Passo 1 de 2'), findsOneWidget);

    await _tocar(tester, find.byType(DropdownButton<int>));
    await tester.tap(find.text('2º período').last);
    await tester.pumpAndSettle();

    expect(find.text('2º período'), findsOneWidget);
  });

  testWidgets('passo 2 não avança com campos obrigatórios vazios', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));
    await _irParaFormulario(tester);

    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(PerfilCadastroPage), findsOneWidget);
    expect(find.byType(RevisaoCadastroPage), findsNothing);
    expect(
      find.text('Preencha os campos destacados para continuar.'),
      findsOneWidget,
    );
  });

  testWidgets('fluxo até a revisão leva as respostas do formulário', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));

    await _irParaFormulario(tester);
    expect(find.byType(PerfilCadastroPage), findsOneWidget);
    expect(find.text('Passo 1 de 2'), findsOneWidget);

    await _preencherPasso2(tester);
    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(RevisaoCadastroPage), findsOneWidget);
    expect(find.text('Passo 2 de 2'), findsOneWidget);
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
    await _irParaFormulario(tester);
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

  testWidgets('calouro não pode escolher ser padrinho', (tester) async {
    await tester.pumpWidget(_escolhaNoPeriodo(1));

    expect(find.text('Passo 2 de 2'), findsOneWidget);
    expect(
      find.text('Essa opção fica disponível mais para frente.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Quero ser padrinho'));
    await tester.pumpAndSettle();

    expect(find.text('Conecte-se com novos alunos'), findsNothing);
    expect(
      find.text('Agora é a sua vez de ser recebido no programa'),
      findsOneWidget,
    );

    await _tocar(tester, find.text('Continuar'));

    expect(
      find.text('Essa opção não está disponível para você.'),
      findsOneWidget,
    );
  });

  testWidgets('a partir do 2º período não pode ser apadrinhado', (
    tester,
  ) async {
    await tester.pumpWidget(_escolhaNoPeriodo(3));

    expect(
      find.text('Essa opção é para quem está chegando na PUC.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Quero ser apadrinhado'));
    await tester.pumpAndSettle();

    expect(
      find.text('O apadrinhamento é pensado para os calouros'),
      findsOneWidget,
    );

    await tester.tap(find.text('Quero ser padrinho'));
    await tester.pumpAndSettle();

    expect(find.text('Conecte-se com novos alunos'), findsOneWidget);
  });

  testWidgets('continuar sem escolher mostra aviso', (tester) async {
    await tester.pumpWidget(_escolhaNoPeriodo(1));

    await _tocar(tester, find.text('Continuar'));

    expect(find.text('Escolha uma opção para continuar.'), findsOneWidget);
    expect(find.byType(PerfilCadastroPage), findsNothing);
  });
}
