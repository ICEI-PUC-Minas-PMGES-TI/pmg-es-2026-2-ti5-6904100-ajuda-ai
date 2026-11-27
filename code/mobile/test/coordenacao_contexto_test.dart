import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ajuda_ai/coordenacao/tela_coordenacao.dart';
import 'package:ajuda_ai/services/auth_api.dart';
import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_login.dart';
import 'package:ajuda_ai/tela_entrada_aluno.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const erroAmbiguo =
    'Informe explicitamente o programa para consultar sua situação.';
const renata = SessaoAuth(
  accessToken: 'jwt-renata',
  usuario: {
    'nome': 'Renata Martins',
    'email': 'renata@pucminas.edu.br',
    'perfil': 'coordenador',
  },
);
Map<String, dynamic> ciclo(String codigo) => {
  'codigo': codigo,
  'titulo': 'Programa $codigo',
  'vigente': codigo == '2026/2',
};

class BackendCoord {
  List<Map<String, dynamic>> programas = [ciclo('2026/2')];
  bool offline = false;
  bool dashboardOffline = false;
  final indisponiveis = <String>{};
  final chamadas = <http.Request>[];
  Completer<http.Response>? respostaAntiga;
  http.Response json(Object? value, [int status = 200]) => http.Response(
    jsonEncode(value),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
  List<http.Request> pedidos(String path) =>
      chamadas.where((r) => r.url.path == path).toList();
  http.Response dashboard(String codigo) {
    final dados = jsonDecode(
      File('test/fixtures/coordenacao_dashboard.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    dados['programa'] = {...dados['programa'] as Map, ...ciclo(codigo)};
    dados['programas'] = programas;
    (dados['indicadores']['candidaturasPendentes'] as Map)['detalhe'] =
        'Pendências do ciclo $codigo';
    return json(dados);
  }

  late final client = MockClient((r) async {
    chamadas.add(r);
    final path = r.url.path;
    if (path == '/auth/login-demo') {
      return json({
        'accessToken': renata.accessToken,
        'usuario': renata.usuario,
      });
    }
    if (path == '/coordenacao/programas') {
      if (r.method == 'DELETE') {
        final codigo = r.url.queryParameters['codigo'];
        final confirmacao = (jsonDecode(r.body) as Map)['confirmacao'];
        if ('$confirmacao'.trim().toUpperCase() != 'COORDENADOR') {
          return json({'message': 'Confirmação inválida'}, 400);
        }
        programas = programas.where((p) => p['codigo'] != codigo).toList();
        return json({'codigo': codigo, 'excluido': true});
      }

      if (r.method == 'POST') {
        programas = [...programas, ciclo('2027/1')];
        return json(programas.last);
      }
      if (offline) throw http.ClientException('offline');
      return json(programas);
    }
    final programa = r.url.queryParameters['programa'];
    if (path == '/participacoes/situacao') {
      return programa == null
          ? json({'message': erroAmbiguo}, 400)
          : json({'situacao': 'nenhuma', 'programa': ciclo(programa)});
    }
    if (programa == null) return json({'message': erroAmbiguo}, 400);
    if (path == '/coordenacao/dashboard') {
      if (dashboardOffline) throw http.ClientException('offline');
      if (indisponiveis.contains(programa)) {
        return json({'message': 'Ciclo não cadastrado.'}, 404);
      }
      if (programa == '2026/1' && respostaAntiga != null) {
        return respostaAntiga!.future;
      }
      return dashboard(programa);
    }
    if (path.startsWith('/coordenacao/formularios/')) {
      return json({
        'tipo': path.split('/').last,
        'programa': programa,
        'publicado': false,
        'perguntas': [],
        'requisitos': [],
      });
    }
    return json([]);
  });
}

Future<void> abrir(WidgetTester tester, BackendCoord backend) async {
  tester.view.physicalSize = const Size(600, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: TelaCoordenacao(
        client: backend.client,
        baseUrl: 'http://localhost',
        sessaoAutenticada: renata,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> selecionar(
  WidgetTester tester,
  String codigo, {
  bool aguardar = true,
}) async {
  await tester.tap(find.byKey(const ValueKey('programa-coordenacao')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Programa $codigo').last);
  if (aguardar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

void main() {
  late BackendCoord backend;
  setUp(() {
    SessaoUsuario.atual.limpar();
    backend = BackendCoord();
  });
  tearDown(() {
    backend.client.close();
    SessaoUsuario.atual.limpar();
  });
  testWidgets(
    'único ciclo é resolvido antes de montar dashboard e candidaturas',
    (tester) async {
      await abrir(tester, backend);
      expect(backend.chamadas.first.url.path, '/coordenacao/programas');
      for (final path in [
        '/coordenacao/dashboard',
        '/coordenacao/candidaturas',
      ]) {
        expect(backend.pedidos(path), hasLength(1));
        expect(
          backend.pedidos(path).single.url.queryParameters['programa'],
          '2026/2',
        );
      }
      expect(find.text(erroAmbiguo), findsNothing);
      expect(find.text('Pendências do ciclo 2026/2'), findsOneWidget);
      expect(
        backend.chamadas.any((r) => r.url.path.startsWith('/participacoes')),
        isFalse,
      );
      expect(find.byType(EntradaAlunoPage), findsNothing);
    },
  );
  testWidgets(
    'ciclo vigente é selecionado e a coordenação pode consultar outro',
    (tester) async {
      backend.programas = [ciclo('2026/2'), ciclo('2026/1')];
      await abrir(tester, backend);
      expect(
        backend
            .pedidos('/coordenacao/dashboard')
            .last
            .url
            .queryParameters['programa'],
        '2026/2',
      );
      await selecionar(tester, '2026/1');
      expect(
        backend
            .pedidos('/coordenacao/dashboard')
            .last
            .url
            .queryParameters['programa'],
        '2026/1',
      );
      expect(
        backend
            .pedidos('/coordenacao/candidaturas')
            .last
            .url
            .queryParameters['programa'],
        '2026/1',
      );
    },
  );
  testWidgets(
    'troca de ciclo atualiza dashboard e lista sem restaurar dados antigos',
    (tester) async {
      backend.programas = [ciclo('2026/2'), ciclo('2026/1')];
      await abrir(tester, backend);
      await selecionar(tester, '2026/1');
      expect(find.text('Pendências do ciclo 2026/1'), findsOneWidget);
      await selecionar(tester, '2026/2');
      expect(find.text('Pendências do ciclo 2026/1'), findsNothing);
      expect(find.text('Pendências do ciclo 2026/2'), findsOneWidget);
      expect(
        backend
            .pedidos('/coordenacao/dashboard')
            .last
            .url
            .queryParameters['programa'],
        '2026/2',
      );
      expect(
        backend
            .pedidos('/coordenacao/candidaturas')
            .last
            .url
            .queryParameters['programa'],
        '2026/2',
      );
      await tester.tap(find.text('Candidaturas').last);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(const ValueKey('programa-coordenacao')),
            )
            .value,
        '2026/2',
      );
    },
  );
  testWidgets(
    'resposta atrasada do dashboard anterior não contamina o ciclo selecionado',
    (tester) async {
      backend.programas = [ciclo('2026/2'), ciclo('2026/1')];
      backend.respostaAntiga = Completer<http.Response>();
      await abrir(tester, backend);
      await selecionar(tester, '2026/1', aguardar: false);
      // O carregamento do dashboard não bloqueia o seletor do shell.
      await tester.tap(find.byKey(const ValueKey('programa-coordenacao')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('Programa 2026/2').last);
      await tester.pumpAndSettle();
      backend.respostaAntiga!.complete(backend.dashboard('2026/1'));
      await tester.pumpAndSettle();
      expect(find.text('Pendências do ciclo 2026/2'), findsOneWidget);
      expect(find.text('Pendências do ciclo 2026/1'), findsNothing);
    },
  );
  testWidgets('usuários, matching e formulários recebem o ciclo selecionado', (
    tester,
  ) async {
    await abrir(tester, backend);
    await tester.tap(find.text('Mais'));
    await tester.pumpAndSettle();
    for (final destino in ['Usuários', 'Matching automático', 'Formulários']) {
      await tester.tap(find.text(destino));
      await tester.pumpAndSettle();
      final paths = {
        'Usuários': '/coordenacao/usuarios',
        'Matching automático': '/coordenacao/matching',
        'Formulários': '/coordenacao/formularios/apadrinhado',
      };
      expect(
        backend.pedidos(paths[destino]!).last.url.queryParameters['programa'],
        '2026/2',
      );
      if (destino == 'Formulários') {
        await tester.tap(find.text('Padrinhos'));
        await tester.pumpAndSettle();
        expect(
          backend
              .pedidos('/coordenacao/formularios/padrinho')
              .last
              .url
              .queryParameters['programa'],
          '2026/2',
        );
      }
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Apadrinhados sem vínculo'));
    await tester.pumpAndSettle();
    final matching = backend.pedidos('/coordenacao/candidaturas').last;
    expect(matching.url.queryParameters, containsPair('programa', '2026/2'));
    expect(matching.url.queryParameters, containsPair('status', 'sem_vinculo'));
  });
  testWidgets(
    'novo ciclo retornado pela API é carregado e selecionado explicitamente',
    (tester) async {
      await abrir(tester, backend);
      await tester.scrollUntilVisible(
        find.text('Novo ciclo'),
        400,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Novo ciclo'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, '2027/1');
      await tester.tap(find.text('Revisar cronograma'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Confirmar criação'),
        400,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Confirmar criação'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(
                const ValueKey('programa-coordenacao'),
                skipOffstage: false,
              ),
            )
            .value,
        '2027/1',
      );
      expect(
        backend
            .pedidos('/coordenacao/dashboard')
            .last
            .url
            .queryParameters['programa'],
        '2027/1',
      );
      expect(
        backend
            .pedidos('/coordenacao/candidaturas')
            .last
            .url
            .queryParameters['programa'],
        '2027/1',
      );
    },
  );
  testWidgets(
    'Mais Programas administra o ciclo escolhido e propaga para dashboard/lista',
    (tester) async {
      backend.programas = [ciclo('2026/2'), ciclo('2026/1')];
      await abrir(tester, backend);
      await tester.tap(find.text('Mais'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Programas'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Administrar este programa').last);
      await tester.pumpAndSettle();
      expect(
        backend
            .pedidos('/coordenacao/dashboard')
            .last
            .url
            .queryParameters['programa'],
        '2026/1',
      );
      expect(
        backend
            .pedidos('/coordenacao/candidaturas')
            .last
            .url
            .queryParameters['programa'],
        '2026/1',
      );
    },
  );
  testWidgets(
    'excluir ciclo selecionado limpa contexto e exige seleção mesmo restando um',
    (tester) async {
      backend.programas = [ciclo('2026/2'), ciclo('2026/1')];
      await abrir(tester, backend);
      await selecionar(tester, '2026/2');
      await tester.tap(find.text('Mais'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Programas'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Mais ações do programa').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Excluir programa'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'COORDENADOR');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Excluir definitivamente'));
      await tester.pumpAndSettle();
      expect(
        find.text('Selecione um programa/ciclo para administrar.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<DropdownButton<String>>(
              find.byKey(const ValueKey('programa-coordenacao')),
            )
            .value,
        isNull,
      );
      expect(backend.programas.map((p) => p['codigo']), ['2026/1']);
      await selecionar(tester, '2026/1');
      expect(
        backend
            .pedidos('/coordenacao/dashboard')
            .last
            .url
            .queryParameters['programa'],
        '2026/1',
      );
    },
  );
  testWidgets(
    'programa inexistente mostra erro controlado e permite atualizar catálogo',
    (tester) async {
      backend.indisponiveis.add('2026/2');
      await abrir(tester, backend);
      expect(
        find.textContaining('O programa selecionado não está disponível.'),
        findsOneWidget,
      );
      expect(find.text(erroAmbiguo), findsNothing);
      backend.programas = [ciclo('2026/1')];
      await tester.tap(find.byTooltip('Atualizar programas'));
      await tester.pumpAndSettle();
      expect(find.text('Pendências do ciclo 2026/1'), findsOneWidget);
      expect(
        find.textContaining('O programa selecionado não está mais disponível.'),
        findsOneWidget,
      );
    },
  );
  testWidgets('nenhum programa oferece gerenciamento sem consultas ambíguas', (
    tester,
  ) async {
    backend.programas = [];
    await abrir(tester, backend);
    expect(find.textContaining('Nenhum programa cadastrado.'), findsOneWidget);
    expect(find.text('Gerenciar programas'), findsOneWidget);
    expect(backend.pedidos('/coordenacao/dashboard'), isEmpty);
    expect(backend.pedidos('/coordenacao/candidaturas'), isEmpty);
  });
  testWidgets(
    'falha de rede no catálogo mostra erro de carregamento e retentativa',
    (tester) async {
      backend.offline = true;
      await abrir(tester, backend);
      expect(
        find.textContaining('Não foi possível carregar os programas.'),
        findsOneWidget,
      );
      expect(backend.pedidos('/coordenacao/dashboard'), isEmpty);
      backend.offline = false;
      await tester.tap(find.text('Tentar novamente'));
      await tester.pumpAndSettle();
      expect(find.text('Candidaturas pendentes'), findsOneWidget);
    },
  );
  testWidgets(
    'falha de rede no dashboard não exibe mensagem técnica de participação',
    (tester) async {
      backend.dashboardOffline = true;
      await abrir(tester, backend);
      expect(
        find.textContaining('Não foi possível carregar o dashboard.'),
        findsOneWidget,
      );
      expect(find.text(erroAmbiguo), findsNothing);
    },
  );
  testWidgets(
    'Renata demo usa somente coordenação, mantém ciclo e encerra sessão',
    (tester) async {
      tester.view.physicalSize = const Size(600, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          home: LoginPage(client: backend.client, baseUrl: 'http://localhost'),
        ),
      );
      await tester.tap(find.text('Entrar como usuário de teste'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Renata Martins'),
        400,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Renata Martins'));
      await tester.pumpAndSettle();
      expect(find.byType(TelaCoordenacao), findsOneWidget);
      expect(backend.pedidos('/auth/login-demo'), hasLength(1));
      expect(
        backend.chamadas.any(
          (r) => r.url.path.startsWith('/participacoes') || r.url.path == '/me',
        ),
        isFalse,
      );
      expect(SessaoUsuario.atual.identidade, isNull);
      await tester.tap(find.byTooltip('Sair da coordenação'));
      await tester.pumpAndSettle();
      expect(find.byType(LoginPage), findsOneWidget);
      expect(SessaoUsuario.atual.accessToken, isNull);
    },
  );
  test('aluno continua propagando recusa de programa ambíguo e aceita contexto explícito', () async {
    final api = ParticipacoesApi(
      client: backend.client,
      baseUrl: 'http://localhost',
    )..accessToken = 'jwt-aluno';
    await expectLater(
      api.situacao('aluno@pucminas.edu.br'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'status', 400)
            .having((e) => e.mensagem, 'mensagem', erroAmbiguo),
      ),
    );
    api.programa = '2026/2';
    expect((await api.situacao('aluno@pucminas.edu.br')).situacao, 'nenhuma');
  });
}
