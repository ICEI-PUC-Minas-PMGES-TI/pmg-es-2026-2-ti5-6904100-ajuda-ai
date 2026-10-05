import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_cadastro_padrinho.dart';
import 'package:ajuda_ai/tela_candidatura_enviada.dart';
import 'package:ajuda_ai/tela_padrinho_definido.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:ajuda_ai/tela_status_candidatura.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/api_falsa.dart';

const _ana = DadosCadastro(
  nome: 'Ana Beatriz Costa',
  email: 'ana.beatriz@pucminas.edu.br',
  curso: 'Ciência da Computação',
  periodo: 5,
  turno: 'Noite',
);

Map<String, dynamic> _emAnalise() => {
  'usuarioId': 'ana.beatriz@pucminas.edu.br',
  'programa': {
    'codigo': '2026/2',
    'titulo': 'Programa 2026/2',
    'etapaAtual': 'analise',
    'statusRotulo': 'Em análise',
    'inscricoesAbertas': false,
    'etapas': [
      {
        'id': 'analise',
        'titulo': 'Análise de candidaturas',
        'estado': 'atual',
        'periodoTexto': '01 set. de 2026 a 30 set. de 2026',
      },
    ],
  },
  'situacao': 'candidatura_em_analise',
  'registro': {
    'id': 1,
    'programa': '2026/2',
    'papel': 'candidato',
    'status': 'em_analise',
    'criadoEm': '2026-09-22T14:32:00.000',
    'respostas': {
      'motivacao': 'Quero contribuir com a adaptação dos novos alunos.',
      'experiencias': 'Monitoria de AEDS I.',
      'areas': ['Tecnologia'],
      'disponibilidade': ['Manhã', 'Tarde'],
      'genero': 'Feminino',
      'bolsistaProuni': false,
      'deOutraCidade': true,
      'declaraPreRequisitos': true,
    },
  },
  'grupo': null,
  'padrinho': null,
  'apadrinhados': const [],
};

void _telaGrande(WidgetTester tester) {
  tester.view.physicalSize = const Size(412, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  late ApiFalsa api;

  setUp(() => api = ApiFalsa().instalar());
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('timeline da candidatura em análise', (tester) async {
    _telaGrande(tester);
    api.situacao = _emAnalise();
    SessaoUsuario.atual.definir(
      dadosCadastro: _ana,
      escolha: Participacao.padrinho,
    );

    await tester.pumpWidget(const MaterialApp(home: StatusCandidaturaPage()));
    await tester.pumpAndSettle();

    expect(find.text('Status da candidatura'), findsOneWidget);
    expect(find.text('Candidatura enviada'), findsOneWidget);
    expect(find.text('22 de set. de 2026 • 14:32'), findsOneWidget);
    expect(
      find.text('Nossa equipe está analisando suas informações.'),
      findsOneWidget,
    );
    expect(find.text('Resultado'), findsOneWidget);
    expect(find.text('Início das atividades'), findsOneWidget);
    expect(find.textContaining('01 set. de 2026 a 30 set.'), findsOneWidget);
    expect(find.text('Dúvidas?'), findsOneWidget);
    expect(find.text('Editar candidatura'), findsOneWidget);
  });

  testWidgets('editar candidatura reabre o formulário preenchido e reenvia', (
    tester,
  ) async {
    _telaGrande(tester);
    api.situacao = _emAnalise();
    SessaoUsuario.atual.definir(
      dadosCadastro: _ana,
      escolha: Participacao.padrinho,
    );

    await tester.pumpWidget(const MaterialApp(home: StatusCandidaturaPage()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Editar candidatura'));
    await tester.pumpAndSettle();

    expect(find.byType(CadastroPadrinhoPage), findsOneWidget);
    expect(
      find.text('Quero contribuir com a adaptação dos novos alunos.'),
      findsOneWidget,
    );
    expect(find.text('Monitoria de AEDS I.'), findsOneWidget);
    expect(tester.widget<Checkbox>(find.byType(Checkbox).first).value, isTrue);

    await tester.enterText(
      find.byType(TextField).first,
      'Motivação atualizada.',
    );
    await tester.scrollUntilVisible(
      find.text('Salvar alterações'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Salvar alterações'));
    await tester.pumpAndSettle();

    expect(find.byType(StatusCandidaturaPage), findsOneWidget);
    expect(find.text('Candidatura atualizada com sucesso.'), findsOneWidget);
    final respostas =
        api.corpo(api.posts('/candidatura-padrinho').single)['respostas']
            as Map<String, dynamic>;
    expect(respostas['motivacao'], 'Motivação atualizada.');
    expect(respostas['disponibilidade'], ['Manhã', 'Tarde']);
    expect(respostas['declaraPreRequisitos'], isTrue);
  });

  testWidgets('candidatura enviada leva ao status', (tester) async {
    _telaGrande(tester);
    SessaoUsuario.atual.definir(
      dadosCadastro: _ana,
      escolha: Participacao.padrinho,
    );

    await tester.pumpWidget(const MaterialApp(home: CandidaturaEnviadaPage()));
    await tester.tap(find.text('Acompanhar status da candidatura'));
    await tester.pumpAndSettle();

    expect(find.byType(StatusCandidaturaPage), findsOneWidget);
    // Sem backend, usa o estado local (em análise).
    expect(
      find.text('Nossa equipe está analisando suas informações.'),
      findsOneWidget,
    );
  });

  testWidgets('padrinho definido sem padrinho mostra estado de espera', (
    tester,
  ) async {
    api.situacao = {
      'usuarioId': 'lucas.almeida@pucminas.edu.br',
      'situacao': 'apadrinhado_aguardando',
      'registro': null,
      'grupo': null,
      'padrinho': null,
      'apadrinhados': const [],
    };
    SessaoUsuario.atual.definir(
      dadosCadastro: _ana.copyWith(
        email: 'lucas.almeida@pucminas.edu.br',
        periodo: 1,
      ),
      escolha: Participacao.apadrinhado,
    );

    await tester.pumpWidget(const MaterialApp(home: PadrinhoDefinidoPage()));
    await tester.pumpAndSettle();

    expect(find.text('Seu padrinho ainda não foi definido'), findsOneWidget);
    expect(find.textContaining('formando os grupos'), findsOneWidget);
    expect(find.text('Seu padrinho foi definido!'), findsNothing);
  });
}
