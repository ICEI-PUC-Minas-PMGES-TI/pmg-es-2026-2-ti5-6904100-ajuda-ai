import 'dart:convert';

import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/tela_historico.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('histórico vazio mostra mensagem adequada', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HistoricoParticipacaoPage(ciclos: []),
      ),
    );

    expect(
      find.textContaining('ainda não possui participações'),
      findsOneWidget,
    );
    expect(find.text('Programa 2026/2'), findsNothing);
  });

  testWidgets('primeira participação aparece uma única vez', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HistoricoParticipacaoPage(
          ciclos: [
            CicloParticipacao(
              semestre: '2026/2',
              papel: PapelCiclo.padrinho,
              status: StatusCiclo.emAndamento,
              grupo: 'Grupo 08',
              apadrinhados: 2,
            ),
          ],
        ),
      ),
    );

    expect(find.text('Programa 2026/2'), findsOneWidget);
    expect(find.text('Padrinho'), findsOneWidget);
    expect(find.text('Em andamento'), findsOneWidget);
    expect(
      find.text('Essa é sua primeira participação no programa.'),
      findsOneWidget,
    );
    expect(find.text('IMPACTO TOTAL'), findsNothing);
  });

  testWidgets('várias participações aparecem da mais recente à mais antiga', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HistoricoParticipacaoPage(
          ciclos: [
            CicloParticipacao(
              semestre: '2026/1',
              papel: PapelCiclo.apadrinhado,
              status: StatusCiclo.concluido,
            ),
            CicloParticipacao(
              semestre: '2027/1',
              papel: PapelCiclo.padrinho,
              status: StatusCiclo.emAndamento,
            ),
            CicloParticipacao(
              semestre: '2026/2',
              papel: PapelCiclo.padrinho,
              status: StatusCiclo.concluido,
            ),
          ],
        ),
      ),
    );

    final recente = tester.getTopLeft(find.text('Programa 2027/1'));
    final meio = tester.getTopLeft(find.text('Programa 2026/2'));
    final antiga = tester.getTopLeft(find.text('Programa 2026/1'));
    expect(recente.dy < meio.dy, isTrue);
    expect(meio.dy < antiga.dy, isTrue);
  });

  testWidgets('perfil abre histórico sem inventar participações', (tester) async {
    final client = MockClient((request) async {
      if (request.method == 'GET') {
        return http.Response(jsonEncode([]), 200);
      }
      return http.Response('{}', 404);
    });
    SessaoUsuario.atual.configurarApi(ParticipacoesApi(client: client));

    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
    await tester.scrollUntilVisible(
      find.text('Histórico de participação'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Histórico de participação'));
    await tester.pumpAndSettle();

    expect(find.byType(HistoricoParticipacaoPage), findsOneWidget);
    expect(
      find.textContaining('ainda não possui participações'),
      findsOneWidget,
    );
  });

  testWidgets('layout estreito não estoura', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: HistoricoParticipacaoPage(
          ciclos: [
            CicloParticipacao(
              semestre: '2026/2',
              papel: PapelCiclo.candidato,
              status: StatusCiclo.emAnalise,
            ),
          ],
        ),
      ),
    );

    expect(find.text('Em análise'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
