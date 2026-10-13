import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_cadastros_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Backend falso da coordenação para `/coordenacao/cadastros` (mesmos
/// endpoints e formatos do web).
class _CadastrosFalsos {
  final requisicoes = <http.Request>[];
  final cadastros = <int, Map<String, dynamic>>{
    1: {
      'id': 1,
      'nome': 'Gabriel Souza',
      'email': 'gabriel@pucminas.edu.br',
      'iniciais': 'GS',
      'curso': 'Engenharia de Software',
      'periodo': 3,
      'tipoParticipacao': 'padrinho',
      'statusCadastro': 'pendente',
      'interesses': ['Tecnologia'],
      'criadoEm': '2026-10-01T10:00:00.000Z',
      'respostas': {
        'motivacao': 'Quero ajudar os calouros.',
        'areas': ['Projetos'],
        'disponibilidade': ['Noite'],
        'requisitos': [
          {
            'id': 'calculo-i',
            'descricao': 'Cálculo I',
            'obrigatorio': true,
            'cumpre': true,
          },
          {
            'id': 'bd',
            'descricao': 'Banco de Dados',
            'obrigatorio': false,
            'cumpre': false,
          },
        ],
      },
    },
    2: {
      'id': 2,
      'nome': 'Bruna Lima',
      'email': 'bruna@pucminas.edu.br',
      'iniciais': 'BL',
      'curso': 'Sistemas de Informação',
      'periodo': 1,
      'tipoParticipacao': 'apadrinhado',
      'statusCadastro': 'pendente',
      'criadoEm': '2026-10-02T10:00:00.000Z',
      'respostas': {'expectativa': 'Dicas da rotina.'},
    },
    3: {
      'id': 3,
      'nome': 'Carla Dias',
      'email': 'carla@pucminas.edu.br',
      'iniciais': 'CD',
      'curso': 'SI',
      'periodo': 1,
      'tipoParticipacao': 'apadrinhado',
      'statusCadastro': 'aprovado',
      'criadoEm': '2026-09-02T10:00:00.000Z',
      'respostas': const {},
    },
  };

  http.Response _json(Object corpo, [int status = 200]) => http.Response(
    jsonEncode(corpo),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  late final MockClient client = MockClient((r) async {
    requisicoes.add(r);
    expect(r.headers['authorization'], 'Bearer token-coord');
    final caminho = r.url.path;
    if (caminho == '/coordenacao/cadastros') {
      final status = r.url.queryParameters['status'];
      return _json(
        cadastros.values
            .where((c) => status == null || c['statusCadastro'] == status)
            .toList(),
      );
    }
    final m = RegExp(r'^/coordenacao/cadastros/(\d+)(/aprovar|/rejeitar)?$')
        .firstMatch(caminho);
    if (m != null) {
      final item = cadastros[int.parse(m.group(1)!)]!;
      if (m.group(2) == '/aprovar') item['statusCadastro'] = 'aprovado';
      if (m.group(2) == '/rejeitar') {
        item['statusCadastro'] = 'rejeitado';
        item['motivoRejeicao'] = (jsonDecode(r.body) as Map)['motivo'];
      }
      return _json(item);
    }
    return _json({'message': 'rota não simulada'}, 404);
  });
}

void main() {
  late _CadastrosFalsos falsos;
  late CoordenacaoApi api;

  setUp(() {
    falsos = _CadastrosFalsos();
    api = CoordenacaoApi(
      accessToken: 'token-coord',
      client: falsos.client,
      baseUrl: '',
    );
  });

  void telaGrande(WidgetTester tester) {
    tester.view.physicalSize = const Size(412, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  testWidgets('lista pendentes, aprovados e rejeitados com a modalidade', (
    tester,
  ) async {
    telaGrande(tester);
    await tester.pumpWidget(MaterialApp(home: TelaCadastrosCoord(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Gabriel Souza'), findsOneWidget);
    expect(find.text('Bruna Lima'), findsOneWidget);
    expect(find.text('Carla Dias'), findsNothing);
    expect(find.textContaining('Padrinho ·'), findsOneWidget);
    expect(find.textContaining('Apadrinhado ·'), findsOneWidget);

    await tester.tap(find.text('Aprovados'));
    await tester.pumpAndSettle();
    expect(find.text('Carla Dias'), findsOneWidget);
    expect(find.text('Gabriel Souza'), findsNothing);
    expect(falsos.requisicoes.last.url.queryParameters['status'], 'aprovado');

    await tester.ensureVisible(find.text('Rejeitados'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Rejeitados'));
    await tester.pumpAndSettle();
    expect(
      find.text('Nenhum cadastro encontrado para este filtro.'),
      findsOneWidget,
    );
  });

  testWidgets('detalhe do padrinho mostra requisitos e respostas e aprova', (
    tester,
  ) async {
    telaGrande(tester);
    await tester.pumpWidget(MaterialApp(home: TelaCadastrosCoord(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gabriel Souza'));
    await tester.pumpAndSettle();

    expect(
      find.text('Requisitos do ciclo e declaração do candidato'),
      findsOneWidget,
    );
    expect(find.text('Cálculo I — declarou que cumpre'), findsOneWidget);
    expect(
      find.text('Banco de Dados (desejável) — declarou que NÃO cumpre'),
      findsOneWidget,
    );
    expect(find.text('Quero ajudar os calouros.'), findsOneWidget);

    await tester.tap(find.text('Aprovar cadastro'));
    await tester.pumpAndSettle();

    expect(
      falsos.requisicoes.last.url.path,
      '/coordenacao/cadastros/1/aprovar',
    );
    expect(find.text('Aprovado'), findsOneWidget);
    expect(find.text('Aprovar cadastro'), findsNothing);
  });

  testWidgets('rejeita apadrinhado informando o motivo', (tester) async {
    telaGrande(tester);
    await tester.pumpWidget(MaterialApp(home: TelaCadastrosCoord(api: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bruna Lima'));
    await tester.pumpAndSettle();

    expect(find.text('Dicas da rotina.'), findsOneWidget);
    expect(find.textContaining('Requisitos do ciclo'), findsNothing);

    await tester.tap(find.text('Rejeitar cadastro'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Documentação incompleta.');
    await tester.tap(find.text('Rejeitar'));
    await tester.pumpAndSettle();

    final envio = falsos.requisicoes.last;
    expect(envio.url.path, '/coordenacao/cadastros/2/rejeitar');
    expect(jsonDecode(envio.body), {'motivo': 'Documentação incompleta.'});
    expect(find.text('Documentação incompleta.'), findsOneWidget);

    // volta para a lista e recarrega
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    expect(find.text('Bruna Lima'), findsNothing);
  });
}
