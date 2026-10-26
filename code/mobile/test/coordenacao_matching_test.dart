import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_matching_coord.dart';
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
  'camposDisponiveis': [
    {
      'publico': 'padrinho',
      'campo': 'areas',
      'tipo': 'lista',
      'rotulo': 'Áreas',
    },
    {
      'publico': 'apadrinhado',
      'campo': 'areas',
      'tipo': 'lista',
      'rotulo': 'Áreas',
    },
  ],
  'totais': {
    'padrinhosElegiveis': 2,
    'apadrinhadosElegiveis': 3,
    'sugestoesPendentes': 1,
    'vinculos': 0,
    'pessoasSemVinculo': 3,
    'outboxPendentes': 2,
  },
  'chat': {
    'disponivel': false,
    'pendencias': 2,
    'mensagem': 'Eventos aguardam integração com um módulo de chat.',
  },
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

void main() {
  test('CoordenacaoApi usa os contratos de matching', () async {
    final pedidos = <http.Request>[];
    final api = CoordenacaoApi(
      accessToken: 'jwt',
      baseUrl: 'http://teste',
      client: MockClient((pedido) async {
        pedidos.add(pedido);
        if (pedido.url.path.endsWith('/sugestoes') ||
            pedido.url.path.endsWith('/execucoes')) {
          return _json([]);
        }
        return _json({});
      }),
    );

    await api.matchingVisao('2026/2');
    await api.salvarMatchingConfiguracao(
      programa: '2026/2',
      liberado: false,
      capacidadePorPadrinho: 3,
      capacidadePorApadrinhado: 1,
      criterios: [
        {
          'campoPadrinho': 'areas',
          'campoApadrinhado': 'areas',
          'operacao': 'intersecao',
          'peso': 100,
        },
      ],
    );
    await api.liberarMatching('2026/2', true);
    await api.executarMatching('2026/2');
    await api.execucoesMatching('2026/2');
    await api.sugestoesMatching('2026/2', status: 'pendente');
    await api.sugestaoMatching(7);
    await api.aprovarSugestaoMatching(7);
    await api.recusarSugestaoMatching(7, motivo: 'Outro par mais adequado');

    expect(pedidos.map((pedido) => '${pedido.method} ${pedido.url.path}'), [
      'GET /coordenacao/matching',
      'PUT /coordenacao/matching/config',
      'POST /coordenacao/matching/liberar',
      'POST /coordenacao/matching/executar',
      'GET /coordenacao/matching/execucoes',
      'GET /coordenacao/matching/sugestoes',
      'GET /coordenacao/matching/sugestao/7',
      'POST /coordenacao/matching/sugestao/7/aprovar',
      'POST /coordenacao/matching/sugestao/7/recusar',
    ]);
    expect(
      pedidos.first.url.queryParameters,
      containsPair('programa', '2026/2'),
    );
    expect(
      jsonDecode(pedidos[1].body),
      containsPair('capacidadePorPadrinho', 3),
    );
    expect(
      jsonDecode(pedidos.last.body),
      containsPair('motivo', 'Outro par mais adequado'),
    );
  });

  testWidgets('lista, compara e aprova com aviso explícito de outbox', (
    tester,
  ) async {
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
            'chat': {'criado': false, 'eventosPendentes': 1},
          });
        default:
          return _json({'message': 'Rota não simulada'}, 404);
      }
    });
    final api = CoordenacaoApi(accessToken: 'jwt', baseUrl: '', client: client);

    await tester.pumpWidget(
      MaterialApp(
        home: TelaMatchingCoord(api: api, programa: '2026/2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Programa 2026/2'), findsOneWidget);
    expect(find.text('Dependência de chat pendente'), findsOneWidget);
    expect(find.textContaining('2 evento(s) aguardando'), findsOneWidget);
    expect(find.text('Ana Padrinho ↔ Bia Apadrinhada'), findsOneWidget);

    await tester.tap(find.text('Comparar'));
    await tester.pumpAndSettle();
    expect(find.text('Compatibilidade 100%'), findsOneWidget);
    expect(find.text('Chat depende da outbox'), findsOneWidget);
    expect(find.textContaining('a conversa privada/grupo'), findsOneWidget);

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
  });
}
