import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ajuda_ai/coordenacao/resumo_matching.dart';

void main() {
  test(
    'percentuais pequenos preservam evidência positiva e a notação local',
    () {
      expect(percentualMatching(0), '0%');
      expect(percentualMatching(1), '100%');
      expect(percentualMatching(0.5555), '55,55%');
      expect(percentualMatching(0.00001), '<0,01%');
    },
  );
  Widget tela(Widget filho) => MaterialApp(
    home: Scaffold(body: SingleChildScrollView(child: filho)),
  );
  testWidgets('cobertura parcial permanece distinta da afinidade', (
    tester,
  ) async {
    await tester.pumpWidget(
      tela(
        const IndicadoresCompatibilidade(
          explicacao: {
            'politicaVersao': '3.0.0',
            'score': 0.1,
            'cobertura': 0.1,
            'afinidade': 1,
            'pesoConhecido': 10,
            'pesoConfigurado': 100,
            'pesoNeutro': 0,
          },
        ),
      ),
    );
    expect(find.text('Cobertura dos dados: 10%'), findsOneWidget);
    expect(
      find.text('Afinidade entre dados avaliáveis: 100%.'),
      findsOneWidget,
    );
  });
  testWidgets('histórico não recebe cobertura artificial', (tester) async {
    await tester.pumpWidget(
      tela(const IndicadoresCompatibilidade(explicacao: {'score': 1})),
    );
    expect(
      find.textContaining('cobertura dos dados não registrada'),
      findsOneWidget,
    );
    expect(find.textContaining('0%'), findsNothing);
  });
  testWidgets('condição pendente e ocupação projetada são legíveis', (
    tester,
  ) async {
    await tester.pumpWidget(
      tela(
        const IndicadoresCompatibilidade(
          explicacao: {
            'politicaVersao': '3.0.0',
            'viabilidade': 'dados_insuficientes',
            'afinidade': null,
            'cobertura': 0,
            'pesoConhecido': 0,
            'pesoConfigurado': 100,
            'pesoNeutro': 0,
            'distribuicao': {
              'padrinho': {
                'confirmados': 2,
                'sugeridos': 1,
                'totalProjetado': 3,
                'limite': 3,
              },
            },
          },
        ),
      ),
    );
    expect(find.textContaining('Faltam dados para conferir'), findsOneWidget);
    expect(find.textContaining('Sem dados avaliáveis'), findsOneWidget);
    expect(find.textContaining('3/3'), findsOneWidget);
  });
  testWidgets('relatório lista quem ficou sem sugestão e a causa', (
    tester,
  ) async {
    await tester.pumpWidget(
      tela(
        const RelatorioRodadaMatching(
          relatorio: {
            'novosAtendidos': 2,
            'cargaPadrinhos': [
              {
                'nome': 'Ana',
                'confirmados': 2,
                'sugeridos': 1,
                'totalProjetado': 3,
                'limite': 3,
              },
            ],
            'semSugestao': [
              {
                'nome': 'Bia',
                'descricao':
                    'Os padrinhos adequados já atingiram a capacidade.',
                'pendencias': [],
              },
            ],
          },
        ),
      ),
    );
    expect(find.text('Relatório da rodada'), findsOneWidget);
    expect(find.textContaining('Bia · Sem sugestão'), findsOneWidget);
    expect(find.textContaining('atingiram a capacidade'), findsOneWidget);
    expect(find.textContaining('total projetado 3/3'), findsOneWidget);
  });
}
