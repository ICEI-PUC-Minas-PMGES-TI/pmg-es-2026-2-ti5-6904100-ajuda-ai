import 'package:ajuda_ai/tela_resgates.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void telaAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Map<String, dynamic> resgate([Map<String, dynamic> extra = const {}]) => {
  'id': 'r1',
  'codigo': 'A1B2C3D4E5',
  'nome': 'Caneca',
  'custoXp': 30,
  'saldoApos': 70,
  'condicoesRetirada': 'Retirar na coordenação.',
  'criadoEm': '2026-11-03T12:00:00.000Z',
  ...extra,
};

void main() {
  test('situação: campo ausente conta como aguardando', () {
    expect(situacaoDoResgate(resgate()), 'aguardando_entrega');
    expect(situacaoDoResgate(resgate({'situacao': 'entregue'})), 'entregue');
    expect(situacaoDoResgate(resgate({'situacao': 'cancelado'})), 'cancelado');
    expect(situacaoDoResgate(resgate({'situacao': 'outra'})), 'aguardando_entrega');
  });

  testWidgets('comprovante aguardando pede o código na retirada', (
    tester,
  ) async {
    telaAlta(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: TelaComprovante(
          resgate: resgate({'situacao': 'aguardando_entrega'}),
        ),
      ),
    );
    expect(find.text('Aguardando retirada'), findsOneWidget);
    expect(find.text('Apresente este código na retirada.'), findsOneWidget);
  });

  testWidgets('comprovante entregue mostra a data e some o aviso', (
    tester,
  ) async {
    telaAlta(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: TelaComprovante(
          resgate: resgate({
            'situacao': 'entregue',
            'entregueEm': '2026-11-05T15:00:00.000Z',
          }),
        ),
      ),
    );
    expect(find.text('Recompensa entregue'), findsOneWidget);
    expect(find.text('Apresente este código na retirada.'), findsNothing);
  });

  testWidgets('comprovante cancelado mostra o motivo e a devolução', (
    tester,
  ) async {
    telaAlta(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: TelaComprovante(
          resgate: resgate({
            'situacao': 'cancelado',
            'canceladoEm': '2026-11-05T15:00:00.000Z',
            'motivoCancelamento': 'Recompensa danificada',
          }),
        ),
      ),
    );
    expect(find.text('Resgate cancelado'), findsOneWidget);
    expect(find.text('Motivo: Recompensa danificada'), findsOneWidget);
    expect(find.textContaining('As moedas voltaram'), findsOneWidget);
    expect(find.text('Apresente este código na retirada.'), findsNothing);
  });

  testWidgets('logo após a troca continua o sucesso', (tester) async {
    telaAlta(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: TelaComprovante(resgate: resgate({'saldoAtual': 70})),
      ),
    );
    expect(find.text('Resgate realizado com sucesso!'), findsOneWidget);
  });
}
