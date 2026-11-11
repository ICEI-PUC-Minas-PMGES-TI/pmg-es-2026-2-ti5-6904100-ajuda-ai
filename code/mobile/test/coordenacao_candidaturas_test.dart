import 'dart:convert';
import 'dart:io';

import 'package:ajuda_ai/coordenacao/tela_candidaturas_coord.dart';
import 'package:ajuda_ai/coordenacao/tela_coordenacao.dart';
import 'package:ajuda_ai/coordenacao/tela_formularios_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> _item(
  int id,
  String nome, {
  String papel = 'candidato',
  String status = 'pendente',
  String rotulo = 'Nova',
  int periodo = 5,
  String? grupo,
}) => {
  'id': id,
  'usuarioId': '${nome.split(' ').first.toLowerCase()}@pucminas.edu.br',
  'programa': '2026/2',
  'papel': papel,
  'status': status,
  'grupo': grupo,
  'apadrinhados': 0,
  'criadoEm': '2026-03-12T12:00:00.000Z',
  'nome': nome,
  'email': '${nome.split(' ').first.toLowerCase()}@pucminas.edu.br',
  'curso': 'Engenharia de Software',
  'periodo': periodo,
  'fotoUrl': null,
  'iniciais': nome.split(' ').map((p) => p[0]).take(2).join(),
  'statusRotulo': rotulo,
};

/// Backend da coordenação em memória.
class _ApiCoordFalsa {
  final List<http.Request> requisicoes = [];

  final candidaturas = [
    _item(1, 'Lucas Almeida Silva'),
    _item(
      2,
      'Beatriz Costa',
      periodo: 6,
      status: 'em_analise',
      rotulo: 'Em análise',
    ),
    _item(
      3,
      'Thiago Moreira',
      papel: 'padrinho',
      status: 'em_andamento',
      rotulo: 'Aprovada',
      grupo: 'Grupo 08',
    ),
  ];

  final semVinculo = [
    _item(
      6,
      'Lucas Almeida',
      papel: 'apadrinhado',
      status: 'em_andamento',
      rotulo: 'Em andamento',
      periodo: 1,
    ),
  ];

  Map<String, dynamic>? formularioSalvo;

  http.Response _json(Object corpo, [int status = 200]) => http.Response(
    jsonEncode(corpo),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  late final client = MockClient((requisicao) async {
    requisicoes.add(requisicao);
    final caminho = requisicao.url.path;
    final metodo = requisicao.method;

    if (caminho == '/auth/login-demo') {
      return _json({
        'accessToken': 'token-teste',
        'usuario': {
          'nome': 'Renata Souza',
          'email': 'renata@pucminas.edu.br',
          'perfil': 'coordenador',
        },
      });
    }
    if (caminho == '/coordenacao/programas') {
      return _json([
        {'codigo': '2026/2', 'titulo': 'Programa 2026/2'},
      ]);
    }
    if (caminho == '/coordenacao/dashboard') {
      return http.Response(
        File('test/fixtures/coordenacao_dashboard.json').readAsStringSync(),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    if (caminho == '/coordenacao/candidaturas/acoes' && metodo == 'POST') {
      final corpo = jsonDecode(requisicao.body) as Map<String, dynamic>;
      final ids = (corpo['ids'] as List).cast<int>();
      return _json({
        'acao': corpo['acao'],
        'sucesso': ids.where((id) => id != 3).length,
        'falhas': [
          for (final id in ids)
            if (id == 3) {'id': id, 'ok': false, 'erro': 'Já aprovada.'},
        ],
      });
    }
    if (caminho == '/coordenacao/candidaturas' && metodo == 'GET') {
      return _json(
        requisicao.url.queryParameters['status'] == 'sem_vinculo'
            ? semVinculo
            : candidaturas,
      );
    }
    final detalhe = RegExp(r'^/coordenacao/candidaturas/(\d+)$')
        .firstMatch(caminho);
    if (detalhe != null && metodo == 'GET') {
      final id = int.parse(detalhe.group(1)!);
      final base = [
        ...candidaturas,
        ...semVinculo,
      ].firstWhere((item) => item['id'] == id);
      return _json({
        ...base,
        'respostas': base['papel'] == 'apadrinhado'
            ? {
                'expectativa': 'Quero dicas sobre a rotina.',
                'areas': ['Disciplinas e provas'],
                'disponibilidade': ['Tarde'],
              }
            : {
                'motivacao':
                    'Quero contribuir com a adaptação dos novos alunos.',
                'experiencias': 'Monitoria de AEDS I.',
                'areas': ['Estudos', 'Programação'],
                'disponibilidade': ['Manhã', 'Tarde'],
                'genero': 'Masculino',
                'bolsistaProuni': false,
                'deOutraCidade': true,
              },
        'observacoes': '',
        'requisitosRespondidos': true,
        'requisitos': [
          {
            'id': 'calculo-i',
            'descricao': 'Cálculo I',
            'obrigatorio': true,
            'cumpre': true,
          },
          {
            'id': 'aed-i',
            'descricao': 'AED I',
            'obrigatorio': true,
            'cumpre': false,
          },
        ],
        'criterios': ['A partir do 2º período', 'Cálculo I', 'AED I'],
        'historico': const [],
        'jaFoiApadrinhadoEm': null,
        'numeroCandidatura': 1,
      });
    }
    if (caminho == '/coordenacao/usuarios') {
      return _json([
        {
          ..._item(4, 'Thiago Moreira', papel: 'padrinho', grupo: 'Grupo 08'),
          'situacao': 'padrinho_ativo',
        },
      ]);
    }
    if (caminho == '/coordenacao/vinculos' && metodo == 'POST') {
      final corpo = jsonDecode(requisicao.body) as Map<String, dynamic>;
      semVinculo.first['grupo'] = 'Grupo 08';
      return _json({
        'apadrinhado': {'id': corpo['apadrinhadoId'], 'grupo': 'Grupo 08'},
        'padrinho': {'id': corpo['padrinhoId'], 'grupo': 'Grupo 08'},
      });
    }
    if (caminho.startsWith('/coordenacao/formularios/')) {
      final tipo = caminho.split('/').last;
      if (metodo == 'PUT') {
        formularioSalvo = jsonDecode(requisicao.body) as Map<String, dynamic>;
        return _json({...formularioSalvo!, 'tipo': tipo, 'salvo': true});
      }
      return _json({
        'programa': '2026/2',
        'tipo': tipo,
        'publicado': false,
        'salvo': false,
        'perguntas': [
          {
            'id': 'como-conheceu',
            'enunciado': 'Como você conheceu o programa?',
            'tipo': 'dropdown',
            'opcoes': ['Colegas', 'Professores'],
            'obrigatoria': false,
          },
        ],
      });
    }
    return _json({'message': 'rota não simulada'}, 404);
  });

  CoordenacaoApi get api =>
      CoordenacaoApi(accessToken: 'token-teste', client: client, baseUrl: '');

  List<http.Request> posts(String caminho) => requisicoes
      .where((r) => r.method == 'POST' && r.url.path == caminho)
      .toList();
}

Widget _app(_ApiCoordFalsa falsa, {String? status}) => MaterialApp(
  home: Scaffold(
    body: TelaCandidaturasCoord(
      api: falsa.api,
      programa: '2026/2',
      status: status,
    ),
  ),
);

void main() {
  late _ApiCoordFalsa falsa;

  setUp(() => falsa = _ApiCoordFalsa());

  testWidgets('selecionar todas e aprovar em massa', (tester) async {
    await tester.pumpWidget(_app(falsa));
    await tester.pumpAndSettle();

    expect(find.text('Candidaturas'), findsOneWidget);
    expect(
      tester
          .widget<SegmentedButton<String>>(find.byType(SegmentedButton<String>))
          .selected,
      {'padrinho'},
    );
    // O padrinho já aprovado não entra na seleção.
    expect(find.text('Selecionar todas (2)'), findsOneWidget);
    expect(find.textContaining('selecionada(s)'), findsNothing);

    await tester.tap(find.text('Selecionar todas (2)'));
    await tester.pumpAndSettle();
    expect(find.text('2 selecionada(s)'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Aprovar'));
    await tester.pumpAndSettle();
    expect(
      find.text('Aprovar 2 candidatura(s) selecionada(s)?'),
      findsOneWidget,
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Aprovar').last);
    await tester.pumpAndSettle();

    final envio = falsa.posts('/coordenacao/candidaturas/acoes').single;
    expect(jsonDecode(envio.body), {
      'ids': [1, 2],
      'acao': 'aprovar',
    });
    expect(envio.headers['authorization'], 'Bearer token-teste');
    expect(find.text('2 candidatura(s) aprovada(s).'), findsOneWidget);
    expect(find.textContaining('selecionada(s)'), findsNothing);
  });

  testWidgets('seleção individual, rejeição com confirmação e busca', (
    tester,
  ) async {
    await tester.pumpWidget(_app(falsa));
    await tester.pumpAndSettle();

    await tester.tap(find.bySemanticsLabel('Selecionar Beatriz Costa'));
    await tester.pumpAndSettle();
    expect(find.text('1 selecionada(s)'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Rejeitar'));
    await tester.pumpAndSettle();
    // Cancelar não envia nada.
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(falsa.posts('/coordenacao/candidaturas/acoes'), isEmpty);
    expect(find.text('1 selecionada(s)'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Rejeitar'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).last,
      'Requisitos não atendidos',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Rejeitar'));
    await tester.pumpAndSettle();
    expect(
      jsonDecode(falsa.posts('/coordenacao/candidaturas/acoes').single.body),
      {
        'ids': [2],
        'acao': 'rejeitar',
        'justificativa': 'Requisitos não atendidos',
      },
    );

    await tester.enterText(find.byType(TextField), '6º');
    await tester.pumpAndSettle();
    expect(find.text('Beatriz Costa'), findsOneWidget);
    expect(find.text('Lucas Almeida Silva'), findsNothing);
  });

  testWidgets('detalhe mostra respostas completas e ações', (tester) async {
    tester.view.physicalSize = const Size(412, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app(falsa));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Lucas Almeida Silva'));
    await tester.pumpAndSettle();

    expect(find.text('Motivo para ser padrinho'), findsOneWidget);
    expect(
      find.text('Quero contribuir com a adaptação dos novos alunos.'),
      findsOneWidget,
    );
    expect(find.text('Monitoria de AEDS I.'), findsOneWidget);
    expect(find.text('Manhã, Tarde'), findsOneWidget);
    expect(find.text('Masculino'), findsOneWidget);
    expect(find.text('Cálculo I — declarou que cumpre'), findsOneWidget);
    expect(find.text('AED I — declarou que NÃO cumpre'), findsOneWidget);
    expect(find.text('Rejeitar candidatura'), findsOneWidget);
    expect(find.text('Aprovar candidatura'), findsOneWidget);
    expect(find.text('Solicitar revisão'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('apadrinhado sem vínculo recebe padrinho', (tester) async {
    await tester.pumpWidget(_app(falsa, status: 'sem_vinculo'));
    await tester.pumpAndSettle();

    expect(find.text('Sem vínculo'), findsOneWidget);
    expect(
      tester
          .widget<SegmentedButton<String>>(find.byType(SegmentedButton<String>))
          .selected,
      {'apadrinhado'},
    );
    expect(find.textContaining('Selecionar todas'), findsNothing);

    await tester.tap(find.text('Lucas Almeida'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Definir padrinho'));
    await tester.pumpAndSettle();

    expect(find.text('Escolha o padrinho'), findsOneWidget);
    await tester.tap(find.text('Thiago Moreira'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Definir'));
    await tester.pumpAndSettle();

    final vinculo = falsa.posts('/coordenacao/vinculos').single;
    expect(jsonDecode(vinculo.body), {'apadrinhadoId': 6, 'padrinhoId': 4});
    expect(find.text('Vinculado ao Grupo 08.'), findsOneWidget);
  });

  testWidgets('aba Mais abre o editor de formulários e salva', (tester) async {
    tester.view.physicalSize = const Size(412, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: TelaCoordenacao(client: falsa.client, baseUrl: ''),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Mais'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Formulários'));
    await tester.pumpAndSettle();

    expect(find.byType(TelaFormulariosCoord), findsOneWidget);
    expect(find.text('Pergunta 1'), findsOneWidget);

    await tester.tap(find.text('Adicionar pergunta comum'));
    await tester.pumpAndSettle();
    expect(find.text('Pergunta 2'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'Enunciado').last,
      'Qual sua maior dificuldade?',
    );
    await tester.ensureVisible(find.text('Rascunho (não publicado)'));
    await tester.tap(find.text('Rascunho (não publicado)'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Salvar'));
    await tester.pumpAndSettle();

    final salvo = falsa.formularioSalvo!;
    expect(salvo['publicado'], isTrue);
    final perguntas = (salvo['perguntas'] as List).cast<Map>();
    expect(perguntas, hasLength(2));
    expect(perguntas.last['enunciado'], 'Qual sua maior dificuldade?');
    expect(perguntas.last['tipo'], 'texto_curto');
    expect(
      falsa.requisicoes.any(
        (r) =>
            r.method == 'PUT' &&
            r.url.path == '/coordenacao/formularios/apadrinhado',
      ),
      isTrue,
    );
  });
}
