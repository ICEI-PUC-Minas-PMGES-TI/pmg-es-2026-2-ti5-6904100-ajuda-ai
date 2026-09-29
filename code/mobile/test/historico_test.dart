import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ajuda_ai/tela_historico.dart';

void main() {
  testWidgets('resumo é calculado a partir dos ciclos', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: HistoricoParticipacaoPage()),
    );

    await tester.scrollUntilVisible(find.text('IMPACTO TOTAL'), 200);
    expect(
      find.text('Você já apoiou 5 apadrinhados em 2 semestres como padrinho.'),
      findsOneWidget,
    );
    expect(find.text('Apadrinhado → Padrinho'), findsOneWidget);
    expect(find.text('Não aprovado'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('quem só foi apadrinhado não vê o impacto', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HistoricoParticipacaoPage(
          ciclos: [
            CicloParticipacao(
              semestre: '2026/2',
              papel: PapelCiclo.apadrinhado,
              status: StatusCiclo.emAndamento,
              titulo: 'Apadrinhado',
              descricao: 'Você está participando neste semestre.',
            ),
          ],
        ),
      ),
    );

    expect(find.text('IMPACTO TOTAL'), findsNothing);
    expect(find.text('Apadrinhado'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
