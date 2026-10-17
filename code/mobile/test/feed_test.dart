import 'dart:convert';

import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  void configurarTela(WidgetTester tester) {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Widget app(http.Client client) => MaterialApp(home: FeedPage(client: client));

  testWidgets('feed vazio nao exibe publicacoes ficticias', (tester) async {
    configurarTela(tester);
    final backend = _FeedBackendFake();
    final client = MockClient(backend.responder);
    addTearDown(client.close);

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    expect(find.text('Feed'), findsWidgets);
    expect(find.text('Nada por aqui ainda'), findsOneWidget);
    expect(find.text('Núcleo de Apoio ao Aluno'), findsNothing);
    expect(find.text('Marina Souza'), findsNothing);
    expect(find.text('Central de Carreiras'), findsNothing);
    expect(find.text('Mapa'), findsOneWidget);
    expect(find.text('Missões'), findsOneWidget);
    expect(find.text('Perfil'), findsOneWidget);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('publicacao criada e salva pelo backend aparece no feed', (
    tester,
  ) async {
    configurarTela(tester);
    SessaoUsuario.atual.definirIdentidade(
      nome: 'Ana Souza',
      email: 'ana.souza@pucminas.edu.br',
    );
    addTearDown(SessaoUsuario.atual.limpar);
    final backend = _FeedBackendFake();
    final client = MockClient(backend.responder);
    addTearDown(client.close);

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Compartilhe algo com a comunidade...'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField).first,
      'Minha primeira dica para a turma.',
    );
    await tester.pump();
    await tester.tap(find.text('Publicar'));
    await tester.pumpAndSettle();

    expect(find.text('Minha primeira dica para a turma.'), findsOneWidget);
    expect(find.text('Ana Souza'), findsWidgets);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(backend.publicacoes, hasLength(1));
    expect(backend.publicacoes.single['autor'], 'Ana Souza');
    expect(
      backend.publicacoes.single['texto'],
      'Minha primeira dica para a turma.',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('curtida e comentario sao confirmados pelo backend', (
    tester,
  ) async {
    configurarTela(tester);
    final backend = _FeedBackendFake()
      ..adicionarPublicacao('Uma dica real criada por uma pessoa.');
    final client = MockClient(backend.responder);
    addTearDown(client.close);

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byTooltip('Curtir'));
    await tester.tap(find.byTooltip('Curtir'));
    await tester.pumpAndSettle();

    expect(find.text('1 curtidas'), findsOneWidget);
    expect(backend.curtidas, 1);

    await tester.tap(find.byTooltip('Comentar'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField).last,
      'Comentário salvo de verdade.',
    );
    await tester.tap(find.byIcon(Icons.send_rounded));
    await tester.pumpAndSettle();

    expect(find.text('Comentário salvo de verdade.'), findsOneWidget);
    expect(backend.comentarios, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('com token do aluno o feed não envia x-user-id', (tester) async {
    configurarTela(tester);
    SessaoUsuario.atual.configurarApi(ParticipacoesApi()..accessToken = 'tk');
    addTearDown(SessaoUsuario.atual.limpar);
    final pedidos = <http.Request>[];
    final client = MockClient((request) async {
      pedidos.add(request);
      return http.Response('[]', 200);
    });
    addTearDown(client.close);

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    expect(pedidos, isNotEmpty);
    expect(pedidos.first.headers['authorization'], 'Bearer tk');
    expect(pedidos.first.headers.containsKey('x-user-id'), isFalse);
  });
}

class _FeedBackendFake {
  final List<Map<String, dynamic>> publicacoes = [];
  int _proximoId = 1;

  int get curtidas => publicacoes.fold<int>(
    0,
    (total, item) => total + (item['curtidasPor'] as Set<String>).length,
  );

  int get comentarios => publicacoes.fold<int>(
    0,
    (total, item) => total + (item['comentariosTexto'] as List<String>).length,
  );

  void adicionarPublicacao(String texto) {
    publicacoes.add(_novoRegistro({'texto': texto}));
  }

  Future<http.Response> responder(http.Request request) async {
    final usuarioId = request.headers['x-user-id'] ?? 'visitante';
    expect(request.headers['x-user-id'], isNot('1'));

    if (request.method == 'GET' && request.url.path == '/publicacoes') {
      return _json(
        200,
        publicacoes.map((item) => _apresentar(item, usuarioId)).toList(),
      );
    }

    if (request.method == 'POST' && request.url.path == '/publicacoes') {
      final corpo = jsonDecode(request.body) as Map<String, dynamic>;
      final registro = _novoRegistro(corpo);
      publicacoes.insert(0, registro);
      return _json(201, _apresentar(registro, usuarioId));
    }

    final partes = request.url.pathSegments;
    if (partes.length == 3 && partes.first == 'publicacoes') {
      final id = int.parse(partes[1]);
      final registro = publicacoes.firstWhere((item) => item['id'] == id);
      final corpo = jsonDecode(request.body) as Map<String, dynamic>;

      if (request.method == 'POST' && partes.last == 'curtidas') {
        final curtidasPor = registro['curtidasPor'] as Set<String>;
        corpo['delta'] == 1
            ? curtidasPor.add(usuarioId)
            : curtidasPor.remove(usuarioId);
        return _json(201, _apresentar(registro, usuarioId));
      }

      if (request.method == 'POST' && partes.last == 'comentarios') {
        (registro['comentariosTexto'] as List<String>).add(
          corpo['texto'] as String,
        );
        return _json(201, _apresentar(registro, usuarioId));
      }
    }

    return _json(404, {'message': 'Não encontrado'});
  }

  Map<String, dynamic> _novoRegistro(Map<String, dynamic> corpo) => {
    'id': _proximoId++,
    'autor': corpo['autor'] ?? '',
    'iniciais': corpo['iniciais'] ?? '',
    'descricaoAutor': corpo['descricaoAutor'] ?? '',
    'tempo': 'agora',
    'categoria': corpo['categoria'] ?? 'Dicas acadêmicas',
    'texto': corpo['texto'],
    'imagens': corpo['imagens'] ?? <String>[],
    'ownerId': '1',
    'curtidasPor': <String>{},
    'comentariosTexto': <String>[],
  };

  Map<String, dynamic> _apresentar(
    Map<String, dynamic> registro,
    String usuarioId,
  ) {
    final curtidasPor = registro['curtidasPor'] as Set<String>;
    final comentariosTexto = registro['comentariosTexto'] as List<String>;
    return {
      'id': registro['id'],
      'autor': registro['autor'],
      'iniciais': registro['iniciais'],
      'descricaoAutor': registro['descricaoAutor'],
      'tempo': registro['tempo'],
      'categoria': registro['categoria'],
      'texto': registro['texto'],
      'imagens': registro['imagens'],
      'curtidas': curtidasPor.length,
      'curtidoPeloUsuario': curtidasPor.contains(usuarioId),
      'comentarios': comentariosTexto.length,
      'comentariosTexto': comentariosTexto,
      'isOwn': registro['ownerId'] == usuarioId,
    };
  }

  http.Response _json(int status, Object corpo) => http.Response(
    jsonEncode(corpo),
    status,
    headers: {'content-type': 'application/json'},
  );
}
