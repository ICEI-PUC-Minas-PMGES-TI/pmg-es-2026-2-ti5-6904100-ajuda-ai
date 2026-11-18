import 'dart:convert';

import 'package:ajuda_ai/models/missao.dart';
import 'package:ajuda_ai/services/missoes_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_missoes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void telaAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Map<String, dynamic> missao(
  String id, {
  String titulo = 'Visite a biblioteca',
  String tipo = 'UNICA',
  int xp = 80,
  String status = 'disponivel',
  int? xpPrevisto,
  Map<String, dynamic>? conclusao,
}) => {
  'id': id,
  'titulo': titulo,
  'descricao': 'Descrição de $titulo',
  'tipo': tipo,
  'xp': xp,
  'moedas': xp,
  'fim': null,
  'status': status,
  'xpPrevisto': xpPrevisto ?? (status == 'concluida' ? 0 : xp),
  'conclusao': conclusao,
};

Map<String, dynamic> lista(List<Map<String, dynamic>> missoes) => {
  'ciclo': '2026/2',
  'semana': '2026-11-16',
  'limites': {
    'ciclo': {'ganho': 860, 'limite': 1500},
    'semanal': {'ganho': 40, 'limite': 60},
  },
  'missoes': missoes,
};

Map<String, dynamic> conclusao({
  int xp = 80,
  int xpConfigurado = 80,
  bool limitado = false,
  String? teto,
  bool subiu = false,
}) => {
  'missaoId': 'm1',
  'conclusaoId': 'c1',
  'xpConfigurado': xpConfigurado,
  'xp': xp,
  'moedas': xp,
  'limitado': limitado,
  'teto': teto,
  'saldoMoedas': 400,
  'xpAcumulado': 780,
  'nivel': {
    'numero': 6,
    'nome': 'Parceria',
    'xpMinimo': 750,
    'proximoXp': 1050,
    'proximoNome': 'Liderança',
    'xpNoNivel': 30,
    'xpDoNivel': 300,
    'xpRestante': 270,
    'progresso': 10,
    'maximo': false,
  },
  'subiuDeNivel': subiu,
  'ciclo': '2026/2',
  'semana': null,
  'concluidaEm': '2026-11-18T15:00:00.000Z',
};

http.Response resposta(String corpo, int status) => http.Response.bytes(
  utf8.encode(corpo),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

class Servidor {
  Servidor(this.missoes);

  List<Map<String, dynamic>> missoes;
  Map<String, dynamic> respostaConclusao = conclusao();
  int statusConclusao = 201;
  int statusLista = 200;
  final concluidas = <String>[];

  MockClient get client => MockClient((request) async {
    expect(request.headers['authorization'], 'Bearer token-teste');
    if (request.method == 'GET' && request.url.path == '/me/missoes') {
      if (statusLista != 200) {
        return resposta(
          jsonEncode({'statusCode': statusLista, 'message': 'Sem acesso.'}),
          statusLista,
        );
      }
      return resposta(jsonEncode(lista(missoes)), 200);
    }
    final concluir = RegExp(r'^/me/missoes/([^/]+)/concluir$');
    final achado = concluir.firstMatch(request.url.path);
    if (request.method == 'POST' && achado != null) {
      final id = achado.group(1)!;
      concluidas.add(id);
      if (statusConclusao != 201) {
        return resposta(
          jsonEncode({
            'statusCode': statusConclusao,
            'message': 'Você já concluiu esta missão neste semestre.',
            'motivo': 'ja-concluida',
          }),
          statusConclusao,
        );
      }
      missoes = [
        for (final m in missoes)
          m['id'] == id
              ? {
                  ...m,
                  'status': 'concluida',
                  'conclusao': {
                    'id': 'c1',
                    'xp': respostaConclusao['xp'],
                    'moedas': respostaConclusao['moedas'],
                    'limitado': respostaConclusao['limitado'],
                    'concluidaEm': '2026-11-18T15:00:00.000Z',
                  },
                }
              : m,
      ];
      return resposta(jsonEncode(respostaConclusao), 201);
    }
    return resposta('{}', 404);
  });
}

Future<Servidor> abrir(
  WidgetTester tester,
  List<Map<String, dynamic>> missoes, {
  void Function(Servidor)? configurar,
}) async {
  telaAlta(tester);
  final servidor = Servidor(missoes);
  configurar?.call(servidor);
  SessaoUsuario.atual.configurarApi(
    ParticipacoesApi(client: servidor.client)..accessToken = 'token-teste',
  );
  await tester.pumpWidget(
    MaterialApp(
      home: MissoesPage(
        api: MissoesApi(client: servidor.client, baseUrl: ''),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return servidor;
}

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('lista missões semanais e do ciclo com os limites', (
    tester,
  ) async {
    await abrir(tester, [
      missao('m1'),
      missao('m2', titulo: 'Visite um PucStop', tipo: 'SEMANAL', xp: 20),
    ]);
    expect(find.text('40 de 60 XP em missões semanais'), findsOneWidget);
    expect(find.text('Ciclo 2026/2 · 860 de 1.500 XP'), findsOneWidget);
    expect(find.text('Semanais'), findsWidgets);
    expect(find.text('Do ciclo'), findsOneWidget);
    expect(find.text('Visite um PucStop'), findsOneWidget);
    expect(find.text('+80 XP · +80 moedas'), findsOneWidget);
  });

  testWidgets('concluir mostra o ganho e atualiza moedas e lista', (
    tester,
  ) async {
    final servidor = await abrir(tester, [missao('m1')]);
    await tester.tap(find.byKey(const Key('concluir-m1')));
    await tester.pumpAndSettle();

    expect(servidor.concluidas, ['m1']);
    expect(find.text('Missão concluída!'), findsOneWidget);
    expect(find.text('+80 XP'), findsOneWidget);
    expect(find.text('+80 moedas'), findsOneWidget);
    expect(find.text('Nível 6 · Parceria'), findsOneWidget);
    expect(find.byKey(const Key('sheet-conclusao-limite')), findsNothing);
    expect(SessaoUsuario.atual.xp.value, 400);

    await tester.tap(find.byKey(const Key('sheet-conclusao-continuar')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('filtro-concluidas')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('missao-concluida-m1')), findsOneWidget);
  });

  testWidgets('ganho cortado pelo teto mostra o valor da API e o aviso', (
    tester,
  ) async {
    await abrir(
      tester,
      [missao('m1', tipo: 'SEMANAL', xp: 20)],
      configurar: (s) => s.respostaConclusao = conclusao(
        xp: 10,
        xpConfigurado: 20,
        limitado: true,
        teto: 'semanal',
      ),
    );
    await tester.tap(find.byKey(const Key('concluir-m1')));
    await tester.pumpAndSettle();

    expect(find.text('Missão concluída'), findsOneWidget);
    expect(find.text('+10 XP'), findsOneWidget);
    expect(find.text('+10 moedas'), findsOneWidget);
    expect(
      find.text(
        'Você atingiu o limite semanal de missões. Foram creditados 10 de 20 XP.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('missão limitada avisa antes de concluir', (tester) async {
    await abrir(tester, [
      missao('m1', tipo: 'SEMANAL', xp: 30, status: 'limitada', xpPrevisto: 20),
    ]);
    expect(find.text('Pelo limite, rende só 20 XP agora.'), findsOneWidget);
  });

  testWidgets('conclusão repetida mostra o erro sem quebrar a tela', (
    tester,
  ) async {
    await abrir(tester, [
      missao('m1'),
    ], configurar: (s) => s.statusConclusao = 409);
    await tester.tap(find.byKey(const Key('concluir-m1')));
    await tester.pumpAndSettle();
    expect(
      find.text('Você já concluiu esta missão neste semestre.'),
      findsOneWidget,
    );
    expect(find.text('Missão concluída!'), findsNothing);
  });

  testWidgets('sem participação mostra o motivo, sem tentar de novo', (
    tester,
  ) async {
    await abrir(tester, [], configurar: (s) => s.statusLista = 403);
    expect(find.byKey(const Key('missoes-erro')), findsOneWidget);
    expect(find.text('Sem acesso.'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsNothing);
  });

  testWidgets('lista vazia', (tester) async {
    await abrir(tester, []);
    expect(find.byKey(const Key('missoes-vazio')), findsOneWidget);
    expect(find.text('Nenhuma missão disponível'), findsOneWidget);
  });

  testWidgets('detalhe abre e concluir de lá chama a API', (tester) async {
    final servidor = await abrir(tester, [missao('m1')]);
    await tester.tap(find.byKey(const Key('missao-m1')));
    await tester.pumpAndSettle();
    expect(find.text('Detalhe da missão'), findsOneWidget);
    expect(find.text('Missão do ciclo'), findsOneWidget);
    await tester.tap(find.byKey(const Key('detalhe-concluir')));
    await tester.pumpAndSettle();
    expect(servidor.concluidas, ['m1']);
  });

  test('modelo ignora itens fora do contrato', () {
    final dados = MissoesAluno.fromJson({
      ...lista([missao('m1')]),
      'missoes': [
        missao('m1'),
        {'id': 3},
      ],
    })!;
    expect(dados.missoes.map((m) => m.id), ['m1']);
    expect(dados.tetoSemanal!.restante, 20);
  });
}
