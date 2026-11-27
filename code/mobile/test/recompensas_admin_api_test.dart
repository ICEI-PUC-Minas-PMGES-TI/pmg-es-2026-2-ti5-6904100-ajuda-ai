import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_recompensas_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('combina, formata e serializa data/hora local sem deslocamento', () {
    final selecionada = combinarDataHoraRecompensa(
      DateTime(2026, 11, 27),
      const TimeOfDay(hour: 18, minute: 30),
    );
    expect(formatarDataHoraLocalRecompensa(selecionada), '27/11/2026 às 18:30');

    final iso = dataHoraLocalParaIsoRecompensa(selecionada)!;
    expect(iso, endsWith('Z'));
    final carregada = lerDataHoraRecompensa(iso)!;
    expect(formatarDataHoraLocalRecompensa(carregada), '27/11/2026 às 18:30');
    expect(dataHoraLocalParaIsoRecompensa(null), isNull);
    expect(placeholderDataHoraRecompensa, 'DD/MM/AAAA às HH:mm');
  });

  test('máscara progressiva mantém edição no meio, backspace e limpeza', () {
    const formatador = MascaraDataHoraRecompensa();
    var valor = TextEditingValue.empty;
    for (final digito in '271120261830'.split('')) {
      final texto = '${valor.text}$digito';
      valor = formatador.formatEditUpdate(
        valor,
        TextEditingValue(
          text: texto,
          selection: TextSelection.collapsed(offset: texto.length),
        ),
      );
    }
    expect(valor.text, '27/11/2026 às 18:30');
    expect(lerDataHoraDigitadaRecompensa(valor.text), isNotNull);
    final parcial = mascararDataHoraRecompensa('27112026183');
    expect(parcial, '27/11/2026 às 18:3');
    expect(lerDataHoraDigitadaRecompensa(parcial), isNull);

    final alterado = '27/21/2026 às 18:30';
    valor = formatador.formatEditUpdate(
      valor,
      const TextEditingValue(
        text: '27/21/2026 às 18:30',
        selection: TextSelection.collapsed(offset: 4),
      ),
    );
    expect(valor.text, alterado);
    expect(valor.selection.extentOffset, 4);

    valor = formatador.formatEditUpdate(
      valor,
      const TextEditingValue(
        text: '2721/2026 às 18:30',
        selection: TextSelection.collapsed(offset: 2),
      ),
    );
    expect(valor.text, alterado);
    expect(valor.selection.extentOffset, 2);

    valor = formatador.formatEditUpdate(valor, TextEditingValue.empty);
    expect(valor.text, isEmpty);
    expect(validarDataHoraDigitadaRecompensa(''), isNull);
    expect(validarDataHoraDigitadaRecompensa('31/02/2026 às 18:30'), isNotNull);
    expect(validarDataHoraDigitadaRecompensa('27/11/2026 às 24:00'), isNotNull);
  });

  testWidgets('formulário mostra a data editada e permite limpá-la', (
    tester,
  ) async {
    final iso = dataHoraLocalParaIsoRecompensa(DateTime(2026, 11, 27, 18, 30));
    final api = CoordenacaoApi(
      accessToken: 'jwt-coordenacao',
      baseUrl: 'http://localhost:3000',
      client: MockClient((_) async => http.Response('{}', 200)),
    );
    final original = <String, dynamic>{
      'id': 'recompensa-1',
      'nome': 'Caneca',
      'descricao': 'Cerâmica',
      'imagemUrl': null,
      'custoXp': 300,
      'condicoesRetirada': 'Retirar na coordenação.',
      'estoque': {'ilimitado': false},
      'limitePorAluno': null,
      'publico': 'todos',
      'programaCodigo': null,
      'disponivelDe': iso,
      'disponivelAte': null,
      'atualizadoEm': '2026-11-27T00:00:00Z',
    };

    await tester.pumpWidget(
      MaterialApp(
        home: FormularioRecompensaCoord(
          api: api,
          programas: const [],
          original: original,
        ),
      ),
    );
    await tester.scrollUntilVisible(
      find.byTooltip('Limpar Disponível a partir de'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    final campo = find.byKey(const ValueKey('recompensa-data-de'));
    var campoWidget = tester.widget<TextFormField>(campo);
    expect(campoWidget.controller!.text, '27/11/2026 às 18:30');
    final decoracao = tester.widget<InputDecorator>(
      find.descendant(of: campo, matching: find.byType(InputDecorator)),
    );
    expect(decoracao.decoration.hintText, placeholderDataHoraRecompensa);
    expect(
      find.byTooltip('Selecionar data e horário de Disponível a partir de'),
      findsOneWidget,
    );

    await tester.tap(find.byTooltip('Limpar Disponível a partir de'));
    await tester.pumpAndSettle();
    campoWidget = tester.widget<TextFormField>(campo);
    expect(campoWidget.controller!.text, isEmpty);

    await tester.enterText(campo, '271120261830');
    await tester.pumpAndSettle();
    campoWidget = tester.widget<TextFormField>(campo);
    expect(campoWidget.controller!.text, '27/11/2026 às 18:30');
  });

  test(
    'valida campos obrigatórios, estoque, URL e vigência antes do envio',
    () {
      expect(validarTextoRecompensa('  ', 'o nome'), contains('nome'));
      expect(
        validarTextoRecompensa('Caneca', 'o nome', maximo: 3),
        contains('3'),
      );
      expect(validarCustoMoedasRecompensa('1.5'), isNotNull);
      expect(validarCustoMoedasRecompensa('300'), isNull);
      expect(
        validarUrlImagemRecompensa('http://exemplo.com/foto.png'),
        isNotNull,
      );
      expect(
        validarUrlImagemRecompensa('https://exemplo.com/foto.png'),
        isNull,
      );
      expect(
        validarEstoqueInicialRecompensa('-1', ilimitado: false),
        isNotNull,
      );
      expect(validarEstoqueInicialRecompensa('', ilimitado: true), isNull);
      expect(validarLimiteRecompensa('101'), isNotNull);
      expect(
        validarVigenciaRecompensa(
          inicio: DateTime(2026, 12, 10, 10),
          fim: DateTime(2026, 12, 1, 10),
        ),
        isNotNull,
      );
      expect(
        validarVigenciaRecompensa(
          inicio: DateTime(2026, 12, 1, 10),
          fim: DateTime(2026, 12, 10, 10),
        ),
        isNull,
      );
    },
  );

  test(
    'usa os endpoints administrativos existentes com o JWT da coordenação',
    () async {
      final requisicoes = <http.Request>[];
      final api = CoordenacaoApi(
        accessToken: 'jwt-coordenacao',
        baseUrl: 'http://localhost:3000',
        client: MockClient((req) async {
          requisicoes.add(req);
          final corpo =
              req.method == 'GET' && req.url.path == '/coordenacao/recompensas'
              ? <dynamic>[]
              : <String, dynamic>{'id': 'recompensa-1'};
          return http.Response(jsonEncode(corpo), 200);
        }),
      );

      await api.recompensas(status: 'publicada');
      await api.recompensa('recompensa-1');
      await api.criarRecompensa({'nome': 'Caneca'});
      await api.atualizarRecompensa('recompensa-1', {
        'atualizadoEm': '2026-11-27T00:00:00Z',
      });
      await api.ajustarEstoqueRecompensa('recompensa-1', {
        'tipo': 'reposicao',
        'quantidade': 4,
        'motivo': 'Novo lote',
        'atualizadoEm': '2026-11-27T00:00:00Z',
      });
      await api.publicarRecompensa('recompensa-1');
      await api.desativarRecompensa('recompensa-1');
      await api.arquivarRecompensa('recompensa-1');
      await api.excluirRecompensa('recompensa-1');

      expect(requisicoes.map((r) => '${r.method} ${r.url.path}').toList(), [
        'GET /coordenacao/recompensas',
        'GET /coordenacao/recompensas/recompensa-1',
        'POST /coordenacao/recompensas',
        'PATCH /coordenacao/recompensas/recompensa-1',
        'POST /coordenacao/recompensas/recompensa-1/estoque',
        'POST /coordenacao/recompensas/recompensa-1/publicar',
        'POST /coordenacao/recompensas/recompensa-1/desativar',
        'POST /coordenacao/recompensas/recompensa-1/arquivar',
        'DELETE /coordenacao/recompensas/recompensa-1',
      ]);
      expect(requisicoes.first.url.queryParameters, {'status': 'publicada'});
      expect(
        requisicoes.every(
          (requisicao) =>
              requisicao.headers['authorization'] == 'Bearer jwt-coordenacao',
        ),
        isTrue,
      );
      expect(jsonDecode(requisicoes[2].body), {'nome': 'Caneca'});
      expect(jsonDecode(requisicoes[4].body), {
        'tipo': 'reposicao',
        'quantidade': 4,
        'motivo': 'Novo lote',
        'atualizadoEm': '2026-11-27T00:00:00Z',
      });
    },
  );
}
