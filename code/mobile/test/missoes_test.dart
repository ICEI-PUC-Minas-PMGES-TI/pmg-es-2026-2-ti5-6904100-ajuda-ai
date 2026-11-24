import 'dart:convert';

import 'package:ajuda_ai/models/missao.dart';
import 'package:ajuda_ai/services/missoes_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_missoes.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:ajuda_ai/widgets/confete_celebracao.dart';
import 'package:ajuda_ai/widgets/navegacao_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const tokenSessao =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMiIsImVtYWlsIjoiY2FtaWxhQHB1Y21pbmFzLmVkdS5iciJ9.assinatura';

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
  'descricao': 'Colete o PucStop da Biblioteca do ICEI.',
  'requisito': 'PUCSTOPS',
  'progresso': {'atual': 0, 'meta': 1},
  'pronta': false,
  'alvo': null,
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
  int listagens = 0;
  final concluidas = <String>[];

  MockClient get client => MockClient((request) async {
    if (request.headers['authorization'] != 'Bearer $tokenSessao') {
      return resposta('{"message":"Token inválido."}', 401);
    }
    if (request.method == 'GET' && request.url.path == '/me/missoes') {
      listagens++;
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
    ParticipacoesApi(client: servidor.client)..accessToken = tokenSessao,
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
      missao(
        'limitada',
        titulo: 'Compartilhe uma vaga de estágio',
        tipo: 'SEMANAL',
        status: 'limitada',
        xpPrevisto: 0,
      ),
      missao('m1'),
      missao('m2', titulo: 'Visite um PucStop', tipo: 'SEMANAL', xp: 20),
    ]);
    expect(find.text('Missões destacadas'), findsOneWidget);
    expect(
      tester.getTopLeft(find.byKey(const Key('destaque-m1'))).dx,
      tester.getTopLeft(find.byKey(const Key('carrossel-missoes'))).dx,
    );
    expect(find.byKey(const Key('destaque-limitada')), findsNothing);
    expect(find.text('40 / 60 XP'), findsOneWidget);
    expect(find.text('Faltam 20 XP'), findsOneWidget);
    expect(find.textContaining('1.500 XP'), findsNothing);
    expect(find.text('Semanais'), findsWidgets);
    expect(find.text('Do ciclo'), findsOneWidget);
    expect(find.text('Visite um PucStop'), findsWidgets);
    final destaque = find.byKey(const Key('destaque-m2'));
    for (final recompensa in ['20', '20 XP']) {
      expect(
        find.descendant(of: destaque, matching: find.text(recompensa)),
        findsOneWidget,
      );
    }

    final carrossel = find.byKey(const Key('carrossel-missoes'));
    await tester.fling(carrossel, const Offset(650, 0), 1000);
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.byKey(const Key('destaque-m2'))).dx,
      closeTo(tester.getTopLeft(carrossel).dx, 1),
    );
  });

  testWidgets('detalhe abre em sheet com a recompensa e o botão desativado', (
    tester,
  ) async {
    final servidor = await abrir(tester, [missao('m1')]);
    await tester.tap(find.byKey(const Key('missao-m1')));
    await tester.pumpAndSettle();

    final sheet = find.byKey(const Key('detalhe-missao'));
    expect(sheet, findsOneWidget);
    expect(find.byKey(const Key('arte-recompensa')), findsOneWidget);
    expect(find.text('RECOMPENSA'), findsNothing);
    expect(find.bySemanticsLabel('80 XP de recompensa'), findsOneWidget);
    expect(
      find.descendant(of: sheet, matching: find.text('+80 moedas')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: sheet, matching: find.text('Visite a biblioteca')),
      findsOneWidget,
    );
    expect(find.textContaining('vale 1x no semestre'), findsNothing);
    final botao = find.descendant(
      of: find.byKey(const Key('detalhe-concluir')),
      matching: find.byType(FilledButton),
    );
    expect(tester.widget<FilledButton>(botao).onPressed, isNull);
    expect(find.text('Falta 1 para resgatar'), findsOneWidget);

    await tester.tap(botao, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(servidor.concluidas, isEmpty);

    await tester.tapAt(const Offset(400, 40));
    await tester.pumpAndSettle();
    expect(sheet, findsNothing);
  });

  testWidgets('detalhe semanal não mostra aviso de renovação', (tester) async {
    await abrir(tester, [missao('semanal', tipo: 'SEMANAL', xp: 50)]);
    await tester.tap(find.byKey(const Key('missao-semanal')));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('50 XP de recompensa'), findsOneWidget);
    expect(find.text('+50 moedas'), findsOneWidget);
    expect(find.textContaining('renova toda segunda'), findsNothing);
    expect(find.text('Missão semanal'), findsNothing);
  });

  testWidgets('missão concluída mostra o ganho real no sheet', (tester) async {
    await abrir(tester, [
      missao(
        'm1',
        status: 'concluida',
        conclusao: {
          'id': 'c1',
          'xp': 10,
          'moedas': 10,
          'limitado': true,
          'concluidaEm': '2026-11-18T15:00:00.000Z',
        },
      ),
    ]);
    await tester.tap(find.byKey(const Key('filtro-concluidas')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('missao-concluida-m1')));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('10 XP de recompensa'), findsOneWidget);
    expect(find.text('Recompensa resgatada'), findsOneWidget);
  });

  testWidgets('resgate estoura apenas confetes sobre a lista', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => mostrarCelebracaoMissao(context),
            child: const Text('abrir'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(ConfeteCelebracao), findsOneWidget);
    expect(find.text('Missão concluída!'), findsNothing);
    expect(find.byType(Card), findsNothing);
    expect(find.text('Continuar'), findsNothing);

    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.byType(ConfeteCelebracao), findsNothing);
  });

  testWidgets('missão limitada avisa antes de concluir', (tester) async {
    await abrir(tester, [
      missao('m1', tipo: 'SEMANAL', xp: 30, status: 'limitada', xpPrevisto: 20),
    ]);
    expect(find.text('Pelo limite, rende só 20 XP agora.'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('missao-m1')),
        matching: find.text('20 XP'),
      ),
      findsOneWidget,
    );
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

  test('participante sem par também tem a aba Missões', () {
    for (final status in [
      StatusParticipacao.apadrinhadoAguardandoMatch,
      StatusParticipacao.padrinhoAguardandoMatching,
    ]) {
      SessaoUsuario.atual.status = status;
      expect(SessaoUsuario.atual.destinos, [
        AppDestination.mapa,
        AppDestination.missoes,
        AppDestination.feed,
        AppDestination.perfil,
      ]);
    }
  });

  testWidgets('aba recarrega ao voltar para ela e ao retomar o app', (
    tester,
  ) async {
    telaAlta(tester);
    final servidor = Servidor([missao('m1')]);
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(client: servidor.client)..accessToken = tokenSessao,
    );
    SessaoUsuario.atual.status = StatusParticipacao.apadrinhadoAtivo;
    final casca = GlobalKey<AppShellState>();
    await tester.pumpWidget(
      MaterialApp(
        home: AppShell(
          key: casca,
          inicial: AppDestination.missoes,
          construtorDePagina: (destino) => destino == AppDestination.missoes
              ? MissoesPage(
                  api: MissoesApi(client: servidor.client, baseUrl: ''),
                )
              : Center(child: Text('pagina-${destino.name}')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(servidor.listagens, 1);

    servidor.missoes = [
      missao('m1'),
      missao('m2', titulo: 'Participe da oficina de currículo'),
    ];
    casca.currentState!.ir(AppDestination.inicio);
    await tester.pumpAndSettle();
    expect(servidor.listagens, 1);
    casca.currentState!.ir(AppDestination.missoes);
    await tester.pumpAndSettle();
    expect(servidor.listagens, 2);
    expect(find.text('Participe da oficina de currículo'), findsWidgets);

    for (final estado in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(estado);
    }
    await tester.pumpAndSettle();
    expect(servidor.listagens, 3);
  });
}
