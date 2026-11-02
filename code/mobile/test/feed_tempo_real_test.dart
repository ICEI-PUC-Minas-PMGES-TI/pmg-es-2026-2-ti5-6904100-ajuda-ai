import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/services/feed_events.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_feed.dart';
import 'package:ajuda_ai/widgets/feed_comments_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _StreamClient extends http.BaseClient {
  final controller = StreamController<List<int>>();
  bool fechado = false;
  http.BaseRequest? request;
  void evento(String tipo) => controller.add(
    utf8.encode('event: $tipo\r\ndata: {"publicacaoId":1}\r\n\r\n'),
  );
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    this.request = request;
    return http.StreamedResponse(
      controller.stream,
      200,
      headers: {'content-type': 'text/event-stream'},
    );
  }

  @override
  void close() {
    fechado = true;
    unawaited(controller.close());
  }
}

void main() {
  testWidgets(
    'SSE recebe post, curtida e comentário aberto, com Bearer e descarte',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SessaoUsuario.atual.configurarApi(ParticipacoesApi()..accessToken = 'tk');
      addTearDown(SessaoUsuario.atual.limpar);
      final posts = <Map<String, dynamic>>[];
      final client = MockClient(
        (r) async => http.Response(
          jsonEncode(
            r.url.path.endsWith('permissoes')
                ? {'podePublicar': false}
                : r.url.path == '/publicacoes/1'
                ? posts.first
                : posts,
          ),
          200,
        ),
      );
      final stream = _StreamClient();
      await tester.pumpWidget(
        MaterialApp(
          home: FeedPage(client: client, eventsClientFactory: () => stream),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Nada por aqui ainda'), findsOneWidget);
      expect(find.text('Compartilhe algo com a comunidade...'), findsNothing);
      expect(stream.request!.headers['Authorization'], 'Bearer tk');
      expect(stream.request!.url.query, isEmpty);
      posts.add({
        'id': 1,
        'autor': 'Coordenação',
        'iniciais': 'CO',
        'descricaoAutor': 'Programa',
        'tempo': 'agora',
        'categoria': 'Comunicados',
        'texto': 'Notícia recebida ao vivo',
        'podeInteragir': true,
        'imagens': <String>[],
        'curtidas': 0,
        'comentarios': 0,
        'comentariosTexto': <String>[],
        'isOwn': false,
        'podeAdministrar': false,
        'curtidoPeloUsuario': false,
      });
      stream.evento('feed.post.created');
      await tester.pumpAndSettle();
      expect(find.text('Notícia recebida ao vivo'), findsOneWidget);
      posts.first['curtidas'] = 1;
      stream.evento('feed.like.updated');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Comentar'));
      await tester.tap(find.byTooltip('Comentar'));
      await tester.pumpAndSettle();
      posts.first['comentariosTexto'] = ['Comentário de outro celular'];
      posts.first['comentarios'] = 1;
      posts.first['comentariosDetalhes'] = [
        {
          'id': 10,
          'texto': 'Comentário de outro celular',
          'paiId': null,
          'autor': {'id': 'usuario:2', 'nome': 'Ana Souza', 'fotoUrl': null},
          'curtidas': 0,
          'curtidoPorMim': false,
          'podeExcluir': false,
        },
      ];
      stream.evento('feed.comment.created');
      await tester.pumpAndSettle();
      expect(find.text('Comentário de outro celular'), findsOneWidget);
      expect(find.text('Ana Souza'), findsOneWidget);
      final detalhes = posts.first['comentariosDetalhes'] as List;
      detalhes[0]['curtidas'] = 1;
      stream.evento('feed.comment.like.updated');
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(FeedCommentsSheet),
          matching: find.byIcon(Icons.favorite_border_rounded),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(FeedCommentsSheet),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );
      detalhes.add({
        'id': 11,
        'texto': 'Resposta ao vivo',
        'paiId': 10,
        'autor': {
          'id': 'coordenador:3',
          'nome': 'Renata Martins',
          'fotoUrl': null,
        },
      });
      posts.first['comentarios'] = 2;
      stream.evento('feed.comment.created');
      await tester.pumpAndSettle();
      expect(find.text('Resposta ao vivo'), findsOneWidget);
      detalhes.clear();
      posts.first['comentarios'] = 0;
      stream.evento('feed.comment.deleted');
      await tester.pumpAndSettle();
      expect(find.text('Resposta ao vivo'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(stream.fechado, isTrue);
      client.close();
      expect(tester.takeException(), isNull);
    },
  );

  test('stream reconecta após EOF e para ao receber 401', () async {
    var conexoes = 0;
    final estados = <String>[];
    final events = FeedEvents(
      token: () => 'token',
      onEvento: (_, _) {},
      onEstado: estados.add,
      clientFactory: () => MockClient((r) async {
        conexoes++;
        expect(r.headers['authorization'], 'Bearer token');
        return conexoes == 1
            ? http.Response(
                'event: feed.ready\ndata: {"conectado":true}\n\n',
                200,
                headers: {'content-type': 'text/event-stream'},
              )
            : http.Response('', 401);
      }),
    );
    events.iniciar();
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    expect(conexoes, 2);
    expect(estados.last, contains('Sessão expirada'));
    expect(conexoes, 2);
    events.fechar();
  });
}
