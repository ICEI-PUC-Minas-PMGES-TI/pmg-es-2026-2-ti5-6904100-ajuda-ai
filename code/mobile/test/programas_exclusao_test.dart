import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_programas_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  for (final bloqueado in [false, true]) {
    testWidgets(
      'confirmação e exclusão ${bloqueado ? 'bloqueada' : 'permitida'} pelo servidor',
      (tester) async {
        tester.view.physicalSize = const Size(600, 1600);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        var programas = [
          {'codigo': '2026/2', 'titulo': 'Programa 2026/2'},
        ];
        final pedidos = <http.Request>[];
        final client = MockClient((r) async {
          pedidos.add(r);
          Object corpo = programas;
          var status = 200;
          if (r.method == 'DELETE') {
            if (bloqueado) {
              status = 409;
              corpo = {
                'message': 'Não é possível excluir: candidaturas: 1. Encerre o programa em vez de excluir.',
              };
            } else {
              programas = [];
              corpo = {'codigo': '2026/2', 'excluido': true};
            }
          }
          return http.Response(
            jsonEncode(corpo),
            status,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        });
        await tester.pumpWidget(
          MaterialApp(
            home: TelaProgramasCoord(
              api: CoordenacaoApi(
                accessToken: 'jwt',
                client: client,
                baseUrl: 'http://localhost',
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Mais ações do programa'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Excluir programa'));
        await tester.pumpAndSettle();
        expect(find.text('Excluir programa 2026/2?'), findsOneWidget);
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Excluir definitivamente'),
              )
              .onPressed,
          isNull,
        );
        await tester.enterText(find.byType(TextField), 'SIM');
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Excluir definitivamente'),
              )
              .onPressed,
          isNull,
        );
        expect(pedidos.where((r) => r.method == 'DELETE'), isEmpty);
        await tester.enterText(find.byType(TextField), 'coordenador');
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Excluir definitivamente'),
              )
              .onPressed,
          isNull,
        );
        await tester.enterText(find.byType(TextField), 'COORDENADOR');
        await tester.pumpAndSettle();
        await tester.tap(find.text('Excluir definitivamente'));
        await tester.pumpAndSettle();
        final delete = pedidos.singleWhere((r) => r.method == 'DELETE');
        expect(delete.url.queryParameters['codigo'], '2026/2');
        expect(jsonDecode(delete.body), {'confirmacao': 'COORDENADOR'});
        if (bloqueado) {
          expect(find.textContaining('candidaturas: 1'), findsOneWidget);
          expect(programas, hasLength(1));
          expect(find.text('Excluir programa 2026/2?'), findsOneWidget);
        } else {
          expect(programas, isEmpty);
          expect(find.text('Excluir programa 2026/2?'), findsNothing);
          expect(pedidos.where((r) => r.method == 'GET'), hasLength(2));
        }
      },
    );
  }
}
