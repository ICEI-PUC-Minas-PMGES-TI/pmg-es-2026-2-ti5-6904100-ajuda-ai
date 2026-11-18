import 'dart:convert';

import 'package:ajuda_ai/models/notificacao.dart';
import 'package:ajuda_ai/services/notificacoes_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/widgets/painel_notificacoes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response resposta(Object corpo, int status) => http.Response.bytes(
  utf8.encode(jsonEncode(corpo)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

Map<String, dynamic> item(
  String id, {
  bool lida = false,
  String tipo = 'MISSAO_NOVA',
}) => {
  'id': id,
  'tipo': tipo,
  'titulo': 'Nova missão disponível',
  'mensagem': 'Visite a biblioteca · 80 XP',
  'link': '/missoes',
  'lida': lida,
  'lidaEm': lida ? '2026-11-18T10:00:00.000Z' : null,
  'criadoEm': DateTime.now()
      .subtract(const Duration(minutes: 5))
      .toUtc()
      .toIso8601String(),
};

class Servidor {
  Servidor(this.itens);

  List<Map<String, dynamic>> itens;
  final chamadas = <String>[];

  int get naoLidas => itens.where((i) => i['lida'] != true).length;

  MockClient get client => MockClient((request) async {
    chamadas.add('${request.method} ${request.url.path}');
    final path = request.url.path;
    if (path == '/me/notificacoes') {
      return resposta({'naoLidas': naoLidas, 'itens': itens}, 200);
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

Servidor instalar(List<Map<String, dynamic>> itens) {
  final servidor = Servidor(itens);
  SessaoUsuario.atual.configurarApi(
    ParticipacoesApi(client: servidor.client, baseUrl: '')
      ..accessToken = 'token-teste',
  );
  CentralNotificacoes.atual.api = NotificacoesApi(
    client: servidor.client,
    baseUrl: '',
  );
  return servidor;
}

void main() {
  tearDown(SessaoUsuario.atual.limpar);

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
}
