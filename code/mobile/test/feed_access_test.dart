import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/services/feed_access.dart';
import 'package:ajuda_ai/services/feed_events.dart';
import 'package:ajuda_ai/widgets/feed_comments_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> permissao({bool ler = true, bool publicar = true}) => {
  'podeLer': ler,
  'podePublicar': publicar,
  'podeInteragir': ler,
  'revisao': '$ler:$publicar',
};

class EventosTeste extends http.BaseClient {
  final linhas = StreamController<List<int>>();
  bool fechado = false;
  http.BaseRequest? pedido;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    pedido = request;
    return http.StreamedResponse(
      linhas.stream,
      200,
      headers: {'content-type': 'text/event-stream'},
    );
  }

  void emitir(String tipo, Map<String, dynamic> p) =>
      linhas.add(utf8.encode('event: $tipo\r\ndata: ${jsonEncode(p)}\r\n\r\n'));
  @override
  void close() {
    fechado = true;
    unawaited(linhas.close());
  }
}

void main() {
  test(
    'perder o último vínculo bloqueia publicação e conserva leitura/interação',
    () async {
      var p = permissao();
      final client = MockClient((r) async {
        expect(r.headers['Authorization'], 'Bearer aluno');
        expect(r.url.query, isEmpty);
        return http.Response(jsonEncode(p), 200);
      });
      final acesso = FeedAccess(
        client: client,
        baseUrl: 'http://teste',
        token: () => 'aluno',
      );
      await acesso.atualizar();
      expect(acesso.podePublicar, isTrue);
      p = permissao(publicar: false);
      await acesso.atualizar();
      expect(acesso.podePublicar, isFalse);
      expect(acesso.podeLer && acesso.podeInteragir, isTrue);
      client.close();
    },
  );
  test('revogação e nova aprovação são aplicadas sem trocar JWT', () async {
    var p = permissao();
    final client = MockClient((_) async => http.Response(jsonEncode(p), 200));
    final acesso = FeedAccess(
      client: client,
      baseUrl: 'http://teste',
      token: () => 'mesmo-jwt',
    );
    await acesso.atualizar();
    p = permissao(ler: false, publicar: false);
    await acesso.atualizar();
    expect(
      acesso.podeLer || acesso.podeInteragir || acesso.podePublicar,
      isFalse,
    );
    p = permissao(publicar: false);
    await acesso.atualizar();
    expect(acesso.podeLer, isTrue);
    client.close();
  });
  test('resposta atrasada não restaura permissão invalidada', () async {
    final resposta = Completer<http.Response>();
    final client = MockClient((_) => resposta.future);
    final acesso = FeedAccess(
      client: client,
      baseUrl: 'http://teste',
      token: () => 'tk',
    );
    final consulta = acesso.atualizar();
    acesso.invalidar();
    resposta.complete(http.Response(jsonEncode(permissao()), 200));
    expect(await consulta, isFalse);
    expect(acesso.podeLer, isFalse);
    client.close();
  });
  test('consulta mais nova prevalece sobre a antiga', () async {
    final respostas = [Completer<http.Response>(), Completer<http.Response>()];
    var indice = 0;
    final client = MockClient((_) => respostas[indice++].future);
    final acesso = FeedAccess(
      client: client,
      baseUrl: 'http://teste',
      token: () => 'tk',
    );
    final primeira = acesso.atualizar();
    final segunda = acesso.atualizar();
    respostas[1].complete(
      http.Response(jsonEncode(permissao(publicar: false)), 200),
    );
    await segunda;
    respostas[0].complete(http.Response(jsonEncode(permissao()), 200));
    await primeira;
    expect(acesso.podePublicar, isFalse);
    expect(acesso.podeLer, isTrue);
    client.close();
  });
  test('trocar conta invalida getters e ignora a resposta em voo', () async {
    var token = 'conta-A';
    var atrasar = false;
    final atrasada = Completer<http.Response>();
    final client = MockClient(
      (_) async => atrasar
          ? atrasada.future
          : http.Response(jsonEncode(permissao()), 200),
    );
    final acesso = FeedAccess(
      client: client,
      baseUrl: 'http://teste',
      token: () => token,
    );
    await acesso.atualizar();
    atrasar = true;
    final consulta = acesso.atualizar();
    token = 'conta-B';
    expect(
      acesso.podeLer || acesso.podePublicar || acesso.podeInteragir,
      isFalse,
    );
    atrasada.complete(http.Response(jsonEncode(permissao()), 200));
    expect(await consulta, isFalse);
    expect(acesso.podeLer, isFalse);
    client.close();
  });
  for (final status in [401, 403]) {
    test('$status retira todas as permissões', () async {
      var codigo = 200;
      final client = MockClient(
        (_) async => http.Response(jsonEncode(permissao()), codigo),
      );
      final acesso = FeedAccess(
        client: client,
        baseUrl: 'http://teste',
        token: () => 'tk',
      );
      await acesso.atualizar();
      codigo = status;
      await acesso.atualizar();
      expect(
        acesso.podeLer || acesso.podeInteragir || acesso.podePublicar,
        isFalse,
      );
      client.close();
    });
  }
  test('falha de rede suspende comandos sem inventar revogação', () async {
    var falhar = false;
    final client = MockClient((_) async {
      if (falhar) throw http.ClientException('rede');
      return http.Response(jsonEncode(permissao()), 200);
    });
    final acesso = FeedAccess(
      client: client,
      baseUrl: 'http://teste',
      token: () => 'tk',
    );
    await acesso.atualizar();
    falhar = true;
    expect(await acesso.atualizar(), isFalse);
    expect(acesso.podeLer, isTrue);
    expect(acesso.podePublicar || acesso.podeInteragir, isFalse);
    client.close();
  });
  test('sem token não consulta o servidor', () async {
    final client = MockClient(
      (_) async => throw StateError('Não deve consultar'),
    );
    final acesso = FeedAccess(
      client: client,
      baseUrl: 'http://teste',
      token: () => null,
    );
    expect(await acesso.atualizar(), isTrue);
    expect(acesso.podeLer, isFalse);
    client.close();
  });
  test('feed.access encerra conexão e não reconecta; escopo fica separado do Bearer', () async {
    final client = EventosTeste();
    var chamadas = 0;
    final pronto = Completer<void>(), revogado = Completer<void>();
    final eventos = FeedEvents(
      token: () => 'jwt',
      baseUrl: 'http://teste',
      programa: () => '2020/1',
      clientFactory: () {
        chamadas++;
        return client;
      },
      onEstado: (_) {},
      onEvento: (tipo, _) {
        if (tipo == 'feed.ready') pronto.complete();
      },
      onSemAcesso: () => revogado.complete(),
    );
    eventos.iniciar();
    client.emitir('feed.ready', {'conectado': true});
    await pronto.future;
    expect(client.pedido!.headers['Authorization'], 'Bearer jwt');
    expect(client.pedido!.url.queryParameters, {'programa': '2020/1'});
    client.emitir('feed.access', {'revogado': true});
    await revogado.future;
    await Future<void>.delayed(Duration.zero);
    expect(client.fechado, isTrue);
    expect(chamadas, 1);
    eventos.fechar();
  });
  test('403 do stream avisa perda de acesso e encerra sem retentar', () async {
    var chamadas = 0;
    final pronto = Completer<void>();
    final eventos = FeedEvents(
      token: () => 'tk',
      baseUrl: 'http://teste',
      clientFactory: () => MockClient((_) async {
        chamadas++;
        return http.Response('', 403);
      }),
      onEvento: (_, _) => fail('Sem autorização'),
      onEstado: (_) {},
      onSemAcesso: () => pronto.complete(),
    );
    eventos.iniciar();
    await pronto.future;
    expect(chamadas, 1);
    eventos.fechar();
  });
  testWidgets(
    'folha aberta remove rascunho e interação ao atualizar permissão',
    (tester) async {
      var permitido = true;
      final mudancas = ValueNotifier(0);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FeedCommentsSheet(
              comentarios: () => [],
              mudancas: mudancas,
              podeInteragir: true,
              podeInteragirAtual: () => permitido,
              onSubmit: (_, _) async => false,
              onLike: (_, _) async => false,
              onDelete: (_) async => false,
            ),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), 'Rascunho sensível');
      permitido = false;
      mudancas.value++;
      await tester.pump();
      expect(find.text('Rascunho sensível'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      mudancas.dispose();
    },
  );
}
