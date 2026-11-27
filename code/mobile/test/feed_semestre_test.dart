import 'dart:convert';

import 'package:ajuda_ai/tela_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Feed da coordenação com dois semestres: o atual e 2026/1.
class _Backend {
  final pedidos = <String>[];
  bool semCiclos = false;

  http.Response _json(Object corpo, [int status = 200]) => http.Response(
    jsonEncode(corpo),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  Map<String, dynamic> _post(int id, String texto, {required bool atual}) => {
    'id': id,
    'autor': 'Renata Martins',
    'iniciais': 'RM',
    'descricaoAutor': 'Coordenação do programa',
    'tempo': 'agora',
    'categoria': 'Comunicados',
    'texto': texto,
    'imagens': <String>[],
    'midias': <String>[],
    'curtidas': 0,
    'curtidoPeloUsuario': false,
    'comentarios': 0,
    'podeAdministrar': true,
    'podeExcluir': true,
    'cicloAtual': atual,
    'podeInteragir': atual,
    'comentariosDetalhes': <Object>[],
  };

  Future<http.Response> responder(http.Request r) async {
    pedidos.add(
      '${r.method} ${r.url.path}${r.url.hasQuery ? '?${r.url.query}' : ''}',
    );
    final caminho = r.url.path;
    if (caminho == '/publicacoes/permissoes') {
      return _json({
        'podeLer': true,
        'podePublicar': true,
        'podeAdministrar': true,
        'podeInteragir': true,
      });
    }
    if (caminho == '/publicacoes/ciclos') {
      if (semCiclos) return _json({'message': 'x'}, 500);
      return _json({
        'atual': '2026/2',
        'semestres': ['2026/2', '2026/1'],
      });
    }
    if (caminho == '/publicacoes') {
      return _json(
        r.url.queryParameters['programa'] == '2026/1'
            ? [_post(1, 'Aviso do semestre passado', atual: false)]
            : [_post(2, 'Aviso do semestre atual', atual: true)],
      );
    }
    return _json({'message': 'rota não simulada'}, 404);
  }
}

void main() {
  void configurarTela(WidgetTester tester) {
    tester.view.physicalSize = const Size(390, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Future<_Backend> abrir(WidgetTester tester, {bool coordenacao = true}) async {
    configurarTela(tester);
    final backend = _Backend();
    final client = MockClient(backend.responder);
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(
        home: FeedPage(
          accessToken: 'coord',
          nomeAutor: 'Renata Martins',
          coordenacao: coordenacao,
          client: client,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return backend;
  }

  testWidgets('coordenação vê o seletor com o semestre atual e os anteriores', (
    tester,
  ) async {
    await abrir(tester);
    expect(find.byKey(const ValueKey('semestre-2026/2')), findsOneWidget);
    expect(find.byKey(const ValueKey('semestre-2026/1')), findsOneWidget);
    expect(find.text('2026/2 · atual'), findsOneWidget);
    expect(find.text('Aviso do semestre atual'), findsOneWidget);
  });

  testWidgets(
    'escolher o semestre anterior carrega só aquele, em modo leitura',
    (tester) async {
      final backend = await abrir(tester);
      expect(find.text('Compartilhe algo com a comunidade...'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('semestre-2026/1')));
      await tester.pumpAndSettle();
      expect(backend.pedidos, contains('GET /publicacoes?programa=2026%2F1'));
      expect(find.text('Aviso do semestre passado'), findsOneWidget);
      expect(find.text('Aviso do semestre atual'), findsNothing);
      // Somente consulta: sem criar publicação e sem curtir/comentar.
      expect(find.text('Compartilhe algo com a comunidade...'), findsNothing);
      expect(find.byTooltip('Curtir'), findsNothing);
      expect(find.textContaining('somente consulta'), findsOneWidget);
      // O menu só oferece apagar (editar fica para o semestre atual).
      await tester.tap(find.byTooltip('Mais opções'));
      await tester.pumpAndSettle();
      expect(find.text('Apagar publicação'), findsOneWidget);
      expect(find.text('Editar publicação'), findsNothing);
    },
  );

  testWidgets('voltar ao semestre atual restaura o feed completo', (
    tester,
  ) async {
    final backend = await abrir(tester);
    await tester.tap(find.byKey(const ValueKey('semestre-2026/1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('semestre-2026/2')));
    await tester.pumpAndSettle();
    expect(find.text('Aviso do semestre atual'), findsOneWidget);
    expect(find.text('Compartilhe algo com a comunidade...'), findsOneWidget);
    // Voltar ao atual não manda o parâmetro de semestre.
    expect(backend.pedidos.last, isNot(contains('programa=')));
  });

  testWidgets('quem não é coordenação não vê seletor nem pede semestres', (
    tester,
  ) async {
    final backend = await abrir(tester, coordenacao: false);
    expect(find.byKey(const ValueKey('semestre-2026/1')), findsNothing);
    expect(backend.pedidos.any((p) => p.contains('/ciclos')), isFalse);
  });

  testWidgets('sem a lista de semestres o feed atual segue funcionando', (
    tester,
  ) async {
    configurarTela(tester);
    final backend = _Backend()..semCiclos = true;
    final client = MockClient(backend.responder);
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(
        home: FeedPage(
          accessToken: 'coord',
          nomeAutor: 'Renata',
          coordenacao: true,
          client: client,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('semestre-2026/1')), findsNothing);
    expect(find.text('Aviso do semestre atual'), findsOneWidget);
  });
}
