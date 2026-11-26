import 'dart:convert';

import 'package:ajuda_ai/models/notificacao.dart';
import 'package:ajuda_ai/services/notificacoes_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_padrinho_definido.dart';
import 'package:ajuda_ai/tela_status_candidatura.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:ajuda_ai/widgets/navegacao_app.dart';
import 'package:ajuda_ai/widgets/painel_notificacoes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'helpers/api_falsa.dart';

http.Response resposta(Object corpo, int status) => http.Response.bytes(
  utf8.encode(jsonEncode(corpo)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Map<String, dynamic> item(
  String id, {
  bool lida = false,
  String tipo = 'MISSAO_NOVA',
  String titulo = 'Nova missão disponível',
  String link = '/missoes',
}) => {
  'id': id,
  'tipo': tipo,
  'titulo': titulo,
  'mensagem': 'Visite a biblioteca · 80 XP',
  'link': link,
  'lida': lida,
  'lidaEm': lida ? '2026-11-18T10:00:00.000Z' : null,
  'criadoEm': DateTime.now()
      .subtract(const Duration(minutes: 5))
      .toUtc()
      .toIso8601String(),
};

class Servidor {
  Servidor(this.itens, {this.atraso = Duration.zero, this.ativo = false});

  List<Map<String, dynamic>> itens;
  final Duration atraso;
  final bool ativo;
  final chamadas = <String>[];

  int get naoLidas => itens.where((i) => i['lida'] != true).length;

  MockClient get client => MockClient((request) async {
    chamadas.add('${request.method} ${request.url.path}');
    final path = request.url.path;
    if (path == '/me/notificacoes') {
      await Future<void>.delayed(atraso);
      return resposta({'naoLidas': naoLidas, 'itens': itens}, 200);
    }
    if (path == '/participacoes/situacao' && ativo) {
      return resposta(situacaoApadrinhadoAtivo(), 200);
    }
    if (path == '/me/notificacoes/lidas') {
      itens = [
        for (final i in itens) {...i, 'lida': true},
      ];
      return resposta({'atualizadas': 1, 'naoLidas': 0}, 200);
    }
    final lida = RegExp(r'^/me/notificacoes/([^/]+)/lida$').firstMatch(path);
    if (lida != null) {
      itens = [
        for (final i in itens)
          i['id'] == lida.group(1) ? {...i, 'lida': true} : i,
      ];
      return resposta({
        'id': lida.group(1),
        'lida': true,
        'lidaEm': '2026-11-18T10:00:00.000Z',
        'naoLidas': naoLidas,
      }, 200);
    }
    if (path == '/avisos') return resposta([], 200);
    return resposta({}, 404);
  });
}

Servidor instalar(
  List<Map<String, dynamic>> itens, {
  Duration atraso = Duration.zero,
  String token = 'token-teste',
  bool ativo = false,
}) {
  final servidor = Servidor(itens, atraso: atraso, ativo: ativo);
  SessaoUsuario.atual.configurarApi(
    ParticipacoesApi(client: servidor.client, baseUrl: '')..accessToken = token,
  );
  CentralNotificacoes.atual.api = NotificacoesApi(
    client: servidor.client,
    baseUrl: '',
  );
  return servidor;
}

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  test('marcar todas manda a mais recente da tela (ateId) e relê se sobrou não lida', () async {
    final corpos = <Object?>[];
    var listagens = 0;
    final client = MockClient((request) async {
      final path = request.url.path;
      if (path == '/me/notificacoes') {
        listagens++;
        return resposta({
          'naoLidas': listagens == 1 ? 2 : 1,
          'itens': [item('b'), item('a')],
          'temMais': false,
        }, 200);
      }
      if (path == '/me/notificacoes/lidas') {
        corpos.add(jsonDecode(request.body));
        // Um aviso chegou depois da última leitura: continua não lido.
        return resposta({'atualizadas': 2, 'naoLidas': 1}, 200);
      }
      return resposta({}, 404);
    });
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(client: client, baseUrl: '')
        ..accessToken = 'token-teste',
    );
    CentralNotificacoes.atual.api = NotificacoesApi(
      client: client,
      baseUrl: '',
    );
    await CentralNotificacoes.atual.atualizar();
    await CentralNotificacoes.atual.marcarTodas();
    expect(corpos, [
      {'ateId': 'b'},
    ]);
    expect(listagens, 2);
    expect(CentralNotificacoes.atual.estado.value.naoLidas, 1);
  });

  test(
    'carregar mais busca com antes = último id e junta sem repetir',
    () async {
      final pedidos = <Uri>[];
      final client = MockClient((request) async {
        pedidos.add(request.url);
        if (request.url.path != '/me/notificacoes') return resposta({}, 404);
        final antes = request.url.queryParameters['antes'];
        return antes == null
            ? resposta({
                'naoLidas': 3,
                'itens': [item('c'), item('b')],
                'temMais': true,
              }, 200)
            : resposta({
                'naoLidas': 3,
                'itens': [item('b'), item('a')],
                'temMais': false,
              }, 200);
      });
      SessaoUsuario.atual.configurarApi(
        ParticipacoesApi(client: client, baseUrl: '')
          ..accessToken = 'token-teste',
      );
      CentralNotificacoes.atual.api = NotificacoesApi(
        client: client,
        baseUrl: '',
      );
      await CentralNotificacoes.atual.atualizar();
      expect(CentralNotificacoes.atual.estado.value.temMais, isTrue);
      await CentralNotificacoes.atual.carregarMais();
      expect(pedidos.last.queryParameters['antes'], 'b');
      final estado = CentralNotificacoes.atual.estado.value;
      expect(estado.itens.map((n) => n.id), ['c', 'b', 'a']);
      expect(estado.temMais, isFalse);
    },
  );

  test('central lê a contagem real e marca como lida', () async {
    final servidor = instalar([item('a'), item('b'), item('c', lida: true)]);
    await CentralNotificacoes.atual.atualizar();
    expect(CentralNotificacoes.atual.estado.value.naoLidas, 2);
    await CentralNotificacoes.atual.marcarLida('a');
    expect(CentralNotificacoes.atual.estado.value.naoLidas, 1);
    expect(CentralNotificacoes.atual.estado.value.itens.first.lida, isTrue);
    expect(servidor.chamadas, contains('PATCH /me/notificacoes/a/lida'));
    await CentralNotificacoes.atual.marcarTodas();
    expect(CentralNotificacoes.atual.estado.value.naoLidas, 0);
    expect(servidor.chamadas, contains('PATCH /me/notificacoes/lidas'));
  });

  test('sem sessão o sino fica zerado e não chama a API', () async {
    final servidor = Servidor([item('a')]);
    CentralNotificacoes.atual.api = NotificacoesApi(
      client: servidor.client,
      baseUrl: '',
    );
    await CentralNotificacoes.atual.atualizar();
    expect(CentralNotificacoes.atual.estado.value.naoLidas, 0);
    expect(servidor.chamadas, isEmpty);
  });

  testWidgets('painel lista as notificações e marca todas como lidas', (
    tester,
  ) async {
    instalar([item('a'), item('b', lida: true, tipo: 'NIVEL_SUBIU')]);
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => mostrarNotificacoes(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('notificacao-a')), findsOneWidget);
    expect(find.byKey(const Key('notificacao-nao-lida-a')), findsOneWidget);
    expect(find.byKey(const Key('notificacao-nao-lida-b')), findsNothing);
    expect(find.text('há 5 min'), findsNWidgets(2));

    await tester.tap(find.byKey(const Key('notificacoes-marcar-todas')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('notificacao-nao-lida-a')), findsNothing);
    expect(find.byKey(const Key('notificacoes-marcar-todas')), findsNothing);
  });

  testWidgets('painel vazio', (tester) async {
    instalar([]);
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => mostrarNotificacoes(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    expect(find.text('Nenhuma notificação por enquanto.'), findsOneWidget);
  });

  test('tempo relativo', () {
    final agora = DateTime(2026, 11, 18, 12);
    expect(
      tempoRelativo(DateTime(2026, 11, 18, 11, 55), agora: agora),
      'há 5 min',
    );
    expect(tempoRelativo(DateTime(2026, 11, 18, 11), agora: agora), 'há 1 h');
    expect(tempoRelativo(DateTime(2026, 11, 17, 10), agora: agora), 'ontem');
    expect(tempoRelativo(DateTime(2026, 11, 12, 10), agora: agora), '12/11');
  });

  test('trocar de conta descarta a resposta da conta anterior', () async {
    instalar([item('da-conta-a')], atraso: const Duration(milliseconds: 200));
    final emVoo = CentralNotificacoes.atual.atualizar();
    SessaoUsuario.atual.limpar();
    final outra = instalar([], token: 'token-b');
    await CentralNotificacoes.atual.atualizar();
    await emVoo;
    expect(CentralNotificacoes.atual.estado.value.itens, isEmpty);
    expect(outra.chamadas, contains('GET /me/notificacoes'));
  });

  testWidgets('lista que chega depois dos avisos tira o estado vazio', (
    tester,
  ) async {
    instalar([item('a')], atraso: const Duration(milliseconds: 500));
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => mostrarNotificacoes(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(find.byKey(const Key('notificacoes-vazio')), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('notificacao-a')), findsOneWidget);
    expect(find.byKey(const Key('notificacoes-vazio')), findsNothing);
  });

  testWidgets('tocar em missão nova abre a aba Missões', (tester) async {
    final servidor = instalar([item('a')], ativo: true);
    await SessaoUsuario.atual.sincronizarSituacao();
    final casca = GlobalKey<AppShellState>();
    await tester.pumpWidget(
      MaterialApp(
        home: AppShell(
          key: casca,
          construtorDePagina: (destino) => destino == AppDestination.inicio
              ? Builder(
                  builder: (context) => Center(
                    child: TextButton(
                      onPressed: () => mostrarNotificacoes(context),
                      child: const Text('abrir'),
                    ),
                  ),
                )
              : Center(child: Text('pagina-${destino.name}')),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('notificacao-a')));
    await tester.pumpAndSettle();
    expect(casca.currentState!.atual, AppDestination.missoes);
    expect(find.text('pagina-missoes'), findsOneWidget);
    expect(servidor.chamadas, contains('PATCH /me/notificacoes/a/lida'));
  });

  Future<void> abrirPainel(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Center(
            child: TextButton(
              onPressed: () => mostrarNotificacoes(context),
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'aviso de vínculo da API substitui o cartão local e abre o padrinho',
    (tester) async {
      final servidor = instalar([
        item(
          'v',
          tipo: 'VINCULO_CONFIRMADO',
          titulo: 'Seu padrinho foi definido!',
          link: '/dupla?ciclo=2026%2F2',
        ),
      ], ativo: true);
      await SessaoUsuario.atual.sincronizarSituacao();
      await abrirPainel(tester);
      expect(find.byKey(const Key('notificacao-v')), findsOneWidget);
      expect(find.text('Seu padrinho foi definido!'), findsOneWidget);
      await tester.tap(find.byKey(const Key('notificacao-v')));
      await tester.pumpAndSettle();
      expect(find.byType(PadrinhoDefinidoPage), findsOneWidget);
      expect(servidor.chamadas, contains('PATCH /me/notificacoes/v/lida'));
    },
  );

  testWidgets('decisão da candidatura abre o acompanhamento', (tester) async {
    final servidor = instalar([
      item(
        'c',
        tipo: 'CANDIDATURA_APROVADA',
        titulo: 'Candidatura aprovada',
        link: '/candidatura?ciclo=2026%2F2',
      ),
    ], ativo: true);
    await SessaoUsuario.atual.sincronizarSituacao();
    await abrirPainel(tester);
    await tester.tap(find.byKey(const Key('notificacao-c')));
    await tester.pumpAndSettle();
    expect(find.byType(StatusCandidaturaPage), findsOneWidget);
    expect(servidor.chamadas, contains('PATCH /me/notificacoes/c/lida'));
  });

  test('link da notificação vira a aba certa', () {
    expect(abaDaNotificacao('/missoes'), AppDestination.missoes);
    expect(abaDaNotificacao('/perfil'), AppDestination.perfil);
    expect(abaDaNotificacao('/dupla'), AppDestination.inicio);
    expect(abaDaNotificacao('/dupla?ciclo=2026%2F2'), AppDestination.inicio);
    expect(abaDaNotificacao('/candidatura'), isNull);
    expect(abaDaNotificacao('/candidatura?ciclo=2026%2F2'), isNull);
    expect(abaDaNotificacao('/lojinha/resgates/x'), isNull);
    expect(abaDaNotificacao(null), isNull);
  });

  test('tempo relativo segue o dia do calendário', () {
    final noite = DateTime(2026, 11, 18, 23, 40);
    expect(
      tempoRelativo(DateTime(2026, 11, 18, 0, 5), agora: noite),
      'há 23 h',
    );
    expect(
      tempoRelativo(
        DateTime(2026, 11, 17, 23),
        agora: DateTime(2026, 11, 18, 8),
      ),
      'ontem',
    );
    expect(
      tempoRelativo(
        DateTime(2026, 11, 16, 20),
        agora: DateTime(2026, 11, 18, 8),
      ),
      '16/11',
    );
  });
}
