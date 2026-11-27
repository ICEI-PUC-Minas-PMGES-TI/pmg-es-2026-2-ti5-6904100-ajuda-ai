import 'dart:convert';

import 'package:ajuda_ai/coordenacao/configurar_programa.dart';
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
      await tester.tap(find.text('Abrir novo ciclo'));
      await tester.pumpAndSettle();
    }

    testWidgets('cria explicitamente o ciclo informado (ex.: 2027/1)', (
      tester,
    ) async {
      await abrirDialogo(tester);
      expect(find.text('Código do ciclo'), findsOneWidget);

      await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        '2027/1',
      );
      await tester.tap(find.text('Revisar cronograma'));
      await tester.pumpAndSettle();
      expect(find.text('01/02/2027'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Confirmar criação'),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Confirmar criação'));
      await tester.pumpAndSettle();

      final envio = pedidos.firstWhere((r) => r.method == 'POST');
      final corpo = jsonDecode(envio.body) as Map;
      expect(corpo['codigo'], '2027/1');
      expect(corpo['inscricoesInicio'], '2027-02-01');
      expect(corpo['encerramentoEm'], '2027-06-20');
      expect(find.text('Programa 2027/1'), findsOneWidget);
    });

    testWidgets('código inválido ou já existente não é enviado', (
      tester,
    ) async {
      await abrirDialogo(tester);

      await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        '2027/3',
      );
      await tester.tap(find.text('Revisar cronograma'));
      await tester.pumpAndSettle();
      expect(
        find.text('Use o formato AAAA/1 ou AAAA/2 (ex.: 2027/1).'),
        findsOneWidget,
      );

      await tester.enterText(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        ),
        '2026/2',
      );
      await tester.tap(find.text('Revisar cronograma'));
      await tester.pumpAndSettle();
      expect(find.text('O ciclo 2026/2 já existe.'), findsOneWidget);
      expect(pedidos.where((r) => r.method == 'POST'), isEmpty);
    });

    testWidgets('impede cronograma fora de ordem e edita requisito do ciclo', (
      tester,
    ) async {
      programas = [
        {
          ..._programa('2026/2'),
          'datas': sugestaoCronograma('2026/2'),
          'requisitosPadrinho': [
            {'id': 'calculo', 'descricao': 'Cálculo I', 'obrigatorio': true},
          ],
        },
        {
          ..._programa('2026/1'),
          'requisitosPadrinho': [
            {
              'id': 'antigo',
              'descricao': 'Requisito antigo',
              'obrigatorio': true,
            },
          ],
        },
      ];
      await abrirDialogo(tester);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(
        validarCronogramaPrograma({
          'inscricoesInicio': '2026-03-10',
          'inscricoesFim': '2026-03-01',
        }),
        contains('Ordem do cronograma inválida'),
      );

      await tester.tap(find.text('Configurar').first);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('inscricoesFim')),
        '2026-08-20',
      );
      await tester.tap(find.byTooltip('Remover requisito'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Adicionar requisito'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).last, 'AED I');
      await tester.scrollUntilVisible(
        find.text('Salvar programa'),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Salvar programa'));
      await tester.pumpAndSettle();

      final envio = pedidos.singleWhere((r) => r.method == 'PATCH');
      expect(envio.url.queryParameters['codigo'], '2026/2');
      final corpo = jsonDecode(envio.body) as Map;
      expect(corpo['inscricoesFim'], '2026-08-20');
      expect(corpo['requisitosPadrinho'], [
        {'descricao': 'AED I', 'obrigatorio': true},
      ]);
      expect(
        pedidos.where(
          (r) =>
              r.url.queryParameters['codigo'] == '2026/1' &&
              r.method == 'PATCH',
        ),
        isEmpty,
      );
    });
  });
}
