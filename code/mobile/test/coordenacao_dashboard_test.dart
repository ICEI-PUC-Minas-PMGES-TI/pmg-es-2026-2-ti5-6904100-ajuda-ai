import 'dart:io';

import 'package:ajuda_ai/coordenacao/tela_dashboard_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  // Resposta real de GET /coordenacao/dashboard (seed da API).
  final dashboard = File(
    'test/fixtures/coordenacao_dashboard.json',
  ).readAsStringSync();
  final api = CoordenacaoApi(
    accessToken: 'teste',
    client: MockClient(
      (_) async => http.Response(
        dashboard,
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ),
    ),
  );

  for (final escala in [1.0, 1.3]) {
    for (final largura in [320.0, 360.0, 412.0]) {
      testWidgets('dashboard sem overflow em ${largura}px, fonte x$escala', (
        tester,
      ) async {
        tester.view.physicalSize = Size(largura, 2400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MediaQuery(
            data: MediaQueryData(
              size: Size(largura, 2400),
              textScaler: TextScaler.linear(escala),
            ),
            child: MaterialApp(
              home: Scaffold(
                body: TelaDashboardCoord(
                  api: api,
                  programa: null,
                  onProgramaChanged: (_) {},
                  onVerCandidaturas: ({status}) {},
                  onAbrirDestino: (_, _) {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Candidaturas pendentes'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
