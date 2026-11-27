import 'dart:async';

import 'package:ajuda_ai/models/situacao_participacao.dart';
import 'package:ajuda_ai/widgets/vinculos_participante.dart';
import 'package:ajuda_ai/widgets/revalidar_participacao.dart';
import 'package:ajuda_ai/coordenacao/resumo_matching.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> get dados => {
  'situacao': 'apadrinhado_ativo',
  'podeConversar': true,
  'padrinhos': [
    {
      'nome': 'Ana',
      'email': 'ana@pucminas.edu.br',
      'vinculoId': 21,
      'grupoId': 41,
      'grupo': 'Grupo Ana',
    },
    {
      'nome': 'Bia',
      'email': 'bia@pucminas.edu.br',
      'vinculoId': 22,
      'grupoId': 42,
      'grupo': 'Grupo Bia',
    },
  ],
};
void main() {
  test('modelo conserva todos os padrinhos e os IDs de vínculo/grupo', () {
    final s = SituacaoParticipacao.fromJson(dados);
    expect(s.padrinhosAtuais.map((p) => p.vinculoId), [21, 22]);
    expect(s.padrinhosAtuais.map((p) => p.grupoId), [41, 42]);
    expect(s.padrinho!.nome, 'Ana');
  });
  test('lista explícita vazia não recupera padrinho singular antigo', () {
    final s = SituacaoParticipacao.fromJson({
      ...dados,
      'padrinhos': [],
      'padrinho': {'nome': 'Antigo'},
    });
    expect(s.padrinhosAtuais, isEmpty);
    expect(s.padrinho, isNull);
  });
  test('contrato antigo singular é aceito sem inventar um segundo vínculo', () {
    final s = SituacaoParticipacao.fromJson({
      'situacao': 'apadrinhado_ativo',
      'padrinho': {'nome': 'Ana'},
    });
    expect(s.padrinhosAtuais, hasLength(1));
    expect(s.padrinhosAtuais.first.vinculoId, isNull);
  });
  testWidgets('duas pessoas aparecem e cada atalho usa seu vínculo e grupo', (
    tester,
  ) async {
    int? privado, grupo;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: VinculosParticipante(
              dados: SituacaoParticipacao.fromJson(dados),
              onPrivado: (p) => privado = p.vinculoId,
              onGrupo: (p) => grupo = p.grupoId,
              onAtualizar: () {},
            ),
          ),
        ),
      ),
    );
    expect(find.text('Meus padrinhos'), findsOneWidget);
    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('Bia'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Conversar').last);
    expect(privado, 22);
    await tester.tap(
      find.widgetWithText(TextButton, 'Conversa do grupo').first,
    );
    expect(grupo, 41);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'encerramento não anuncia novo vínculo e conserva atalho ao histórico',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: VinculosParticipante(
              dados: SituacaoParticipacao.fromJson({
                ...dados,
                'situacao': 'concluido',
                'podeConversar': false,
              }),
              onPrivado: (_) => fail('Não pode enviar'),
              onGrupo: (_) => fail('Não pode enviar'),
              onAtualizar: () {},
              onHistorico: () {},
            ),
          ),
        ),
      );
      expect(find.textContaining('Participação encerrada'), findsOneWidget);
      expect(find.text('Ana'), findsNothing);
      expect(find.text('Ver conversas e histórico'), findsOneWidget);
    },
  );
  testWidgets(
    'permissão pausada desabilita envio sem apagar a identidade do vínculo',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: VinculosParticipante(
                dados: SituacaoParticipacao.fromJson({
                  ...dados,
                  'podeConversar': false,
                }),
                onPrivado: (_) => fail('Não pode enviar'),
                onGrupo: (_) => fail('Não pode enviar'),
                onAtualizar: () {},
              ),
            ),
          ),
        ),
      );
      expect(find.text('Ana'), findsOneWidget);
      for (final b in tester.widgetList<OutlinedButton>(
        find.byType(OutlinedButton),
      )) {
        expect(b.onPressed, isNull);
      }
    },
  );
  testWidgets(
    'revalidação conserva rascunho sem reconstruir a tela como carregamento',
    (tester) async {
      var chamadas = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: RevalidarParticipacao(
            atualizar: () async {
              chamadas++;
              return true;
            },
            child: const Scaffold(body: TextField()),
          ),
        ),
      );
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'Rascunho em andamento');
      await tester.pump(const Duration(seconds: 10));
      expect(chamadas, 2);
      expect(find.text('Rascunho em andamento'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('revalidação lenta não abre outra consulta e para ao descartar', (
    tester,
  ) async {
    var chamadas = 0;
    final resposta = Completer<Object?>();
    await tester.pumpWidget(
      MaterialApp(
        home: RevalidarParticipacao(
          atualizar: () {
            chamadas++;
            return resposta.future;
          },
          child: const SizedBox(),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 30));
    expect(chamadas, 1);
    await tester.pumpWidget(const SizedBox.shrink());
    resposta.complete(true);
    await tester.pump(const Duration(seconds: 20));
    expect(chamadas, 1);
  });
  testWidgets(
    'consulta de fundo pausa e revalida ao retornar ao primeiro plano',
    (tester) async {
      var chamadas = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: RevalidarParticipacao(
            atualizar: () async {
              chamadas++;
              return true;
            },
            child: const SizedBox(),
          ),
        ),
      );
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 20));
      expect(chamadas, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(chamadas, 2);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'diagnóstico se mantém legível em largura mobile e mostra pendências',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: DiagnosticoDadosMatching(
                dados: {
                  'criterios': [
                    {
                      'nome': 'Áreas de apoio',
                      'obrigatorio': true,
                      'padrinhos': {'conhecidos': 1, 'total': 2},
                      'apadrinhados': {'conhecidos': 3, 'total': 3},
                    },
                  ],
                  'pendencias': [
                    {
                      'nome': 'Ana',
                      'papel': 'padrinho',
                      'campos': ['Áreas de apoio'],
                      'obrigatorio': true,
                    },
                  ],
                },
              ),
            ),
          ),
        ),
      );
      expect(find.text('Dados antes da execução'), findsOneWidget);
      await tester.tap(find.text('1 participante(s) com dados pendentes'));
      await tester.pumpAndSettle();
      expect(find.text('Ana (padrinho)'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
