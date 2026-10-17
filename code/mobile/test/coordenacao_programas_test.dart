import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_programas_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> _programa(String codigo) => {
  'id': codigo.hashCode,
  'codigo': codigo,
  'titulo': 'Programa $codigo',
  'etapaAtual': 'analise',
  'statusRotulo': 'Em análise',
  'vigente': codigo == '2026/2',
  'inscricoesAbertas': false,
  'formularioPublicado': true,
  'matchingPendente': false,
  'vagasApadrinhados': 80,
  'gruposPrevistos': 25,
  'requisitosPadrinho': const [],
  'etapas': const [],
  'datas': const {},
  'totais': const {},
};

void main() {
  group('sugestoesDeCiclo', () {
    test('em janeiro de 2027 sugere 2027/1 primeiro (vigente pela data)', () {
      final janeiro = DateTime(2027, 1, 2);
      expect(codigoCicloDaData(janeiro), '2027/1');
      expect(sugestoesDeCiclo(['2026/2'], janeiro), [
        '2027/1',
        '2027/2',
        '2028/1',
      ]);
    });

    test('não sugere ciclos que já existem', () {
      final outubro = DateTime(2026, 10, 13);
      expect(sugestoesDeCiclo(['2026/2', '2027/1'], outubro), ['2027/2']);
    });
  });

  group('Abrir novo ciclo', () {
    late List<http.Request> pedidos;
    late List<Map<String, dynamic>> programas;

    Widget app() {
      final client = MockClient((r) async {
        pedidos.add(r);
        if (r.method == 'POST' && r.url.path == '/coordenacao/programas') {
          final codigo = (jsonDecode(r.body) as Map)['codigo'] as String;
          programas.insert(0, _programa(codigo));
          return http.Response(
            jsonEncode(_programa(codigo)),
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode(programas),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      return MaterialApp(
        home: TelaProgramasCoord(
          api: CoordenacaoApi(accessToken: 't', client: client, baseUrl: ''),
        ),
      );
    }

    setUp(() {
      pedidos = [];
      programas = [_programa('2026/2')];
    });

    Future<void> abrirDialogo(WidgetTester tester) async {
      tester.view.physicalSize = const Size(412, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Abrir novo ciclo'));
      await tester.pumpAndSettle();
    }

    testWidgets('cria explicitamente o ciclo informado (ex.: 2027/1)', (
      tester,
    ) async {
      await abrirDialogo(tester);
      expect(find.text('Código do ciclo'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '2027/1');
      await tester.tap(find.text('Abrir ciclo'));
      await tester.pumpAndSettle();

      final envio = pedidos.firstWhere((r) => r.method == 'POST');
      expect(jsonDecode(envio.body), {'codigo': '2027/1'});
      expect(find.text('Programa 2027/1'), findsOneWidget);
    });

    testWidgets('código inválido ou já existente não é enviado', (
      tester,
    ) async {
      await abrirDialogo(tester);

      await tester.enterText(find.byType(TextField), '2027/3');
      await tester.tap(find.text('Abrir ciclo'));
      await tester.pumpAndSettle();
      expect(
        find.text('Use o formato AAAA/1 ou AAAA/2 (ex.: 2027/1).'),
        findsOneWidget,
      );

      await tester.enterText(find.byType(TextField), '2026/2');
      await tester.tap(find.text('Abrir ciclo'));
      await tester.pumpAndSettle();
      expect(find.text('O ciclo 2026/2 já existe.'), findsOneWidget);
      expect(pedidos.where((r) => r.method == 'POST'), isEmpty);
    });
  });
}
