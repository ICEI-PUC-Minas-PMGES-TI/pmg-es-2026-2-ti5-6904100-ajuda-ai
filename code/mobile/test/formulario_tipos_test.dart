import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_formularios_coord.dart';
import 'package:ajuda_ai/models/formulario.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:ajuda_ai/widgets/perguntas_adicionais.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('somente quatro tipos são selecionáveis', () {
    expect(TipoPergunta.comuns.map((p) => p.apiValue), [
      'texto_curto',
      'texto_longo',
      'checklist',
      'dropdown',
    ]);
  });

  for (final tipo in ['upload', 'file', 'attachment', 'outro', null]) {
    test(
      'tipo $tipo é preservado como não suportado, sem conversão em texto',
      () {
        final pergunta = PerguntaFormulario.fromJson({
          'id': 'legado',
          'enunciado': 'Antiga',
          'tipo': tipo,
        });
        expect(pergunta.tipo, TipoPergunta.naoSuportado);
        expect(pergunta.tipoOriginal, tipo);
        expect(
          pergunta.copyWith(enunciado: 'Antiga editada').tipo,
          TipoPergunta.naoSuportado,
        );
        if (tipo != null) expect(pergunta.toJson()['tipo'], tipo);
        expect(
          PerguntasAdicionais.pendentes([pergunta], {'legado': 'arquivo.pdf'}),
          ['legado'],
        );
        final corrigida = pergunta.copyWith(tipo: TipoPergunta.textoCurto);
        expect(corrigida.toJson()['tipo'], 'texto_curto');
      },
    );
  }

  testWidgets('perguntas legadas geram erro sem controles de resposta', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PerguntasAdicionais(
            perguntas: [
              PerguntaFormulario.fromJson({'id': 'legado', 'tipo': 'upload'}),
            ],
            respostas: {},
          ),
        ),
      ),
    );
    expect(find.text(mensagemFormularioNaoSuportado), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(DropdownButton<String>), findsNothing);
    expect(find.text('Envio de arquivo em breve'), findsNothing);
  });

  testWidgets(
    'coordenação lê legado, oferece apenas tipos suportados e exige correção antes de salvar',
    (tester) async {
      tester.view.physicalSize = const Size(500, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var gravacoes = 0;
      final client = MockClient((request) async {
        if (request.method == 'PUT') gravacoes++;
        return http.Response(
          jsonEncode({
            'tipo': 'padrinho',
            'programa': '2026/2',
            'publicado': true,
            'perguntas': [
              {
                'id': 'antiga',
                'enunciado': 'Pergunta antiga',
                'tipo': 'upload',
                'obrigatoria': false,
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      addTearDown(client.close);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: EditorFormularioCoord(
              tipo: 'padrinho',
              programa: '2026/2',
              api: CoordenacaoApi(
                accessToken: 'teste',
                client: client,
                baseUrl: 'http://teste',
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final dropdown = tester.widget<DropdownButtonFormField<TipoPergunta>>(
        find.byType(DropdownButtonFormField<TipoPergunta>),
      );
      // Inspeciona o menu real, sem transformar o valor legado no primeiro item.
      expect(dropdown.initialValue, isNull);
      await tester.tap(find.byType(DropdownButton<TipoPergunta>));
      await tester.pumpAndSettle();
      expect(find.text('Envio de arquivo'), findsNothing);
      expect(find.text('Texto curto'), findsWidgets);
      await tester.tapAt(const Offset(2, 2));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Salvar'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();
      expect(gravacoes, 0);
      expect(
        find.textContaining(
          'Tipo não suportado: remova ou substitua a pergunta',
        ),
        findsOneWidget,
      );
    },
  );
}
