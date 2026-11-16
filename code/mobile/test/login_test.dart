import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:ajuda_ai/coordenacao/tela_coordenacao.dart';
import 'package:ajuda_ai/main.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_cadastro.dart';
import 'package:ajuda_ai/tela_home.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:ajuda_ai/tela_login.dart';
import 'package:ajuda_ai/widgets/campos_cadastro.dart';

String _encode(Object? value) => jsonEncode(value).replaceAllMapped(
  RegExp(r'[^\x00-\x7f]'),
  (m) => '\\u${m[0]!.codeUnitAt(0).toRadixString(16).padLeft(4, '0')}',
);

http.Response? _consultaAluno(http.Request request) {
  if (request.method != 'GET') return null;
  final sessao = SessaoUsuario.atual;
  if (request.url.path == '/participacoes/programas') {
    return http.Response(
      _encode([
        {
          'codigo': '2026/2',
          'titulo': 'Programa 2026/2',
          'atual': true,
          'inscricoesDisponiveis': true,
        },
      ]),
      200,
    );
  }
  if (request.url.path == '/participacoes/situacao') {
    return http.Response(
      _encode({
        'situacao': 'nenhuma',
        'programa': {'codigo': '2026/2', 'titulo': 'Programa 2026/2'},
        'registro': null,
      }),
      200,
    );
  }
  if (request.url.path == '/me/foto') return http.Response('{"url":null}', 200);
  if (request.url.path == '/me' && sessao.identidade != null) {
    return http.Response(
      _encode({
        'nome': sessao.identidade!.nome,
        'email': sessao.identidade!.email,
        'curso': 'Sistemas de Informação',
        'periodo': 3,
        'interesses': [],
      }),
      200,
    );
  }
  return null;
}

void main() {
  testWidgets('o botão Microsoft não abre o cadastro nem usa a Camila', (
    tester,
  ) async {
    await tester.pumpWidget(const AjudaAiApp());
    await tester.tap(find.text('Entrar com a Microsoft'));
    await tester.pumpAndSettle();

    expect(find.text('Login Microsoft indisponível'), findsOneWidget);
    expect(find.byType(CadastroPage), findsNothing);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(find.text('camila@pucminas.edu.br'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tela de login mostra a chamada e o botão', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AjudaAiApp());

    expect(find.text('Bem-vindo!'), findsOneWidget);
    expect(find.text('Entrar com a Microsoft'), findsOneWidget);
  });

  testWidgets('layout em dois tamanhos de tela', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(351, 733);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 24);
    tester.view.viewPadding = const FakeViewPadding(top: 24, bottom: 24);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);

    final inter = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter-Variable.ttf'));
    await inter.load();
    final poppins = FontLoader('Poppins')
      ..addFont(rootBundle.load('assets/fonts/Poppins-ExtraBold.ttf'));
    await poppins.load();
    await tester.pumpWidget(const AjudaAiApp());
    await tester.pumpAndSettle();

    final subtitle = find.textContaining('Entre com sua conta institucional');
    final paragraph = tester.renderObject<RenderParagraph>(subtitle);
    final painter = TextPainter(
      text: paragraph.text,
      textDirection: paragraph.textDirection,
      textScaler: paragraph.textScaler,
    )..layout(maxWidth: paragraph.size.width);
    expect(painter.computeLineMetrics().length, greaterThanOrEqualTo(2));
    painter.dispose();
    expect(tester.widget<Text>(subtitle).style?.fontFamily, 'Inter');

    final photo = find.byWidgetPredicate(
      (widget) =>
          widget is Image &&
          widget.image is AssetImage &&
          (widget.image as AssetImage).assetName ==
              'assets/images/pucjardim.png',
    );
    final microsoft = tester.getRect(find.byType(FilledButton));
    final demo = tester.getRect(find.text('Entrar como usuário de teste'));
    final photoRect = tester.getRect(photo);
    expect(microsoft.bottom, lessThan(demo.top));
    expect(demo.bottom, lessThan(photoRect.top));
    expect(microsoft.left, inInclusiveRange(21, 23));
    expect(microsoft.width, inInclusiveRange(305, 309));
    expect(microsoft.height, 50);
    expect(
      tester
          .widget<Text>(find.text('Entrar com a Microsoft'))
          .style
          ?.fontFamily,
      'Inter',
    );
    expect(tester.takeException(), isNull);

    tester.view.physicalSize = const Size(400, 800);
    await tester.pumpWidget(const AjudaAiApp());
    await tester.pumpAndSettle();
    final widerButton = tester.getRect(find.byType(FilledButton));
    expect(widerButton.height, inInclusiveRange(55, 57));
    expect(widerButton.left, inInclusiveRange(24, 27));
    expect(tester.takeException(), isNull);
  });

  testWidgets('usuário já cadastrado entra na home e não abre o cadastro', (
    tester,
  ) async {
    addTearDown(SessaoUsuario.atual.limpar);
    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      if (request.url.path == '/auth/login') {
        return http.Response(
          _encode({
            'situacao': 'autenticado',
            'accessToken': 'jwt-normal',
            'usuario': {
              'nome': 'Ana Souza',
              'email': 'ana.souza@pucminas.edu.br',
              'perfil': 'apadrinhado',
              'curso': 'Sistemas de Informação',
              'periodo': 1,
            },
          }),
          201,
        );
      }
      if (request.url.path == '/me') {
        return http.Response(
          _encode({
            'nome': 'Ana Souza',
            'email': 'ana.souza@pucminas.edu.br',
            'perfil': 'apadrinhado',
            'curso': 'Sistemas de Informação',
            'periodo': 1,
          }),
          200,
        );
      }
      return http.Response('{}', 404);
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(
          client: client,
          baseUrl: 'http://localhost',
          obterIdToken: () async => 'id-token-microsoft',
        ),
      ),
    );
    await tester.tap(find.text('Entrar com a Microsoft'));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.byType(CadastroPage), findsNothing);
    expect(find.text('Ana Souza'), findsWidgets);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(SessaoUsuario.atual.accessToken, 'jwt-normal');
    expect(SessaoUsuario.atual.onboardingToken, isNull);
  });

  testWidgets('primeiro acesso abre o cadastro com e-mail bloqueado', (
    tester,
  ) async {
    addTearDown(SessaoUsuario.atual.limpar);
    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      expect(jsonDecode(request.body)['idToken'], 'id-token-microsoft');
      return http.Response(
        _encode({
          'situacao': 'onboarding',
          'onboardingToken': 'onboarding-curto',
          'identidade': {
            'nome': 'Gabriel Lacerda',
            'email': 'gabriel@pucminas.edu.br',
          },
        }),
        201,
      );
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(
          client: client,
          baseUrl: 'http://localhost',
          obterIdToken: () async => 'id-token-microsoft',
        ),
      ),
    );
    await tester.tap(find.text('Entrar com a Microsoft'));
    await tester.pumpAndSettle();

    expect(find.byType(CadastroPage), findsOneWidget);
    expect(find.text('Gabriel Lacerda'), findsOneWidget);
    expect(find.text('gabriel@pucminas.edu.br'), findsOneWidget);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(
      tester.widget<CampoTexto>(find.byType(CampoTexto).at(1)).bloqueado,
      isTrue,
    );
    expect(SessaoUsuario.atual.onboardingToken, 'onboarding-curto');
    expect(SessaoUsuario.atual.accessToken, isNull);
  });

  testWidgets('modo demo aparece em desenvolvimento e some fora dele', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: LoginPage()));
    expect(find.text('Entrar com a Microsoft'), findsOneWidget);
    expect(find.text('Modo de desenvolvimento'), findsOneWidget);
    expect(find.text('Entrar como usuário de teste'), findsOneWidget);

    await tester.pumpWidget(
      const MaterialApp(home: LoginPage(modoDemo: false)),
    );
    expect(find.text('Entrar com a Microsoft'), findsOneWidget);
    expect(find.text('Entrar como usuário de teste'), findsNothing);
    expect(find.text('Área da coordenação'), findsNothing);
  });

  testWidgets('usuário demo entra sem passar pela Microsoft', (tester) async {
    addTearDown(SessaoUsuario.atual.limpar);
    final caminhos = <String>[];
    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      caminhos.add(request.url.path);
      final corpo = jsonDecode(request.body) as Map<String, dynamic>;
      expect(corpo.containsKey('idToken'), isFalse);
      expect(corpo['email'], 'camila@pucminas.edu.br');
      return http.Response(
        _encode({
          'situacao': 'autenticado',
          'accessToken': 'jwt-camila',
          'usuario': {
            'nome': 'Camila Duarte',
            'email': 'camila@pucminas.edu.br',
            'perfil': 'apadrinhado',
            'curso': 'Engenharia de Software',
            'periodo': 1,
          },
        }),
        201,
      );
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(client: client, baseUrl: 'http://localhost'),
      ),
    );
    await tester.tap(find.text('Entrar como usuário de teste'));
    await tester.pumpAndSettle();
    expect(find.text('NÍVEIS 1 A 10'), findsOneWidget);
    // Cada conta mostra o cenário que permite testar.
    expect(find.text('Nível 1 · 0 XP · 0 moedas'), findsOneWidget);
    await tester.ensureVisible(find.text('Camila Duarte'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Camila Duarte'));
    await tester.pumpAndSettle();

    expect(caminhos, ['/auth/login-demo']);
    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.byType(CadastroPage), findsNothing);
    expect(find.byType(TelaCoordenacao), findsNothing);
    expect(find.text('Camila Duarte'), findsWidgets);
    expect(SessaoUsuario.atual.accessToken, 'jwt-camila');
    expect(SessaoUsuario.atual.identidade?.email, 'camila@pucminas.edu.br');
  });

  testWidgets('padrinho demo abre a home do aluno', (tester) async {
    addTearDown(SessaoUsuario.atual.limpar);
    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      expect(request.url.path, '/auth/login-demo');
      return http.Response(
        _encode({
          'accessToken': 'jwt-thiago',
          'usuario': {
            'nome': 'Thiago Moreira',
            'email': 'thiago@pucminas.edu.br',
            'perfil': 'padrinho',
          },
        }),
        201,
      );
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(client: client, baseUrl: 'http://localhost'),
      ),
    );
    await tester.tap(find.text('Entrar como usuário de teste'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Thiago Moreira'), 120);
    await tester.tap(find.text('Thiago Moreira'));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.byType(TelaCoordenacao), findsNothing);
    expect(find.text('Thiago Moreira'), findsWidgets);
    expect(SessaoUsuario.atual.accessToken, 'jwt-thiago');
  });

  testWidgets('coordenadora demo abre a área da coordenação', (tester) async {
    tester.view.physicalSize = const Size(400, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(SessaoUsuario.atual.limpar);
    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      if (request.url.path == '/auth/login-demo') {
        return http.Response(
          _encode({
            'accessToken': 'jwt-renata',
            'usuario': {
              'nome': 'Renata Martins',
              'email': 'renata@pucminas.edu.br',
              'perfil': 'coordenador',
            },
          }),
          201,
        );
      }
      return http.Response('{}', 200);
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(client: client, baseUrl: 'http://localhost'),
      ),
    );
    await tester.tap(find.text('Entrar como usuário de teste'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('CENÁRIOS'), 120);
    await tester.scrollUntilVisible(find.text('Renata Martins'), 120);
    expect(find.text('COORDENAÇÃO'), findsOneWidget);
    await tester.tap(find.text('Renata Martins'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(TelaCoordenacao), findsOneWidget);
    expect(find.byType(HomePage), findsNothing);
    expect(find.byType(CadastroPage), findsNothing);
  });

  testWidgets('sair da coordenação limpa a sessão e permite outro demo', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(SessaoUsuario.atual.limpar);

    SessaoUsuario.atual.assumirSessao(
      accessToken: 'jwt-antigo',
      nome: 'Renata Martins',
      email: 'renata@pucminas.edu.br',
      curso: 'Engenharia de Software',
    );

    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      if (request.url.path == '/auth/login-demo') {
        final email = (jsonDecode(request.body) as Map)['email'];
        final renata = email == 'renata@pucminas.edu.br';
        return http.Response(
          _encode({
            'accessToken': renata ? 'jwt-renata' : 'jwt-thiago',
            'usuario': {
              'nome': renata ? 'Renata Martins' : 'Thiago Moreira',
              'email': email,
              'perfil': renata ? 'coordenador' : 'padrinho',
            },
          }),
          201,
        );
      }
      expect(request.headers['authorization'], isNot('Bearer jwt-antigo'));
      return http.Response('{}', 200);
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: TelaCoordenacao(client: client, baseUrl: 'http://localhost'),
      ),
    );
    await tester.pumpAndSettle();
    expect(SessaoUsuario.atual.accessToken, 'jwt-antigo');

    await tester.tap(find.text('Mais'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Sair da área da coordenação'),
      200,
    );
    await tester.tap(find.text('Sair da área da coordenação'));
    await tester.pumpAndSettle();

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.byType(TelaCoordenacao), findsNothing);
    expect(SessaoUsuario.atual.accessToken, isNull);
    expect(SessaoUsuario.atual.identidade, isNull);
    expect(SessaoUsuario.atual.onboardingToken, isNull);

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    expect(await navigator.maybePop(), isFalse);
    await tester.pumpAndSettle();
    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.byType(TelaCoordenacao), findsNothing);

    await tester.tap(find.text('Entrar como usuário de teste'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thiago Moreira'));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.byType(TelaCoordenacao), findsNothing);
    expect(find.text('Thiago Moreira'), findsWidgets);
    expect(SessaoUsuario.atual.accessToken, 'jwt-thiago');
  });

  testWidgets('falha de rede do demo mostra mensagem amigável', (tester) async {
    final client = MockClient((request) async {
      final consulta = _consultaAluno(request);
      if (consulta != null) return consulta;
      throw TimeoutException('after 0:00:04.000000');
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      MaterialApp(
        home: LoginPage(client: client, baseUrl: 'http://10.0.2.2:3000'),
      ),
    );
    await tester.tap(find.text('Entrar como usuário de teste'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Camila Duarte'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.textContaining('TimeoutException'), findsNothing);
    expect(
      find.textContaining('Não foi possível conectar ao servidor'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Verifique se a API está rodando'),
      findsOneWidget,
    );
  });
}
