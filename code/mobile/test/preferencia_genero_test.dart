import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/models/preferencia_genero.dart';
import 'package:ajuda_ai/widgets/preferencia_genero.dart';

void main() {
  const dados = DadosCadastro(
    nome: 'Ana',
    email: 'ana@pucminas.edu.br',
    curso: 'Engenharia',
    periodo: 3,
    turno: 'Noite',
  );
  const preferencia = PreferenciaGenero(
    modo: 'preferencia',
    generos: ['Feminino', 'Não binário'],
  );
  test('ausência e sem preferência permanecem distintos', () {
    expect(PreferenciaGenero.fromJson(null), isNull);
    expect(dados.respostasPadrinho().containsKey('preferenciaGenero'), isFalse);
    expect(
      PreferenciaGenero.fromJson({'modo': 'sem_preferencia', 'generos': []})
          ?.descricao,
      'Sem preferência',
    );
    expect(
      PreferenciaGenero.fromJson({'modo': 'preferencia', 'generos': []}),
      isNull,
    );
    expect(
      PreferenciaGenero.fromJson({
        'modo': 'exclusiva',
        'generos': ['Feminino'],
      }),
      isNull,
    );
  });
  test(
    'preferência percorre ambos os payloads, restauração e alteração de perfil',
    () {
      for (final padrinho in [true, false]) {
        final restaurado = dados.comRespostas({
          'genero': 'Masculino',
          'preferenciaGenero': preferencia.toJson(),
        }, padrinho: padrinho);
        final perfil = restaurado.copyWith(nome: 'Ana atualizada');
        expect(perfil.genero, 'Masculino');
        expect(perfil.preferenciaGenero?.toJson(), preferencia.toJson());
        final respostas = padrinho
            ? perfil.respostasPadrinho()
            : perfil.respostasApadrinhado();
        expect(respostas['preferenciaGenero'], preferencia.toJson());
      }
    },
  );
  test('revisar dados permite remover uma preferência explicitamente', () {
    final inicial = dados.comRespostas({
      'preferenciaGenero': preferencia.toJson(),
    }, padrinho: true);
    final atualizado = inicial.comPasso2(
      expectativaPadrinho: 'Apoiar',
      outrasInformacoes: null,
      areasApoio: ['Tecnologia'],
      disponibilidade: 'Noite',
      genero: 'Masculino',
      bolsistaProuni: true,
      deOutraCidade: false,
      limparPreferenciaGenero: true,
    );
    expect(
      atualizado.respostasPadrinho().containsKey('preferenciaGenero'),
      isFalse,
    );
    expect(atualizado.genero, 'Masculino');
  });
  testWidgets(
    'campo permite declarar preferência múltipla e voltar a sem preferência',
    (tester) async {
      PreferenciaGenero? valor;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => CampoPreferenciaGenero(
                valor: valor,
                onChanged: (v) => setState(() => valor = v),
              ),
            ),
          ),
        ),
      );
      expect(find.text('Não informado'), findsOneWidget);
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tenho preferência').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Feminino'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Não binário'));
      await tester.pumpAndSettle();
      expect(valor?.generos, ['Feminino', 'Não binário']);
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sem preferência').last);
      await tester.pumpAndSettle();
      expect(valor?.modo, 'sem_preferencia');
      expect(valor?.generos, isEmpty);
    },
  );
}
