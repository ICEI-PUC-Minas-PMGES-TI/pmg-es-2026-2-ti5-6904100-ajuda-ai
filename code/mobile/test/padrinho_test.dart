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

Future<void> _marcarDeclaracao(WidgetTester tester) =>
    _tocar(tester, find.text(CadastroPadrinhoPage.textoDeclaracao));

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

  setUp(() => api = ApiFalsa().instalar());
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('participacao abre candidatura de padrinho', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: ParticipacaoPage(dados: _dados())),
    );

    await tester.tap(find.text('Quero ser padrinho'));
    await tester.pumpAndSettle();
    await _tocar(tester, find.text('Continuar'));

    expect(find.byType(CadastroPadrinhoPage), findsOneWidget);
    expect(find.text('Candidatura de padrinho'), findsOneWidget);
    expect(find.text('Pré-requisitos para ser padrinho'), findsOneWidget);
    expect(find.text('Passo 2 de 3'), findsOneWidget);
    expect(find.text(CadastroPadrinhoPage.textoDeclaracao), findsOneWidget);
    expect(find.text('Enviar candidatura'), findsOneWidget);
  });

  testWidgets('validacao destaca campos obrigatorios', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _tocar(tester, find.text('Enviar candidatura'));

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
      find.text(
        'Confirme que você cumpre os pré-requisitos para ser padrinho.',
      ),
      findsOneWidget,
    );
    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(api.posts('/candidatura-padrinho'), isEmpty);
  });

  testWidgets('declaração de AEDS 1 e Cálculo 1 é obrigatória', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester, declarar: false);
    await _tocar(tester, find.text('Enviar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(
      find.text(
        'Confirme que você cumpre os pré-requisitos para ser padrinho.',
      ),
      findsOneWidget,
    );
    expect(api.posts('/candidatura-padrinho'), isEmpty);

    await _marcarDeclaracao(tester);
    await _tocar(tester, find.text('Enviar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    final envio = api.posts('/candidatura-padrinho').single;
    expect(envio.headers['x-user-id'], 'camila@pucminas.edu.br');
    final corpo = api.corpo(envio);
    expect(corpo['usuarioId'], 'camila@pucminas.edu.br');
    final respostas = corpo['respostas'] as Map<String, dynamic>;
    expect(respostas['declaraPreRequisitos'], isTrue);
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
    await _tocar(tester, find.text('Enviar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsNothing);
    expect(find.textContaining('Inscrições encerradas.'), findsOneWidget);
    expect(find.text('Tentar novamente'), findsOneWidget);
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
            PerguntaFormulario(
              id: 'portfolio',
              enunciado: 'Portfólio',
              tipo: TipoPergunta.upload,
              obrigatoria: true,
            ),
          ],
        ),
      ),
    );

    expect(find.text('Perguntas adicionais'), findsOneWidget);
    expect(find.text('Envio de arquivo em breve'), findsOneWidget);

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Enviar candidatura'));
    expect(find.text('Responda esta pergunta para continuar.'), findsOneWidget);
    expect(api.posts('/candidatura-padrinho'), isEmpty);

    await _escolher<String>(tester, 'Selecione uma opção', 'Professores');
    await _tocar(tester, find.text('Enviar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    final respostas =
        api.corpo(api.posts('/candidatura-padrinho').single)['respostas']
            as Map<String, dynamic>;
    expect(respostas['extras'], {'como-conheceu': 'Professores'});
  });

  testWidgets('envio completo abre tela de candidatura enviada', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Enviar candidatura'));

    expect(find.byType(CandidaturaEnviadaPage), findsOneWidget);
    expect(find.text('Candidatura enviada!'), findsOneWidget);
    expect(find.text('Agora é só aguardar a análise.'), findsOneWidget);
    expect(find.text('Ir para meu perfil'), findsOneWidget);
    expect(find.text('Cadastro concluído!'), findsNothing);
    expect(SessaoUsuario.atual.participacao, Participacao.padrinho);
    expect(SessaoUsuario.atual.status, StatusParticipacao.padrinhoEmAnalise);
  });

  testWidgets('ir para perfil mostra candidatura em analise', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: CadastroPadrinhoPage(dados: _dados())),
    );

    await _preencherCandidatura(tester);
    await _tocar(tester, find.text('Enviar candidatura'));
    await _tocar(tester, find.text('Ir para meu perfil'));

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.text('Candidatura de padrinho'), findsOneWidget);
    expect(find.text('Em análise'), findsOneWidget);
    expect(find.text('Padrinho ativo'), findsNothing);
    expect(find.text('Apadrinhado ativo'), findsNothing);
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
