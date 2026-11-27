import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/models/formulario.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_cadastro.dart';
import 'package:ajuda_ai/tela_cadastro_concluido.dart';
import 'package:ajuda_ai/tela_cadastro_perfil.dart';
import 'package:ajuda_ai/tela_cadastro_revisao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:ajuda_ai/tela_padrinho_definido.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:ajuda_ai/widgets/campos_cadastro.dart';

import 'helpers/api_falsa.dart';

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
  await _tocar(tester, find.byType(CheckboxListTile));
}

void main() {
  late ApiFalsa api;

  setUp(() {
    api = ApiFalsa().instalar();
    SessaoUsuario.atual.definirIdentidade(
      nome: 'Camila Duarte',
      email: 'camila@pucminas.edu.br',
    );
    SessaoUsuario.atual.onboardingToken = 'onboarding-teste';
  });
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('não nasce como Camila sem conta autenticada', (tester) async {
    SessaoUsuario.atual.limpar();
    api = ApiFalsa().instalar();
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));

    expect(find.text('Camila Duarte'), findsNothing);
    expect(find.text('camila@pucminas.edu.br'), findsNothing);
    await _tocar(tester, find.text('Continuar'));
    expect(
      find.text('Entre com a conta institucional antes de completar o perfil.'),
      findsOneWidget,
    );
    expect(find.byType(ParticipacaoPage), findsNothing);
  });

  testWidgets('conta autenticada preenche nome e e-mail bloqueado', (
    tester,
  ) async {
    SessaoUsuario.atual.definirIdentidade(
      nome: 'Ana Souza',
      email: 'ana.souza@pucminas.edu.br',
    );
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));

    expect(find.text('Ana Souza'), findsOneWidget);
    expect(find.text('ana.souza@pucminas.edu.br'), findsOneWidget);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(
      tester.widget<CampoTexto>(find.byType(CampoTexto).at(1)).bloqueado,
      isTrue,
    );
    expect(
      find.widgetWithText(TextField, 'ana.souza@pucminas.edu.br'),
      findsNothing,
    );
  });

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
    expect(find.text('Passo 2 de 3'), findsOneWidget);

    await _preencherPasso2(tester);
    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(RevisaoCadastroPage), findsOneWidget);
    expect(find.text('Passo 3 de 3'), findsOneWidget);
    // A sessão já guarda as respostas do passo 2.
    expect(SessaoUsuario.atual.dados?.genero, 'Feminino');
    expect(SessaoUsuario.atual.dados?.areasApoio, ['Projetos']);
    expect(find.text('Dicas sobre a rotina'), findsOneWidget);
    expect(find.text('Projetos'), findsOneWidget);
    expect(find.text('Noite'), findsOneWidget);
    expect(find.text('Feminino'), findsOneWidget);
    expect(find.text('Não informado'), findsNWidgets(2));
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
    expect(find.text('Cadastro enviado!'), findsOneWidget);
    expect(
      find.text('Agora ele aguarda a aprovação da coordenação.'),
      findsOneWidget,
    );
    expect(find.byType(CadastroPage), findsNothing);
    expect(tester.takeException(), isNull);

    // POST /cadastro (mesmo endpoint do web) com dados + respostas.
    expect(api.posts('/participacoes/cadastro-apadrinhado'), isEmpty);
    final envio = api.posts('/cadastro').single;
    expect(envio.headers.containsKey('x-user-id'), isFalse);
    expect(envio.headers['authorization'], 'Bearer ${ApiFalsa.token}');
    final corpo = api.corpo(envio);
    expect(corpo, containsPair('email', 'camila@pucminas.edu.br'));
    expect(corpo, containsPair('nome', 'Camila Duarte'));
    expect(corpo, containsPair('curso', 'Engenharia de Software'));
    expect(corpo, containsPair('periodo', 1));
    expect(corpo, containsPair('tipoParticipacao', 'apadrinhado'));
    expect(corpo['respostas'], {
      'nome': 'Camila Duarte',
      'curso': 'Engenharia de Software',
      'periodo': 1,
      'turno': 'Noite',
      'interesses': <String>[],
      'genero': 'Feminino',
      'bolsistaProuni': false,
      'deOutraCidade': true,
      'disponibilidade': ['Noite'],
      'areas': ['Projetos'],
      'expectativa': 'Dicas sobre a rotina',
      'declaraPrimeiroPeriodo': true,
      'extras': <String, dynamic>{},
    });
    // Cadastro novo nasce PENDENTE e o app guarda o token da sessão.
    expect(SessaoUsuario.atual.status, StatusParticipacao.apadrinhadoPendente);
    expect(SessaoUsuario.atual.accessToken, ApiFalsa.token);

    await tester.tap(find.text('Ir para meu perfil'));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.byType(CadastroConcluidoPage), findsNothing);
  });

  testWidgets('erro do backend no envio permite tentar de novo', (
    tester,
  ) async {
    api.erroEnvio = 'Inscrições encerradas para este ciclo.';
    await tester.pumpWidget(const MaterialApp(home: CadastroPage()));
    await _irParaFormulario(tester);
    await _preencherPasso2(tester);
    await _tocar(tester, find.text('Continuar'));

    await _tocar(tester, find.text('Enviar cadastro'));

    expect(find.byType(RevisaoCadastroPage), findsOneWidget);
    expect(find.byType(CadastroConcluidoPage), findsNothing);
    expect(
      find.textContaining('Inscrições encerradas para este ciclo.'),
      findsOneWidget,
    );
    expect(find.text('Enviar cadastro'), findsOneWidget);

    api.erroEnvio = null;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();

    expect(find.byType(CadastroConcluidoPage), findsOneWidget);
    expect(api.posts('/cadastro'), hasLength(2));
  });

  testWidgets('perguntas adicionais do apadrinhado são validadas', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: PerfilCadastroPage(
          dados: DadosCadastro(
            nome: 'Camila Duarte',
            email: 'camila@pucminas.edu.br',
            curso: 'Engenharia de Software',
            periodo: 1,
            turno: 'Noite',
          ),
          perguntasAdicionais: [
            PerguntaFormulario(
              id: 'dificuldade',
              enunciado: 'Qual sua maior dificuldade?',
              tipo: TipoPergunta.textoCurto,
              obrigatoria: true,
            ),
          ],
        ),
      ),
    );

    await _preencherPasso2(tester);
    await _tocar(tester, find.text('Continuar'));
    expect(find.byType(RevisaoCadastroPage), findsNothing);
    expect(find.text('Responda esta pergunta para continuar.'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'Cálculo');
    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(RevisaoCadastroPage), findsOneWidget);
    expect(find.text('Qual sua maior dificuldade?'), findsOneWidget);
    expect(find.text('Cálculo'), findsOneWidget);
    expect(SessaoUsuario.atual.dados?.extras, {'dificuldade': 'Cálculo'});
  });

  testWidgets('sino abre notificações e leva ao padrinho definido', (
    tester,
  ) async {
    api.situacao = situacaoApadrinhadoAtivo();
    api.avisos.add({
      'id': 1,
      'titulo': 'Encontro de Boas-vindas',
      'descricao': 'Participe do encontro de integração.',
      'publico': 'todos',
      'data': '2026-09-12',
    });
    SessaoUsuario.atual.definir(
      dadosCadastro: const DadosCadastro(
        nome: 'Camila Duarte',
        email: 'camila@pucminas.edu.br',
        curso: 'Engenharia de Software',
        periodo: 1,
        turno: 'Noite',
      ),
      escolha: Participacao.apadrinhado,
    );
    await tester.pumpWidget(const MaterialApp(home: CadastroConcluidoPage()));

    await tester.tap(find.byTooltip('Notificações'));
    await tester.pumpAndSettle();

    expect(find.byType(PadrinhoDefinidoPage), findsNothing);
    expect(find.text('Notificações'), findsOneWidget);
    expect(find.text('Encontro de Boas-vindas'), findsOneWidget);
    expect(
      api.requisicoes.any(
        (r) =>
            r.url.path.endsWith('/avisos') &&
            r.url.queryParameters['publico'] == 'apadrinhados',
      ),
      isTrue,
    );

    await tester.tap(find.text('Seu padrinho foi definido!'));
    await tester.pumpAndSettle();

    expect(find.byType(PadrinhoDefinidoPage), findsOneWidget);
    expect(find.text('Thiago Moreira'), findsOneWidget);

    // O cartão de vínculo exibe os dados atuais e abre os chats reais.
    expect(find.text('Conversar'), findsOneWidget);
    expect(find.text('Ver conversas e histórico'), findsOneWidget);
    expect(SessaoUsuario.atual.padrinho?.email, 'thiago@pucminas.edu.br');
    expect(find.text('Grupo 08'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('sino sem padrinho definido não abre a tela do padrinho', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: CadastroConcluidoPage()));

    await tester.tap(find.byTooltip('Notificações'));
    await tester.pumpAndSettle();

    expect(find.text('Notificações'), findsOneWidget);
    expect(find.text('Seu padrinho foi definido!'), findsNothing);
    expect(find.byType(PadrinhoDefinidoPage), findsNothing);
  });

  testWidgets('calouro não pode escolher ser padrinho', (tester) async {
    await tester.pumpWidget(_escolhaNoPeriodo(1));

    expect(find.text('Passo 2 de 3'), findsOneWidget);
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
