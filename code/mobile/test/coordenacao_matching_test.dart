import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_matching_coord.dart';
import 'package:ajuda_ai/coordenacao/tela_matching_manual_coord.dart';
import 'package:ajuda_ai/coordenacao/tela_programas_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object valor, [int status = 200]) => http.Response(
  jsonEncode(valor),
  status,
  headers: {'content-type': 'application/json'},
);

Map<String, dynamic> get _visao => {
  'programa': {'codigo': '2026/2'},
  'configuracao': {
    'versao': 2,
    'liberado': true,
    'capacidadePorPadrinho': 3,
    'capacidadePorApadrinhado': 1,
    'criterios': [
      {
        'campoPadrinho': 'areas',
        'campoApadrinhado': 'areas',
        'operacao': 'intersecao',
        'peso': 100,
      },
    ],
  },
  'podeExecutar': true,
  'bloqueios': [],
  'criteriosDisponiveis': const [],
  'totais': {
    'padrinhosElegiveis': 2,
    'apadrinhadosElegiveis': 3,
    'sugestoesPendentes': 1,
    'vinculos': 0,
    'pessoasSemVinculo': 3,
    'outboxPendentes': 0,
  },
  'chat': {'disponivel': true, 'pendencias': 0},
};

Map<String, dynamic> get _sugestao => {
  'id': 7,
  'status': 'pendente',
  'score': '1.0000',
  'padrinho': {
    'id': 10,
    'nome': 'Ana Padrinho',
    'curso': 'Engenharia',
    'periodo': 5,
  },
  'apadrinhado': {
    'id': 11,
    'nome': 'Bia Apadrinhada',
    'curso': 'Engenharia',
    'periodo': 1,
  },
  'capacidade': {
    'padrinho': {'restante': 3, 'limite': 3},
    'apadrinhado': {'restante': 1, 'limite': 1},
  },
  'explicacao': {
    'score': 1,
    'criterios': [
      {
        'campoPadrinho': 'areas',
        'campoApadrinhado': 'areas',
        'rotuloPadrinho': 'Áreas',
        'rotuloApadrinhado': 'Áreas',
        'considerado': true,
        'compativel': true,
        'contribuicao': 100,
        'peso': 100,
        'valorPadrinho': ['Tecnologia'],
        'valorApadrinhado': ['Tecnologia'],
      },
    ],
  },
  'outbox': [],
};

Map<String, dynamic> _programa({required bool liberado}) => {
  'codigo': '2026/2',
  'titulo': 'Programa 2026/2',
  'matchingLiberado': liberado,
};

Map<String, dynamic> _programaComAcoes({
  required String etapa,
  required bool inscricoesAbertas,
  bool podeEncerrar = false,
  bool podeLiberar = false,
  bool matchingLiberado = false,
}) => {
  'codigo': '2026/2',
  'titulo': 'Programa 2026/2',
  'etapaAtual': etapa,
  'statusRotulo': etapa,
  'vigente': true,
  'inscricoesAbertas': inscricoesAbertas,
  'podeEncerrarInscricoes': podeEncerrar,
  'podeLiberarMatching': podeLiberar,
  'matchingLiberado': matchingLiberado,
  'vagasApadrinhados': 80,
  'gruposPrevistos': 25,
  'requisitosPadrinho': const [],
  'etapas': const [],
  'datas': const {},
  'totais': const {},
};

void main() {
  testWidgets(
    '409 preserva configuração e exige carregar a versão atual antes de salvar',
    (tester) async {
      tester.view.physicalSize = const Size(412, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final visao = _visao;
      (visao['configuracao'] as Map)['criterios'] = [
        {'campoCadastro': 'areas', 'operacao': 'intersecao', 'peso': 100},
      ];
      visao['criteriosCadastroDisponiveis'] = [
        {
          'campo': 'areas',
          'nome': 'Áreas de apoio',
          'operacao': 'intersecao',
          'permiteObrigatorio': true,
        },
      ];
      var leituras = 0, envios = 0;
      final api = CoordenacaoApi(
        accessToken: 'coord',
        baseUrl: '',
        client: MockClient((r) async {
          if (r.method == 'PUT') {
            envios++;
            expect(jsonDecode(r.body)['versaoBase'], 2);
            return _json({
              'message': 'A configuração mudou em outra sessão.',
            }, 409);
          }
          if (r.url.path == '/coordenacao/matching') {
            leituras++;
            return _json(visao);
          }
          return _json([]);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TelaMatchingCoord(api: api, programa: '2026/2'),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Editar configuração'));
      await tester.tap(find.text('Editar configuração'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Salvar configuração'));
      await tester.tap(find.text('Salvar configuração'));
      await tester.pumpAndSettle();
      expect(
        find.text('A configuração mudou em outra sessão.'),
        findsOneWidget,
      );
      expect(envios, 1);
      final salvar = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Salvar configuração'),
      );
      expect(salvar.onPressed, isNull);
      await tester.tap(find.text('Carregar configuração atual'));
      await tester.pumpAndSettle();
      expect(leituras, greaterThan(1));
      expect(find.text('Configuração salva em uma nova versão.'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  test('CoordenacaoApi preserva contratos separados para matching', () async {
    final pedidos = <http.Request>[];
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: '',
      client: MockClient((pedido) async {
        pedidos.add(pedido);
        return _json({});
      }),
    );

    await api.matchingVisao('2026/2');
    await api.matching(programa: '2026/2');
    await api.matchingConfiguracao('2026/2');
    await api.salvarMatchingConfiguracao(
      programa: '2026/2',
      liberado: true,
      capacidadePorPadrinho: 3,
      capacidadePorApadrinhado: 1,
      criterios: const [],
    );
    await api.encerrarInscricoes('2026/2');
    await api.liberarMatching('2026/2');
    await api.executarMatching('2026/2');
    await api.execucoesMatching('2026/2');
    await api.sugestoesMatching('2026/2', status: 'pendente');
    await api.sugestaoMatching(7);
    await api.aprovarSugestaoMatching(7);
    await api.recusarSugestaoMatching(7, motivo: 'Revisão');

    expect(pedidos.map((pedido) => pedido.url.path), [
      '/coordenacao/matching',
      '/coordenacao/matching/pool',
      '/coordenacao/matching/config',
      '/coordenacao/matching/config',
      '/coordenacao/programas/encerrar-inscricoes',
      '/coordenacao/programas/liberar-matching',
      '/coordenacao/matching/executar',
      '/coordenacao/matching/execucoes',
      '/coordenacao/matching/sugestoes',
      '/coordenacao/matching/sugestao/7',
      '/coordenacao/matching/sugestao/7/aprovar',
      '/coordenacao/matching/sugestao/7/recusar',
    ]);
    expect(pedidos[0].url.queryParameters, containsPair('programa', '2026/2'));
    expect(pedidos[1].url.queryParameters, containsPair('programa', '2026/2'));
    expect(pedidos[4].url.queryParameters, containsPair('codigo', '2026/2'));
    expect(pedidos[5].url.queryParameters, containsPair('codigo', '2026/2'));
  });

  group('Ações do programa', () {
    testWidgets('encerra inscrições sem decidir candidaturas', (tester) async {
      tester.view.physicalSize = const Size(412, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var programa = _programaComAcoes(
        etapa: 'inscricoes',
        inscricoesAbertas: true,
        podeEncerrar: true,
      );
      final pedidos = <http.Request>[];
      final client = MockClient((request) async {
        pedidos.add(request);
        if (request.url.path == '/coordenacao/programas/encerrar-inscricoes') {
          programa = _programaComAcoes(
            etapa: 'analise',
            inscricoesAbertas: false,
          );
          return http.Response(
            jsonEncode(programa),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode([programa]),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      await tester.pumpWidget(
        MaterialApp(
          home: TelaProgramasCoord(
            api: CoordenacaoApi(
              accessToken: 'token',
              client: client,
              baseUrl: '',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Encerrar inscrições'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Encerrar inscrições'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Encerrar inscrições').last);
      await tester.pumpAndSettle();

      final fechamento = pedidos.singleWhere(
        (request) =>
            request.url.path == '/coordenacao/programas/encerrar-inscricoes',
      );
      expect(fechamento.method, 'POST');
      expect(fechamento.url.queryParameters['codigo'], '2026/2');
      expect(
        pedidos.any((request) => request.url.path.contains('/candidaturas/')),
        isFalse,
      );
      expect(find.text('Inscrições encerradas'), findsOneWidget);
    });

    testWidgets('libera matching apenas pela ação explícita', (tester) async {
      tester.view.physicalSize = const Size(412, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var programa = _programaComAcoes(
        etapa: 'analise',
        inscricoesAbertas: false,
        podeLiberar: true,
      );
      final pedidos = <http.Request>[];
      final client = MockClient((request) async {
        pedidos.add(request);
        if (request.url.path == '/coordenacao/programas/liberar-matching') {
          programa = _programaComAcoes(
            etapa: 'formacao',
            inscricoesAbertas: false,
            matchingLiberado: true,
          );
          return http.Response(
            jsonEncode(programa),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode([programa]),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      await tester.pumpWidget(
        MaterialApp(
          home: TelaProgramasCoord(
            api: CoordenacaoApi(
              accessToken: 'token',
              client: client,
              baseUrl: '',
            ),
            onAbrirMatching: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Liberar matching'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Liberar matching'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Liberar matching').last);
      await tester.pumpAndSettle();

      expect(
        pedidos.any(
          (request) =>
              request.url.path == '/coordenacao/programas/liberar-matching',
        ),
        isTrue,
      );
      expect(find.textContaining('Matching liberado'), findsWidgets);
      expect(find.text('Abrir matching'), findsOneWidget);
    });
  });

  group('Matching manual', () {
    testWidgets('não consulta o pool antes da liberação explícita', (
      tester,
    ) async {
      final pedidos = <http.Request>[];
      final client = MockClient((request) async {
        pedidos.add(request);
        return http.Response(
          jsonEncode([_programa(liberado: false)]),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      await tester.pumpWidget(
        MaterialApp(
          home: TelaMatchingManualCoord(
            api: CoordenacaoApi(
              accessToken: 'token',
              client: client,
              baseUrl: '',
            ),
            programa: '2026/2',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Matching ainda não liberado'), findsOneWidget);
      expect(
        pedidos.any(
          (request) => request.url.path == '/coordenacao/matching/pool',
        ),
        isFalse,
      );
    });

    testWidgets('carrega pool e associa padrinho ao apadrinhado', (
      tester,
    ) async {
      final pedidos = <http.Request>[];
      var vinculado = false;
      final padrinho = {
        'id': 10,
        'nome': 'Padrinho Exemplo',
        'curso': 'Computação',
        'periodo': 6,
        'apadrinhados': 0,
        'grupo': null,
      };
      final apadrinhado = {
        'id': 20,
        'nome': 'Apadrinhado Exemplo',
        'curso': 'Administração',
        'periodo': 2,
        'vinculado': false,
      };
      final client = MockClient((request) async {
        pedidos.add(request);
        if (request.url.path == '/coordenacao/programas') {
          return http.Response(
            jsonEncode([_programa(liberado: true)]),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/coordenacao/matching/pool') {
          return http.Response(
            jsonEncode({
              'programa': _programa(liberado: true),
              'matchingLiberado': true,
              'padrinhos': [padrinho],
              'apadrinhados': [
                {...apadrinhado, 'vinculado': vinculado},
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/coordenacao/vinculos') {
          final corpo = jsonDecode(request.body) as Map<String, dynamic>;
          expect(corpo['apadrinhadoId'], 20);
          expect(corpo['padrinhoId'], 10);
          vinculado = true;
          return http.Response(
            jsonEncode({
              'apadrinhado': {...apadrinhado, 'vinculado': true},
            }),
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{"message":"Rota inesperada"}', 404);
      });

      await tester.pumpWidget(
        MaterialApp(
          home: TelaMatchingManualCoord(
            api: CoordenacaoApi(
              accessToken: 'token',
              client: client,
              baseUrl: '',
            ),
            programa: '2026/2',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Padrinho Exemplo'), findsWidgets);
      expect(find.text('Apadrinhado Exemplo'), findsOneWidget);
      await tester.tap(find.byType(DropdownButtonFormField<int>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Padrinho Exemplo · Sem grupo').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Definir padrinho'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Definir padrinho').last);
      await tester.pumpAndSettle();

      expect(
        pedidos.any((request) => request.url.path == '/coordenacao/vinculos'),
        isTrue,
      );
      expect(find.text('Com vínculo'), findsOneWidget);
    });

    test('usa ações de ciclo explícitas e escopadas pelo código', () async {
      final pedidos = <http.Request>[];
      final client = MockClient((request) async {
        pedidos.add(request);
        return http.Response(
          jsonEncode(_programa(liberado: true)),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final api = CoordenacaoApi(
        accessToken: 'token',
        client: client,
        baseUrl: '',
      );

      await api.encerrarInscricoes('2026/2');
      await api.liberarMatching('2026/2');
      await api.matching(programa: '2026/2');

      expect(pedidos.map((request) => request.method), ['POST', 'POST', 'GET']);
      expect(pedidos.map((request) => request.url.path), [
        '/coordenacao/programas/encerrar-inscricoes',
        '/coordenacao/programas/liberar-matching',
        '/coordenacao/matching/pool',
      ]);
      for (final request in pedidos) {
        expect(
          request.url.queryParameters['codigo'] ??
              request.url.queryParameters['programa'],
          '2026/2',
        );
      }
    });

    test('separa a visão automática do pool manual', () async {
      final pedidos = <http.Request>[];
      final client = MockClient((request) async {
        pedidos.add(request);
        return http.Response(
          '{}',
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final api = CoordenacaoApi(
        accessToken: 'token',
        client: client,
        baseUrl: '',
      );

      await api.matchingVisao('2026/2');
      await api.matching(programa: '2026/2');

      expect(pedidos.map((request) => request.url.path), [
        '/coordenacao/matching',
        '/coordenacao/matching/pool',
      ]);
    });
  });

  testWidgets(
    'editor preserva fonte do cadastro e altera seu peso no payload',
    (tester) async {
      tester.view.physicalSize = const Size(900, 1500);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      Map<String, dynamic>? salvo;
      final visao = _visao;
      visao['configuracao'] = {
        ...(visao['configuracao'] as Map),
        'criterios': [
          {
            'campoCadastro': 'preferenciaGenero',
            'operacao': 'preferencia_genero',
            'peso': 30,
          },
        ],
      };
      visao['criteriosCadastroDisponiveis'] = [
        {
          'campo': 'preferenciaGenero',
          'nome': 'Preferência de gênero',
          'operacao': 'preferencia_genero',
        },
      ];
      visao['criteriosDisponiveis'] = [];
      final api = CoordenacaoApi(
        accessToken: 'token',
        baseUrl: '',
        client: MockClient((pedido) async {
          if (pedido.method == 'PUT' &&
              pedido.url.path == '/coordenacao/matching/config') {
            salvo = Map<String, dynamic>.from(jsonDecode(pedido.body) as Map);
            return _json({});
          }
          if (pedido.url.path == '/coordenacao/matching') return _json(visao);
          return _json([]);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: TelaMatchingCoord(api: api, programa: '2026/2'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Editar configuração'));
      await tester.tap(find.text('Editar configuração'));
      await tester.pumpAndSettle();
      expect(find.text('Preferência de gênero'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), '45');
      await tester.tap(find.text('Salvar configuração'));
      await tester.pumpAndSettle();
      expect(salvo?['criterios'], [
        {
          'campoCadastro': 'preferenciaGenero',
          'operacao': 'preferencia_genero',
          'peso': 45,
        },
      ]);
      expect(salvo?['capacidadePorPadrinho'], 3);
    },
  );

  testWidgets(
    'condição obrigatória do programa sobrevive à edição e pode ser desmarcada',
    (tester) async {
      tester.view.physicalSize = const Size(900, 1800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      Map<String, dynamic>? salvo;
      final visao = _visao;
      visao['configuracao'] = {
        ...(visao['configuracao'] as Map),
        'criterios': [
          {
            'campoCadastro': 'areas',
            'operacao': 'intersecao',
            'peso': 30,
            'obrigatorio': true,
          },
        ],
      };
      visao['criteriosCadastroDisponiveis'] = [
        {
          'campo': 'areas',
          'nome': 'Áreas de apoio',
          'operacao': 'intersecao',
          'permiteObrigatorio': true,
        },
      ];
      visao['criteriosDisponiveis'] = [];
      final api = CoordenacaoApi(
        accessToken: 'token',
        baseUrl: '',
        client: MockClient((pedido) async {
          if (pedido.method == 'PUT' &&
              pedido.url.path == '/coordenacao/matching/config') {
            salvo = Map<String, dynamic>.from(jsonDecode(pedido.body) as Map);
            return _json({});
          }
          if (pedido.url.path == '/coordenacao/matching') return _json(visao);
          return _json([]);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: TelaMatchingCoord(api: api, programa: '2026/2'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Editar configuração'));
      await tester.tap(find.text('Editar configuração'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CheckboxListTile>(
              find.widgetWithText(
                CheckboxListTile,
                'Correspondência obrigatória',
              ),
            )
            .value,
        isTrue,
      );
      await tester.tap(find.text('Correspondência obrigatória'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salvar configuração'));
      await tester.pumpAndSettle();
      expect((salvo?['criterios'] as List).first['obrigatorio'], isFalse);
    },
  );

  testWidgets('a tela principal carrega as sugestões do contrato automático', (
    tester,
  ) async {
    final pedidos = <http.Request>[];
    final client = MockClient((request) async {
      pedidos.add(request);
      if (request.url.path == '/coordenacao/matching') {
        return http.Response(
          jsonEncode({
            'podeExecutar': false,
            'bloqueios': ['Ciclo ainda não liberado.'],
            'configuracao': null,
            'criteriosDisponiveis': [],
            'totais': {},
            'chat': {'disponivel': true, 'pendencias': 0},
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response(
        '[]',
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        home: TelaMatchingCoord(
          api: CoordenacaoApi(
            accessToken: 'token',
            client: client,
            baseUrl: '',
          ),
          programa: '2026/2',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Matching'), findsWidgets);
    expect(
      pedidos.any((request) => request.url.path == '/coordenacao/matching'),
      isTrue,
    );
    expect(
      pedidos.any(
        (request) => request.url.path == '/coordenacao/matching/pool',
      ),
      isFalse,
    );
  });

  testWidgets('aprovar sugestão cria a conversa privada', (tester) async {
    tester.view.physicalSize = const Size(600, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final pedidos = <http.Request>[];
    final client = MockClient((pedido) async {
      pedidos.add(pedido);
      switch (pedido.url.path) {
        case '/coordenacao/matching':
          return _json(_visao);
        case '/coordenacao/matching/execucoes':
          return _json([]);
        case '/coordenacao/matching/sugestoes':
          return _json([_sugestao]);
        case '/coordenacao/matching/sugestao/7':
          return _json(_sugestao);
        case '/coordenacao/matching/sugestao/7/aprovar':
          return _json({
            'sugestao': {..._sugestao, 'status': 'aprovada'},
            'chat': {'criado': true, 'eventosPendentes': 0},
          });
        default:
          return _json({'message': 'Rota não simulada'}, 404);
      }
    });

    await tester.pumpWidget(
      MaterialApp(
        home: TelaMatchingCoord(
          api: CoordenacaoApi(accessToken: 'jwt', baseUrl: '', client: client),
          programa: '2026/2',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Sugestões de matching'), findsOneWidget);

    await tester.ensureVisible(find.text('Comparar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Comparar'));
    await tester.pumpAndSettle();
    expect(find.text('Conversa privada'), findsOneWidget);
    expect(
      find.text(
        'A conversa privada será criada junto com a aprovação do vínculo.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.text('Aprovar match'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmar match'));
    await tester.pumpAndSettle();

    expect(
      pedidos.where(
        (pedido) =>
            pedido.url.path == '/coordenacao/matching/sugestao/7/aprovar',
      ),
      hasLength(1),
    );
    expect(
      find.text('Match aprovado. Conversa privada criada.'),
      findsOneWidget,
    );
  });
}
