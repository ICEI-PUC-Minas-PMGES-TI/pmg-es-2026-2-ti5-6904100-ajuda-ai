import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/models/formulario.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_cadastro_padrinho.dart';
import 'package:ajuda_ai/tela_candidatura_enviada.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/api_falsa.dart';

DadosCadastro _dados({int periodo = 3}) => DadosCadastro(
  nome: 'Camila Duarte',
  email: 'camila@pucminas.edu.br',
  curso: 'Engenharia de Software',
  periodo: periodo,
  turno: 'Noite',
);

Future<void> _tocar(WidgetTester tester, Finder alvo) async {
  await tester.scrollUntilVisible(
    alvo,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(alvo);
  await tester.pumpAndSettle();
  if (find.text('Revise sua candidatura').evaluate().isNotEmpty) {
    expect(SessaoUsuario.atual.status, isNot(StatusParticipacao.padrinhoAtivo));
    await tester.scrollUntilVisible(
      find.text('Confirmar envio'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Confirmar envio'));
    await tester.pumpAndSettle();
  }
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

const _calculo = RequisitoPadrinho(id: 'calculo-i', descricao: 'Cálculo I');
const _aed = RequisitoPadrinho(id: 'aed-i', descricao: 'AED I');

/// Declara todos os requisitos vindos do backend (fake).
Future<void> _marcarDeclaracao(WidgetTester tester) async {
  for (final r in [_calculo, _aed]) {
    await _tocar(tester, find.text(CadastroPadrinhoPage.textoDeclaracao(r)));
  }
}

Future<void> _preencherCandidatura(
  WidgetTester tester, {
  bool declarar = true,
}) async {
  if (declarar) await _marcarDeclaracao(tester);
  await tester.enterText(
    find.byType(TextField).first,
    'Quero apoiar calouros na rotina da PUC.',
  );
  await _tocar(tester, find.text('Selecione uma ou mais áreas'));
  await tester.tap(find.text('Projetos').last);
  await tester.pumpAndSettle();

  await _tocar(tester, find.text('Selecione sua disponibilidade'));
  await tester.tap(find.text('Noite').last);
  await tester.pumpAndSettle();

  await _escolher<String>(tester, 'Selecione', 'Feminino');
  await _escolher<bool>(tester, 'Selecione', 'Não');
  await _escolher<bool>(tester, 'Selecione uma opção', 'Sim');
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

  testWidgets('participacao abre candidatura de padrinho', (tester) async {
    SessaoUsuario.atual.dados = _dados();
    await tester.pumpWidget(
      MaterialApp(home: ParticipacaoPage(dados: _dados())),
    );

    await tester.tap(find.text('Quero ser padrinho'));
    await tester.pumpAndSettle();
    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(CadastroPadrinhoPage), findsOneWidget);
    expect(find.text('Candidatura de padrinho'), findsOneWidget);
    expect(
      find.text('Pré-requisitos para ser padrinho neste semestre'),
      findsOneWidget,
    );
    expect(find.text('Passo 2 de 3'), findsOneWidget);
    // requisitos carregados do backend (GET /formularios/padrinho)
    expect(
      api.requisicoes.any((r) => r.url.path == '/formularios/padrinho'),
      isTrue,
    );
    expect(
      find.text(CadastroPadrinhoPage.textoDeclaracao(_calculo)),
      findsOneWidget,
    );
    expect(
      find.text(CadastroPadrinhoPage.textoDeclaracao(_aed)),
      findsOneWidget,
    );
    expect(find.text('Revisar candidatura'), findsOneWidget);
  });

  testWidgets('revisão permite voltar, editar e confirmar apenas uma vez', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(600, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );
    await _preencherCandidatura(tester);
    await tester.scrollUntilVisible(
      find.text('Revisar candidatura'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Revisar candidatura'));
    await tester.pumpAndSettle();
    expect(find.text('Revise sua candidatura'), findsOneWidget);
    expect(api.posts('/cadastro'), isEmpty);
    await _tocar(tester, find.text('Voltar e editar'));
    await tester.enterText(find.byType(TextField).first, 'Motivação revisada');
    await tester.scrollUntilVisible(
      find.text('Revisar candidatura'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Revisar candidatura'));
    await tester.pumpAndSettle();
    expect(find.text('Motivação revisada'), findsOneWidget);
    expect(api.posts('/cadastro'), isEmpty);
    await tester.scrollUntilVisible(
      find.text('Confirmar envio'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Confirmar envio'));
    await tester.tap(find.text('Confirmar envio'));
    await tester.pumpAndSettle();
    expect(api.posts('/cadastro'), hasLength(1));
    expect(
      (api.corpo(api.posts('/cadastro').single)['respostas']
          as Map)['motivacao'],
      'Motivação revisada',
    );
    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
  });

  testWidgets('validacao destaca campos obrigatorios', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.text('Conte por que você quer ser padrinho.'), findsOneWidget);
    expect(
      find.text('Selecione pelo menos uma área de interesse.'),
      findsOneWidget,
    );
    expect(
      find.text('Selecione pelo menos uma disponibilidade.'),
      findsOneWidget,
    );
    expect(
      find.text('Requisito obrigatório para se candidatar neste ciclo.'),
      findsNWidgets(2),
    );
    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(api.posts('/cadastro'), isEmpty);
  });

  testWidgets('requisitos obrigatórios do ciclo precisam ser declarados', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester, declarar: false);
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(
      find.text('Requisito obrigatório para se candidatar neste ciclo.'),
      findsNWidgets(2),
    );
    expect(api.posts('/cadastro'), isEmpty);

    await _marcarDeclaracao(tester);
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    final envio = api.posts('/cadastro').single;
    expect(envio.headers.containsKey('x-user-id'), isFalse);
    final corpo = api.corpo(envio);
    expect(corpo['email'], 'camila@pucminas.edu.br');
    expect(corpo['tipoParticipacao'], 'padrinho');
    final respostas = corpo['respostas'] as Map<String, dynamic>;
    expect(respostas['requisitos'], [
      {'id': 'calculo-i', 'cumpre': true},
      {'id': 'aed-i', 'cumpre': true},
    ]);
    expect(respostas.containsKey('declaraPreRequisitos'), isFalse);
    expect(respostas['motivacao'], 'Quero apoiar calouros na rotina da PUC.');
    expect(respostas['areas'], ['Projetos']);
    expect(respostas['disponibilidade'], ['Noite']);
    expect(respostas['genero'], 'Feminino');
    expect(respostas['bolsistaProuni'], isFalse);
    expect(respostas['deOutraCidade'], isTrue);
    expect(respostas['nome'], 'Camila Duarte');
    expect(respostas['periodo'], 3);
    expect(respostas['extras'], isEmpty);
  });

  testWidgets('erro do backend mantém a candidatura na tela', (tester) async {
    api.erroEnvio = 'Inscrições encerradas.';
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(find.textContaining('Inscrições encerradas.'), findsOneWidget);
    expect(find.text('Confirmar envio'), findsOneWidget);
    expect(SessaoUsuario.atual.status, StatusParticipacao.nenhuma);
  });

  testWidgets('perguntas adicionais obrigatórias vão em extras', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CadastroPadrinhoPage(
          dados: _dados(),
          perguntasAdicionais: const [
            PerguntaFormulario(
              id: 'como-conheceu',
              enunciado: 'Como você conheceu o programa?',
              tipo: TipoPergunta.dropdown,
              opcoes: ['Colegas', 'Professores'],
              obrigatoria: true,
            ),
          ],
        ),
      ),
    );

    expect(find.text('Perguntas adicionais'), findsOneWidget);

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Revisar candidatura'));
    expect(find.text('Responda esta pergunta para continuar.'), findsOneWidget);
    expect(api.posts('/cadastro'), isEmpty);

    await _escolher<String>(tester, 'Selecione uma opção', 'Professores');
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    final respostas =
        api.corpo(api.posts('/cadastro').single)['respostas']
            as Map<String, dynamic>;
    expect(respostas['extras'], {'como-conheceu': 'Professores'});
  });

  for (final tipo in ['upload', 'file', 'attachment', 'outro']) {
    testWidgets(
      'formulário legado $tipo não permite candidatura mesmo opcional',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: CadastroPadrinhoPage(
              dados: _dados(),
              requisitos: const [],
              perguntasAdicionais: [
                PerguntaFormulario.fromJson({
                  'id': 'legado',
                  'enunciado': 'Pergunta antiga',
                  'tipo': tipo,
                  'obrigatoria': false,
                }),
              ],
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text(mensagemFormularioNaoSuportado), findsOneWidget);
        await _tocar(tester, find.text('Revisar candidatura'));
        expect(api.posts('/cadastro'), isEmpty);
        expect(find.byType(CandidaturaEnviadaPage), findsNothing);
      },
    );
  }

  testWidgets(
    'erro de tipo não suportado recebido da API é mostrado e bloqueia envio',
    (tester) async {
      api = ApiFalsa(
        formularios: {
          'padrinho': {
            'tipo': 'padrinho',
            'publicado': true,
            'perguntas': [
              {
                'id': 'antiga',
                'tipo': 'upload',
                'enunciado': 'Pergunta antiga',
              },
            ],
          },
        },
      ).instalar();
      await tester.pumpWidget(
        MaterialApp(
          home: CadastroPadrinhoPage(dados: _dados(), requisitos: const []),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(mensagemFormularioNaoSuportado), findsOneWidget);
      await _tocar(tester, find.text('Revisar candidatura'));
      expect(api.posts('/cadastro'), isEmpty);
    },
  );

  testWidgets('envio completo abre tela de candidatura enviada', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    expect(find.text('Candidatura enviada!'), findsOneWidget);
    expect(find.text('Agora é só aguardar a análise.'), findsOneWidget);
    expect(find.text('Ir para meu perfil'), findsOneWidget);
    expect(find.text('Cadastro concluído!'), findsNothing);
    expect(SessaoUsuario.atual.participacao, Participacao.padrinho);
    expect(SessaoUsuario.atual.status, StatusParticipacao.padrinhoPendente);
  });

  testWidgets('ir para perfil mostra candidatura em analise', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Revisar candidatura'));
    await _tocar(tester, find.text('Ir para meu perfil'));

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.text('Candidatura recebida'), findsOneWidget);
    expect(find.text('Recebida'), findsOneWidget);
    expect(find.text('Padrinho ativo'), findsNothing);
    expect(find.text('Apadrinhado ativo'), findsNothing);
  });

  testWidgets('lista de requisitos é a do backend (nada fixo no app)', (
    tester,
  ) async {
    api.requisitosPadrinho = [
      {'id': 'fsi', 'descricao': 'Fundamentos de SI', 'obrigatorio': true},
      {'id': 'bd', 'descricao': 'Banco de Dados', 'obrigatorio': false},
    ];
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );
    await tester.pumpAndSettle();

    expect(find.text('Fundamentos de SI'), findsOneWidget);
    expect(find.text('Banco de Dados (desejável)'), findsOneWidget);
    expect(find.textContaining('Cálculo'), findsNothing);
    expect(find.textContaining('AED'), findsNothing);

    // só o obrigatório é exigido; o desejável segue como "não cumpre"
    await _tocar(tester, find.text('Declaro que cumpro: Fundamentos de SI'));
    await _preencherCandidatura(tester, declarar: false);
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    final respostas =
        api.corpo(api.posts('/cadastro').single)['respostas']
            as Map<String, dynamic>;
    expect(respostas['requisitos'], [
      {'id': 'fsi', 'cumpre': true},
      {'id': 'bd', 'cumpre': false},
    ]);
  });

  testWidgets('ciclo sem requisitos de disciplina', (tester) async {
    api.requisitosPadrinho = [];
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Este ciclo não exige disciplinas específicas.'),
      findsOneWidget,
    );
    await _preencherCandidatura(tester, declarar: false);
    await _tocar(tester, find.text('Revisar candidatura'));
    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
  });

  testWidgets('erro de elegibilidade do backend aparece e nada é enviado', (
    tester,
  ) async {
    // tela recebeu uma lista antiga; o backend exige outro requisito
    api.requisitosPadrinho = [
      ...ApiFalsa.requisitosDeTeste(),
      {'id': 'bd', 'descricao': 'Banco de Dados', 'obrigatorio': true},
    ];
    await tester.pumpWidget(
      MaterialApp(
        home: CadastroPadrinhoPage(
          dados: _dados(),
          requisitos: const [_calculo, _aed],
        ),
      ),
    );
    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Revisar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(
      find.textContaining('é preciso cumprir: Banco de Dados'),
      findsOneWidget,
    );
    expect(SessaoUsuario.atual.status, StatusParticipacao.nenhuma);
  });

  testWidgets('layout estreito empilha genero e prouni', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    expect(find.text('Gênero'), findsOneWidget);
    expect(find.text('É bolsista ProUni?'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
