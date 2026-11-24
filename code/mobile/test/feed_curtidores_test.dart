import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/tela_feed.dart';
import 'package:ajuda_ai/widgets/feed_curtidores_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Curtidor c(String nome, {bool coordenacao = false}) =>
    Curtidor(nome: nome, coordenacao: coordenacao);

/// Backend mínimo com posts de 0, 1, 2 e 5 curtidas e resposta controlável.
class _Backend {
  final pedidos = <String>[];
  bool falharCurtidores = false;

  /// Se definido, a lista de curtidores só responde quando completado.
  Completer<void>? segurar;

  /// Se definido, o POST de curtir só responde quando completado.
  Completer<void>? segurarCurtir;

  http.Response _json(Object corpo, [int status = 200]) => http.Response(
    jsonEncode(corpo),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  static const _nomes = [
    'Camila Duarte',
    'Thiago Moreira',
    'Ana Souza',
    'Pedro Santos',
    'Lucas Almeida',
  ];

  Map<String, dynamic> _post(int id, int curtidas) => {
    'id': id,
    'autor': 'Renata Martins',
    'iniciais': 'RM',
    'descricaoAutor': 'Coordenação do programa',
    'tempo': 'agora',
    'categoria': 'Comunicados',
    'texto': 'Post $id',
    'imagens': <String>[],
    'midias': <String>[],
    'curtidas': curtidas,
    'curtidoPeloUsuario': false,
    'comentarios': 0,
    'podeAdministrar': false,
    'podeInteragir': true,
    'curtidoresRecentes': [
      for (var i = 0; i < curtidas && i < 3; i++) {'nome': _nomes[i]},
    ],
    'comentariosDetalhes': <Object>[],
  };

  Future<http.Response> responder(http.Request r) async {
    final caminho = r.url.path;
    pedidos.add('${r.method} $caminho');
    if (caminho == '/publicacoes/permissoes') {
      return _json({
        'podeLer': true,
        'podePublicar': false,
        'podeAdministrar': false,
        'podeInteragir': true,
      });
    }
    if (caminho == '/publicacoes') {
      return _json([_post(1, 0), _post(2, 1), _post(3, 2), _post(4, 5)]);
    }
    final m = RegExp(r'^/publicacoes/(\d+)/curtidas$').firstMatch(caminho);
    if (m != null && r.method == 'GET') {
      if (segurar != null) await segurar!.future;
      if (falharCurtidores) return _json({'message': 'x'}, 500);
      final n = {1: 0, 2: 1, 3: 2, 4: 5}[int.parse(m.group(1)!)]!;
      return _json([
        for (var i = 0; i < n; i++)
          {
            'autor': {'id': 'u$i', 'nome': _nomes[i]},
            'curtidoEm': '2026-11-15T20:0$i:00Z',
            'coordenacao': i == 0,
          },
      ]);
    }
    if (m != null && r.method == 'POST') {
      if (segurarCurtir != null) await segurarCurtir!.future;
      return _json(_post(int.parse(m.group(1)!), 6));
    }
    return _json({'message': 'rota não simulada'}, 404);
  }
}

void main() {
  group('textoCurtidoPor', () {
    test('nenhuma curtida: sem linha', () {
      expect(textoCurtidoPor(const [], 0), isNull);
    });
    test('uma: nome completo', () {
      expect(
        textoCurtidoPor([c('Camila Duarte')], 1),
        'Curtido por Camila Duarte',
      );
    });
    test('duas: dois primeiros nomes', () {
      expect(
        textoCurtidoPor([c('Camila Duarte'), c('Thiago Moreira')], 2),
        'Curtido por Camila e Thiago',
      );
    });
    test('três ou mais: primeiro nome e as demais', () {
      expect(
        textoCurtidoPor([c('Camila Duarte'), c('Ana'), c('Pedro')], 3),
        'Curtido por Camila e outras 2 pessoas',
      );
      expect(
        textoCurtidoPor([c('Camila Duarte')], 12),
        'Curtido por Camila e outras 11 pessoas',
      );
    });
    test('sem nomes disponíveis: contagem, sem inventar', () {
      expect(textoCurtidoPor(const [], 1), '1 curtida');
      expect(textoCurtidoPor(const [], 7), '7 curtidas');
      expect(textoCurtidoPor([c('Camila')], 2), '2 curtidas');
    });
  });

  void configurarTela(WidgetTester tester) {
    tester.view.physicalSize = const Size(390, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  Future<_Backend> abrir(WidgetTester tester) async {
    configurarTela(tester);
    final backend = _Backend();
    final client = MockClient(backend.responder);
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(
        home: FeedPage(client: client, accessToken: 'jwt-aluno-teste'),
      ),
    );
    await tester.pumpAndSettle();
    return backend;
  }

  Finder linha(String texto) => find.text(texto);

  testWidgets('cartões mostram "Curtido por" sem pedir nomes por post', (
    tester,
  ) async {
    final backend = await abrir(tester);
    // Nenhuma curtida: sem linha. Demais: texto do payload do feed.
    expect(find.textContaining('Curtido por'), findsNWidgets(3));
    expect(linha('Curtido por Camila Duarte'), findsOneWidget);
    expect(linha('Curtido por Camila e Thiago'), findsOneWidget);
    expect(linha('Curtido por Camila e outras 4 pessoas'), findsOneWidget);
    // Só listagem e permissões: nada de GET .../curtidas por post.
    expect(backend.pedidos.where((p) => p.contains('/curtidas')), isEmpty);
  });

  testWidgets('altura inicial pela contagem: 1 curtida abre compacta', (
    tester,
  ) async {
    final backend = await abrir(tester);
    backend.segurar = Completer<void>();
    await tester.tap(linha('Curtido por Camila Duarte'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final folha = find.byType(FolhaCurtidores);
    final alturaCarregando = tester.getSize(folha).height;
    // Compacta (cabeçalho + 1 linha), muito longe de ocupar a tela.
    expect(alturaCarregando, lessThan(260));
    expect(find.byKey(const ValueKey('esqueleto-curtidor')), findsOneWidget);
    expect(find.text('Quem curtiu'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    // Dados chegam: a altura não muda (1 esqueleto → 1 linha).
    backend.segurar!.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('esqueleto-curtidor')), findsNothing);
    expect(find.text('Camila Duarte'), findsWidgets);
    expect(tester.getSize(folha).height, closeTo(alturaCarregando, 1));
  });

  testWidgets('muitas curtidas: altura limitada e proporcional à tela', (
    tester,
  ) async {
    final backend = await abrir(tester);
    backend.segurar = Completer<void>();
    await tester.ensureVisible(linha('Curtido por Camila e outras 4 pessoas'));
    await tester.tap(linha('Curtido por Camila e outras 4 pessoas'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final altura = tester.getSize(find.byType(FolhaCurtidores)).height;
    expect(altura, lessThanOrEqualTo(2000 * 0.65 + 1));
    expect(find.byKey(const ValueKey('esqueleto-curtidor')), findsNWidgets(5));
    backend.segurar!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Lucas Almeida'), findsOneWidget);
    expect(find.text('Coordenação'), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('total-curtidas'))).data,
      '5',
    );
  });

  testWidgets('abrir a lista não recarrega o feed nem dispara outros pedidos', (
    tester,
  ) async {
    final backend = await abrir(tester);
    final antes = backend.pedidos.length;
    await tester.tap(linha('Curtido por Camila e Thiago'));
    await tester.pumpAndSettle();
    expect(backend.pedidos.skip(antes), ['GET /publicacoes/3/curtidas']);
    // Fecha tocando fora.
    await tester.tapAt(const Offset(195, 40));
    await tester.pumpAndSettle();
    expect(find.byType(FolhaCurtidores), findsNothing);
    expect(backend.pedidos.length, antes + 1);
  });

  testWidgets('falha de rede: erro com tentar de novo na mesma altura', (
    tester,
  ) async {
    final backend = await abrir(tester);
    backend.falharCurtidores = true;
    await tester.tap(linha('Curtido por Camila e Thiago'));
    await tester.pumpAndSettle();
    expect(find.text('Não foi possível carregar quem curtiu.'), findsOneWidget);
    backend.falharCurtidores = false;
    await tester.tap(find.text('Tentar de novo'));
    await tester.pumpAndSettle();
    expect(find.text('Thiago Moreira'), findsWidgets);
  });

  testWidgets('abre e fecha rápido: resposta tardia não mexe em nada', (
    tester,
  ) async {
    final backend = await abrir(tester);
    backend.segurar = Completer<void>();
    await tester.tap(linha('Curtido por Camila Duarte'));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tapAt(const Offset(195, 40));
    await tester.pumpAndSettle();
    expect(find.byType(FolhaCurtidores), findsNothing);
    // Outra publicação em seguida.
    backend.segurar = Completer<void>();
    await tester.tap(linha('Curtido por Camila e Thiago'));
    await tester.pump(const Duration(milliseconds: 50));
    backend.segurar!.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(FolhaCurtidores), findsOneWidget);
    expect(find.text('Thiago Moreira'), findsWidgets);
  });

  testWidgets('reabrir mostra a lista anterior na hora e revalida por baixo', (
    tester,
  ) async {
    final backend = await abrir(tester);
    await tester.tap(linha('Curtido por Camila e Thiago'));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(195, 40));
    await tester.pumpAndSettle();
    backend.segurar = Completer<void>();
    await tester.tap(linha('Curtido por Camila e Thiago'));
    await tester.pump(const Duration(milliseconds: 300));
    // Resposta ainda segurada, mas a lista em cache já aparece (sem esqueleto).
    expect(find.byKey(const ValueKey('esqueleto-curtidor')), findsNothing);
    expect(find.text('Thiago Moreira'), findsWidgets);
    backend.segurar!.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('curtir antes de abrir: linha cai para contagem até o servidor', (
    tester,
  ) async {
    final backend = await abrir(tester);
    backend.segurarCurtir = Completer<void>();
    // Post 2 tem 1 curtida (Camila). Curtir mais uma: servidor devolve 6.
    final coracoes = find.byTooltip('Curtir');
    await tester.ensureVisible(coracoes.at(1));
    await tester.tap(coracoes.at(1));
    await tester.pump();
    // Otimista: contagem 2 e nomes ainda não coerentes → "2 curtidas".
    expect(find.text('2 curtidas'), findsOneWidget);
    backend.segurarCurtir!.complete();
    await tester.pumpAndSettle();
    // Servidor confirmou (6 curtidas): volta a mostrar nomes do payload.
    expect(find.text('Curtido por Camila e outras 5 pessoas'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('coração e linha são alvos de toque independentes', (
    tester,
  ) async {
    final backend = await abrir(tester);
    final coracao = tester.getRect(find.byTooltip('Curtir').first);
    expect(coracao.height, greaterThanOrEqualTo(48));
    expect(coracao.width, greaterThanOrEqualTo(48));
    final linhaRect = tester.getRect(linha('Curtido por Camila Duarte'));
    expect(coracao.overlaps(linhaRect), isFalse);
    // Tocar na linha abre a lista e nunca descurte.
    await tester.tap(linha('Curtido por Camila Duarte'));
    await tester.pumpAndSettle();
    expect(backend.pedidos.any((p) => p.startsWith('POST')), isFalse);
    expect(find.byType(FolhaCurtidores), findsOneWidget);
  });
}
