import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:ajuda_ai/coordenacao/tela_matching_coord.dart';
import 'package:ajuda_ai/coordenacao/tela_programas_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:ajuda_ai/theme/colors.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object valor) => http.Response(
  jsonEncode(valor),
  200,
  headers: {'content-type': 'application/json'},
);

Future<void> _capturar(WidgetTester tester, GlobalKey key, String nome) async {
  if (!const bool.fromEnvironment('CAPTURAR_LAYOUT')) return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final imagem = await boundary.toImage();
    final bytes = await imagem.toByteData(format: ui.ImageByteFormat.png);
    await File('.dart_tool/layout-$nome.png')
        .writeAsBytes(bytes!.buffer.asUint8List());
    imagem.dispose();
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter-Variable.ttf'))).load();
    await (FontLoader(
      'Poppins',
    )..addFont(rootBundle.load('assets/fonts/Poppins-ExtraBold.ttf'))).load();
  });

  testWidgets(
    'matching separa gestão de pares e mantém ações do editor acessíveis em tela pequena',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final consultas = <String>[];
      final api = CoordenacaoApi(
        accessToken: 'teste',
        baseUrl: '',
        client: MockClient((pedido) async {
          consultas.add(pedido.url.path);
          if (pedido.url.path == '/coordenacao/matching') {
            return _json({
              'podeExecutar': false,
              'bloqueios': [
                'O matching ainda não foi liberado pela coordenação.',
              ],
              'totais': {
                'padrinhosElegiveis': 2,
                'apadrinhadosElegiveis': 2,
                'pessoasSemVinculo': 2,
              },
              'configuracao': {
                'versao': 1,
                'capacidadePorPadrinho': 3,
                'capacidadePorApadrinhado': 1,
                'criterios': [
                  {
                    'campoCadastro': 'areas',
                    'operacao': 'intersecao',
                    'peso': 10,
                  },
                ],
              },
              'criteriosCadastroDisponiveis': [
                for (final fonte in [
                  ('areas', 'Áreas de apoio'),
                  ('disponibilidade', 'Disponibilidade'),
                  ('interesses', 'Interesses'),
                  ('preferenciaGenero', 'Preferência de gênero'),
                ])
                  {
                    'campo': fonte.$1,
                    'nome': fonte.$2,
                    'operacao': 'intersecao',
                    'permiteObrigatorio': fonte.$1 == 'areas',
                  },
              ],
              'criteriosDisponiveis': [],
            });
          }
          if (pedido.url.path.endsWith('/grupos')) {
            return _json({'grupos': [], 'inconsistencias': []});
          }
          return _json([]);
        }),
      );
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              fontFamily: 'Inter',
              colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
            ),
            home: TelaMatchingCoord(api: api, programa: '2026/2'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(consultas.any((p) => p.endsWith('/grupos')), isFalse);
      await _capturar(tester, key, 'matching');
      await tester.tap(find.text('Grupos e transferências'));
      await tester.pumpAndSettle();
      expect(consultas.any((p) => p.endsWith('/grupos')), isTrue);
      expect(find.text('Sugestões de matching'), findsNothing);
      await tester.tap(find.text('Visão geral'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Editar configuração'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Editar configuração'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Editar configuração'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final salvar = tester.getRect(find.text('Salvar configuração'));
      expect(salvar.bottom, lessThanOrEqualTo(844));
      await _capturar(tester, key, 'configuracao-matching');
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(
        tester.getRect(find.text('Salvar configuração')).bottom,
        lessThanOrEqualTo(564),
      );
      tester.view.viewInsets = FakeViewPadding.zero;
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'programas filtra ciclos e administra somente o ciclo escolhido em tela pequena',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      String? administrado;
      final programas = [
        for (final codigo in ['2027/1', '2026/2', '2026/1'])
          {
            'codigo': codigo,
            'nome': 'Programa $codigo',
            'etapaAtual': codigo == '2026/1' ? 'encerramento' : 'analise',
            'vigente': codigo == '2026/2',
            'statusRotulo': codigo == '2026/1' ? 'Encerrado' : 'Em análise',
            'totais': {
              'candidaturas': 3,
              'padrinhos': 1,
              'apadrinhados': 3,
              'grupos': 1,
            },
            'vagasApadrinhados': 80,
            'gruposPrevistos': 25,
            'etapas': [
              for (final etapa in [
                ('Inscrições abertas', 'concluida'),
                ('Análise de candidaturas', 'atual'),
                ('Formação dos grupos', 'futura'),
              ])
                {
                  'titulo': etapa.$1,
                  'estado': etapa.$2,
                  'periodoTexto': '01 set. de 2026 a 30 set. de 2026',
                },
            ],
            'requisitosPadrinho': [
              {'descricao': 'Aprovação em Cálculo I', 'obrigatorio': true},
            ],
          },
      ];
      final api = CoordenacaoApi(
        accessToken: 'teste',
        baseUrl: '',
        client: MockClient((_) async => _json(programas)),
      );
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              fontFamily: 'Inter',
              colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
            ),
            home: TelaProgramasCoord(
              api: api,
              onProgramaSelecionado: (codigo) => administrado = codigo,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await _capturar(tester, key, 'programas');
      await tester.tap(find.text('Encerrados'));
      await tester.pumpAndSettle();
      expect(find.text('2027/1'), findsNothing);
      await tester.tap(find.text('2026/1'));
      await tester.pumpAndSettle();
      expect(find.text('Programa 2026/1'), findsOneWidget);
      await tester.ensureVisible(find.text('Administrar'));
      await tester.pumpAndSettle();
      await _capturar(tester, key, 'programa-detalhe');
      await tester.tap(find.text('Administrar'));
      await tester.pumpAndSettle();
      expect(administrado, '2026/1');
      expect(tester.takeException(), isNull);
    },
  );
}
