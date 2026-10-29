import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_coordenacao.dart';
import 'package:ajuda_ai/services/auth_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);
final imagem = 'data:image/png;base64,${base64Encode(png)}';

class _Stream extends http.BaseClient {
  final dados = StreamController<List<int>>();
  http.BaseRequest? request;
  bool fechado = false;
  void evento(String tipo) =>
      dados.add(utf8.encode('event: $tipo\ndata: {"publicacaoId":1}\n\n'));
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    this.request = request;
    return http.StreamedResponse(
      dados.stream,
      200,
      headers: {'content-type': 'text/event-stream'},
    );
  }

  @override
  void close() {
    fechado = true;
    unawaited(dados.close());
  }
}

class _Backend {
  final streams = <_Stream>[];
  final pedidos = <http.Request>[];
  final posts = <Map<String, dynamic>>[];
  int uploads = 0;
  bool recusarEdicao = false;
  void emitir(String tipo) {
    for (final stream in streams) {
      if (!stream.fechado) stream.evento(tipo);
    }
  }

  _Stream abrirStream() {
    final stream = _Stream();
    streams.add(stream);
    return stream;
  }

  http.Response json(Object data, [int status = 200]) => http.Response(
    jsonEncode(data),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
  Map<String, dynamic> apresentar(Map<String, dynamic> post, bool admin) => {
    ...post,
    'autor': 'Renata Martins',
    'iniciais': 'RM',
    'descricaoAutor': 'Coordenação',
    'tempo': 'agora',
    'imagens': [for (final _ in post['midias'] as List) imagem],
    'curtidas': post['curtidas'] ?? 0,
    'comentarios': (post['comentariosTexto'] as List).length,
    'podeAdministrar': admin,
    'curtidoPeloUsuario': !admin && (post['curtidas'] as int) > 0,
  };
  late final client = MockClient((r) async {
    pedidos.add(r);
    final admin = r.headers['authorization'] == 'Bearer coord';
    final path = r.url.path;
    if (path == '/coordenacao/programas') return json([]);
    if (path == '/publicacoes/permissoes') return json({'podePublicar': admin});
    if (path == '/publicacoes' && r.method == 'GET') {
      return json(posts.map((p) => apresentar(p, admin)).toList());
    }
    if (path == '/publicacoes/midias') {
      if (!admin) return json({'message': 'Sem permissão'}, 403);
      expect(r.headers['content-type'], startsWith('multipart/form-data'));
      expect(r.bodyBytes, containsAllInOrder(png));
      uploads++;
      return json({
        'chave': 'feed/publicacoes/autor/imagem-$uploads.png',
        'url': imagem,
      }, 201);
    }
    if (path == '/publicacoes' && r.method == 'POST') {
      if (!admin) return json({'message': 'Sem permissão'}, 403);
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      expect(body.containsKey('autor'), isFalse);
      final post = {
        'id': posts.length + 1,
        'texto': body['texto'],
        'categoria': body['categoria'],
        'midias': body['imagens'],
        'curtidas': 0,
        'comentariosTexto': <String>[],
      };
      posts.insert(0, post);
      emitir('feed.post.created');
      return json(apresentar(post, admin), 201);
    }
    if (path == '/publicacoes/1' && r.method == 'PATCH') {
      if (!admin || recusarEdicao) {
        return json({'message': 'Permissão revogada'}, 403);
      }
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      posts.first.addAll({
        'texto': body['texto'],
        'categoria': body['categoria'],
        'midias': body['imagens'],
      });
      emitir('feed.post.updated');
      return json(apresentar(posts.first, admin));
    }
    if (path == '/publicacoes/1' && r.method == 'DELETE') {
      if (!admin) return json({'message': 'Sem permissão'}, 403);
      posts.clear();
      emitir('feed.post.deleted');
      return json({'removido': true});
    }
    if (path == '/publicacoes/1/curtidas') {
      posts.first['curtidas'] = (jsonDecode(r.body) as Map)['delta'] == 1
          ? 1
          : 0;
      emitir('feed.like.updated');
      return json(apresentar(posts.first, admin), 201);
    }
    if (path == '/publicacoes/1/comentarios') {
      (posts.first['comentariosTexto'] as List).add(
        (jsonDecode(r.body) as Map)['texto'],
      );
      emitir('feed.comment.created');
      return json(apresentar(posts.first, admin), 201);
    }
    return json({'message': 'Não encontrado'}, 404);
  });
}

void main() {
  void tamanho(WidgetTester tester, {double width = 390}) {
    tester.view.physicalSize = Size(width, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Future<void> tocar(WidgetTester tester, Finder finder) async {
    await tester.pump();
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('miguelruivo.flutter.plugins.filepicker'),
          (call) async => [
            {
              'name': 'imagem.png',
              'path': null,
              'size': png.length,
              'bytes': Uint8List.fromList(png),
            },
          ],
        );
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('miguelruivo.flutter.plugins.filepicker'),
          null,
        );
  });

  testWidgets(
    'coordenação abre feed sem ciclo e usa sua própria sessão no REST e SSE',
    (tester) async {
      tamanho(tester);
      final backend = _Backend();
      SessaoUsuario.atual.configurarApi(
        ParticipacoesApi()..accessToken = 'aluno-antigo',
      );
      addTearDown(SessaoUsuario.atual.limpar);
      await tester.pumpWidget(
        MaterialApp(
          home: TelaCoordenacao(
            sessaoAutenticada: const SessaoAuth(
              accessToken: 'coord',
              usuario: {
                'nome': 'Renata Martins',
                'email': 'renata@pucminas.edu.br',
                'perfil': 'coordenador',
              },
            ),
            client: backend.client,
            baseUrl: 'http://notebook.test:3000',
            feedEventsClientFactory: backend.abrirStream,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tocar(tester, find.byTooltip('Feed do programa'));
      expect(find.text('Compartilhe algo com a comunidade...'), findsOneWidget);
      expect(
        backend.pedidos
            .where((r) => r.url.path.startsWith('/publicacoes'))
            .every((r) => r.headers['authorization'] == 'Bearer coord'),
        isTrue,
      );
      expect(backend.streams.single.request!.url.host, 'notebook.test');
      expect(
        backend.streams.single.request!.headers['Authorization'],
        'Bearer coord',
      );
      expect(SessaoUsuario.atual.accessToken, 'aluno-antigo');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(backend.streams.single.fechado, isTrue);
    },
  );

  testWidgets(
    'coordenador cria com imagem, edita mantendo referência, remove mídia e exclui',
    (tester) async {
      tamanho(tester);
      final backend = _Backend();
      await tester.pumpWidget(
        MaterialApp(
          home: FeedPage(
            accessToken: 'coord',
            nomeAutor: 'Renata Martins',
            coordenacao: true,
            client: backend.client,
            eventsClientFactory: backend.abrirStream,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tocar(tester, find.text('Compartilhe algo com a comunidade...'));
      await tester.enterText(
        find.byType(TextField).first,
        'Comunicado publicado pelo celular',
      );
      await tocar(tester, find.text('Adicionar foto (0/10)'));
      await tocar(tester, find.text('Publicar'));
      expect(backend.uploads, 1);
      expect(backend.posts.single['midias'], [
        'feed/publicacoes/autor/imagem-1.png',
      ]);
      expect(find.text('Comunicado publicado pelo celular'), findsOneWidget);
      await tocar(tester, find.byTooltip('Mais opções'));
      await tocar(tester, find.text('Editar publicação'));
      await tester.enterText(
        find.byType(TextField).first,
        'Texto editado no celular',
      );
      backend.recusarEdicao = true;
      await tocar(tester, find.text('Salvar alterações'));
      expect(find.text('Permissão revogada'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      backend.recusarEdicao = false;
      await tocar(tester, find.text('Salvar alterações'));
      expect(backend.uploads, 1); // A imagem existente não é enviada novamente.
      expect(backend.posts.single['texto'], 'Texto editado no celular');
      await tocar(tester, find.byTooltip('Mais opções'));
      await tocar(tester, find.text('Editar publicação'));
      await tocar(tester, find.byTooltip('Remover imagem'));
      await tocar(tester, find.text('Salvar alterações'));
      expect(backend.posts.single['midias'], isEmpty);
      await tocar(tester, find.byTooltip('Mais opções'));
      await tocar(tester, find.text('Editar publicação'));
      await tocar(tester, find.text('Adicionar foto (0/10)'));
      await tocar(tester, find.text('Salvar alterações'));
      expect(backend.uploads, 2);
      expect(backend.posts.single['midias'], [
        'feed/publicacoes/autor/imagem-2.png',
      ]);
      await tocar(tester, find.byTooltip('Mais opções'));
      await tocar(tester, find.text('Apagar publicação'));
      await tocar(tester, find.text('Apagar'));
      expect(backend.posts, isEmpty);
      expect(find.text('Nada por aqui ainda'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'dois Flutter: publicação do coordenador chega ao aluno e interações voltam por SSE',
    (tester) async {
      tamanho(tester, width: 800);
      final backend = _Backend();
      const a = ValueKey('celular-a');
      const b = ValueKey('celular-b');
      await tester.pumpWidget(
        MaterialApp(
          home: Row(
            children: [
              Expanded(
                child: FeedPage(
                  key: a,
                  accessToken: 'coord',
                  nomeAutor: 'Renata Martins',
                  coordenacao: true,
                  client: backend.client,
                  eventsClientFactory: backend.abrirStream,
                ),
              ),
              Expanded(
                child: FeedPage(
                  key: b,
                  accessToken: 'aluno',
                  client: backend.client,
                  eventsClientFactory: backend.abrirStream,
                ),
              ),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();
      Finder em(Key key, Finder finder) =>
          find.descendant(of: find.byKey(key), matching: finder);
      expect(
        em(b, find.text('Compartilhe algo com a comunidade...')),
        findsNothing,
      );
      await tocar(
        tester,
        em(a, find.text('Compartilhe algo com a comunidade...')),
      );
      await tester.enterText(
        find.byType(TextField).first,
        'Notícia do celular A',
      );
      await tocar(tester, find.text('Publicar'));
      expect(em(b, find.text('Notícia do celular A')), findsOneWidget);
      await tocar(tester, em(b, find.byTooltip('Curtir')));
      expect(em(a, find.text('1 curtidas')), findsOneWidget);
      await tocar(tester, em(b, find.byTooltip('Comentar')));
      await tester.enterText(
        find.byType(TextField).last,
        'Resposta do celular B',
      );
      await tocar(tester, find.byIcon(Icons.send_rounded));
      expect(em(a, find.text('Ver todos os 1 comentários')), findsOneWidget);
      expect(find.text('Resposta do celular B'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      expect(backend.streams.every((s) => s.fechado), isTrue);
    },
  );
}
