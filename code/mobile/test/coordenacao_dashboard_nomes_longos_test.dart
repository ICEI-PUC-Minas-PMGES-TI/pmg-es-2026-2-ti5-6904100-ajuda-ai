import 'dart:convert';
import 'dart:io';

import 'package:ajuda_ai/coordenacao/tela_dashboard_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// "Candidaturas recentes" com nomes longos e o selo mais longo do sistema.
/// Antes, lado a lado com o selo, o nome quebrava letra por letra no celular.
void main() {
  const nomeLongo = 'Maria Eduarda Albuquerque Vasconcelos';
  const seloLongo = 'Aprovado — aguardando matching';

  final base =
      jsonDecode(File('test/fixtures/coordenacao_dashboard.json').readAsStringSync())
          as Map<String, dynamic>;
  base['candidaturasRecentes'] = [
    {
      'id': 91,
      'nome': nomeLongo,
      'curso': 'Engenharia de Controle e Automação',
      'periodo': 3,
      'iniciais': 'MV',
      'status': 'aprovado',
      'statusRotulo': seloLongo,
    },
    {
      'id': 92,
      'nome': 'Ana Lu',
      'curso': 'Direito',
      'periodo': 2,
      'iniciais': 'AL',
      'status': 'pendente',
      'statusRotulo': 'Nova',
    },
  ];
  final corpo = jsonEncode(base);
  final api = CoordenacaoApi(
    accessToken: 'teste',
    client: MockClient(
      (_) async => http.Response(
        corpo,
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ),
    ),
  );

  for (final escala in [1.0, 1.3]) {
    for (final largura in [320.0, 390.0, 412.0, 800.0]) {
      testWidgets('nome longo legível em ${largura}px, fonte x$escala', (
        tester,
      ) async {
        tester.view.physicalSize = Size(largura, 3200);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MediaQuery(
            data: MediaQueryData(
              size: Size(largura, 3200),
              textScaler: TextScaler.linear(escala),
            ),
            child: MaterialApp(
              home: Scaffold(
                body: TelaDashboardCoord(
                  api: api,
                  programa: '2026/2',
                  onProgramaChanged: (_) {},
                  onVerCandidaturas: ({status, publico}) {},
                  onAbrirDestino: (_, _) {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        final nome = find.text(nomeLongo);
        await tester.ensureVisible(nome);
        await tester.pumpAndSettle();

        // O nome ocupa no máximo duas linhas e tem largura útil de leitura.
        final tamanho = tester.getSize(nome);
        expect(tamanho.width, greaterThan(140));
        expect(tamanho.height, lessThanOrEqualTo(2 * 22 * escala));

        // O selo continua visível, inteiro e dentro da tela.
        final selo = tester.getRect(find.text(seloLongo));
        expect(selo.right, lessThanOrEqualTo(largura));
        expect(selo.width, greaterThan(0));
      });
    }
  }
}
