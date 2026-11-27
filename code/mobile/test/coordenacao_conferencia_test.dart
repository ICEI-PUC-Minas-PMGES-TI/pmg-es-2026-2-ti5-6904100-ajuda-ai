import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:ajuda_ai/coordenacao/tela_candidaturas_coord.dart';
import 'package:ajuda_ai/coordenacao/tela_cadastros_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:ajuda_ai/theme/colors.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _Backend {
  Map<String, dynamic>? registro;
  Map<String, dynamic>? enviado;
  int falhas = 0;
  String statusCadastro = 'pendente';
  final pedidos = <http.Request>[];
  final itens = [
    {
      'id': 'matricula',
      'descricao': 'Matrícula ativa no curso informado',
      'origem': 'papel',
      'obrigatorio': true,
    },
    {
      'id': 'calculo',
      'descricao': 'Aprovação em Cálculo I',
      'origem': 'programa',
      'obrigatorio': true,
    },
  ];
  Map<String, dynamic> get pessoa => {
    'id': 7,
    'nome': 'Pedro Henrique Lima',
    'email': 'pedro.lima@pucminas.edu.br',
    'iniciais': 'PH',
    'curso': 'Sistemas de Informação',
    'periodo': 4,
    'programa': '2026/2',
    'papel': 'candidato',
    'status': 'em_analise',
    'statusRotulo': 'Em análise',
    'criadoEm': '2026-10-01T12:00:00Z',
  };
  Map<String, dynamic> get detalhe => {
    ...pessoa,
    'respostas': {
      'motivacao': 'Quero ajudar os novos alunos na adaptação à faculdade.',
      'areas': ['Disciplinas e provas'],
      'disponibilidade': ['Manhã'],
    },
    'observacoes': '',
    'conferencia': {
      'itens': itens,
      'verificacao': registro,
      'podeRegistrar': true,
      'dadosParaConsulta': {...pessoa, 'papel': 'Candidato a padrinho'},
    },
  };
  Map<String, dynamic> get cadastro => {
    ...pessoa,
    'id': 20,
    'statusCadastro': statusCadastro,
    'tipoParticipacao': 'padrinho',
    'participacao': {'id': 7, 'programa': '2026/2'},
    'respostas': detalhe['respostas'],
  };
  http.Response json(Object valor, [int status = 200]) => http.Response(
    jsonEncode(valor),
    status,
    headers: {'content-type': 'application/json'},
  );
  late final api = CoordenacaoApi(
    accessToken: 'teste',
    baseUrl: '',
    client: MockClient((p) async {
      pedidos.add(p);
      if (p.url.path == '/coordenacao/candidaturas') {
        return json([
          {...pessoa, 'conferencia': registro?['resultado']},
          {
            ...pessoa,
            'id': 8,
            'nome': 'Ana Beatriz Costa',
            'iniciais': 'AB',
            'status': 'aprovado',
            'statusRotulo': 'Aprovada',
            'papel': 'padrinho',
          },
        ]);
      }
      if (p.url.path == '/coordenacao/candidaturas/7/verificacao') {
        enviado = Map<String, dynamic>.from(jsonDecode(p.body) as Map);
        if (falhas-- > 0) {
          return json({
            'message': 'Não foi possível registrar agora. Tente novamente.',
          }, 503);
        }
        final respostas = (enviado!['itens'] as List).cast<Map>();
        registro = {
          'resultado': respostas.every((r) => r['atende'] == true)
              ? 'requisitos_atendidos'
              : 'requisitos_nao_atendidos',
          'itens': [
            for (final r in respostas)
              {...itens.firstWhere((i) => i['id'] == r['id']), ...r},
          ],
          'por': 'Renata Martins',
          'em': '2026-11-27T12:00:00Z',
          'observacoes': enviado!['observacoes'],
        };
        return json(detalhe);
      }
      if (p.url.path == '/coordenacao/candidaturas/7') return json(detalhe);
      if (p.url.path == '/coordenacao/cadastros/20/aprovar') {
        statusCadastro = 'aprovado';
        return json(cadastro);
      }
      if (p.url.path == '/coordenacao/cadastros/20') return json(cadastro);
      return json({'message': 'Rota inesperada'}, 404);
    }),
  );
}

Future<void> _capturar(WidgetTester tester, GlobalKey key, String nome) async {
  if (!const bool.fromEnvironment('CAPTURAR_LAYOUT')) return;
  await tester.runAsync(() async {
    final imagem =
        await (key.currentContext!.findRenderObject()! as RenderRepaintBoundary)
            .toImage();
    final bytes = await imagem.toByteData(format: ui.ImageByteFormat.png);
    await File('.dart_tool/layout-$nome.png')
        .writeAsBytes(bytes!.buffer.asUint8List());
    imagem.dispose();
  });
}

Future<void> _marcar(WidgetTester tester, String id, bool atende) async {
  final opcao = find.descendant(
    of: find.byKey(ValueKey('conferencia-item-$id')),
    matching: find.widgetWithText(ChoiceChip, atende ? 'Atende' : 'Não atende'),
  );
  await tester.ensureVisible(opcao);
  await tester.pumpAndSettle();
  await tester.tap(opcao);
  await tester.pumpAndSettle();
}

Future<void> _registrar(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Registrar conferência'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Registrar conferência'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final fonte in [
      ('Inter', 'assets/fonts/Inter-Variable.ttf'),
      ('Poppins', 'assets/fonts/Poppins-ExtraBold.ttf'),
      ('MaterialIcons', 'fonts/MaterialIcons-Regular.otf'),
    ]) {
      await (FontLoader(fonte.$1)..addFont(rootBundle.load(fonte.$2))).load();
    }
  });
  void tamanho(WidgetTester tester) {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  Widget app(Widget child, GlobalKey key) => RepaintBoundary(
    key: key,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        fontFamily: 'Inter',
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
      ),
      home: Scaffold(body: child),
    ),
  );

  testWidgets(
    'preserva respostas entre abas e só libera a aprovação após registrar a conferência',
    (tester) async {
      tamanho(tester);
      final backend = _Backend();
      final key = GlobalKey();
      await tester.pumpWidget(
        app(TelaCandidaturasCoord(api: backend.api, programa: '2026/2'), key),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await _capturar(tester, key, 'candidaturas');
      await tester.tap(find.text('Pedro Henrique Lima'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aprovar'))
            .onPressed,
        isNull,
      );
      await _capturar(tester, key, 'conferencia');
      await _marcar(tester, 'matricula', true);
      await tester.tap(find.text('Perfil e respostas'));
      await tester.pumpAndSettle();
      expect(
        find.text('Quero ajudar os novos alunos na adaptação à faculdade.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Conferência'));
      await tester.pumpAndSettle();
      final marcado = find.descendant(
        of: find.byKey(const ValueKey('conferencia-item-matricula')),
        matching: find.widgetWithText(ChoiceChip, 'Atende'),
      );
      expect(tester.widget<ChoiceChip>(marcado).selected, isTrue);
      await _marcar(tester, 'calculo', true);
      await _registrar(tester);
      expect(backend.enviado, {
        'itens': [
          {'id': 'matricula', 'atende': true},
          {'id': 'calculo', 'atende': true},
        ],
        'observacoes': '',
      });
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aprovar'))
            .onPressed,
        isNotNull,
      );
      expect(backend.pedidos.any((p) => p.method == 'POST'), isFalse);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'falha permite repetir a conferência sem perder respostas e requisito não atendido bloqueia aprovação',
    (tester) async {
      tamanho(tester);
      final backend = _Backend()..falhas = 1;
      await tester.pumpWidget(
        app(
          TelaCandidaturasCoord(api: backend.api, programa: '2026/2'),
          GlobalKey(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pedro Henrique Lima'));
      await tester.pumpAndSettle();
      await _marcar(tester, 'matricula', false);
      await _marcar(tester, 'calculo', true);
      await _registrar(tester);
      expect(
        find.text('Não foi possível registrar agora. Tente novamente.'),
        findsOneWidget,
      );
      await _registrar(tester);
      expect(backend.enviado!['itens'], [
        {'id': 'matricula', 'atende': false},
        {'id': 'calculo', 'atende': true},
      ]);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aprovar'))
            .onPressed,
        isNull,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'cadastro registra a conferência na participação e aprova a conta correta',
    (tester) async {
      tamanho(tester);
      final backend = _Backend();
      await tester.pumpWidget(
        app(
          TelaDetalheCadastroCoord(
            api: backend.api,
            id: 20,
            programa: '2026/2',
          ),
          GlobalKey(),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aprovar'))
            .onPressed,
        isNull,
      );
      await _marcar(tester, 'matricula', true);
      await _marcar(tester, 'calculo', true);
      await _registrar(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Aprovar'));
      await tester.pumpAndSettle();
      expect(
        backend.pedidos.where((p) => p.method == 'PUT').single.url.path,
        '/coordenacao/candidaturas/7/verificacao',
      );
      expect(
        backend.pedidos.where((p) => p.method == 'POST').single.url.path,
        '/coordenacao/cadastros/20/aprovar',
      );
      expect(find.text('Aprovar'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
