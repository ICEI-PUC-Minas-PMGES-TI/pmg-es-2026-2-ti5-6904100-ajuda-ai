import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_matching_coord.dart';
import 'package:ajuda_ai/coordenacao/tela_programas_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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
      expect(find.textContaining('Inscrições fechadas'), findsOneWidget);
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
      expect(find.text('Abrir matching manual'), findsOneWidget);
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

      expect(find.text('Matching ainda não liberado'), findsOneWidget);
      expect(
        pedidos.any((request) => request.url.path == '/coordenacao/matching'),
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
        if (request.url.path == '/coordenacao/matching') {
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
        '/coordenacao/matching',
      ]);
      for (final request in pedidos) {
        expect(
          request.url.queryParameters['codigo'] ??
              request.url.queryParameters['programa'],
          '2026/2',
        );
      }
    });
  });
}
