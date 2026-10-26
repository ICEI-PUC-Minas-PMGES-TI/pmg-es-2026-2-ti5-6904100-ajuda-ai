import 'package:ajuda_ai/models/formulario.dart';
import 'package:ajuda_ai/widgets/perguntas_adicionais.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final resposta in [true, false]) {
    test('resposta $resposta conta como preenchida nas condições', () {
      expect(
        condicaoSatisfeita(
          const CondicaoVisibilidade(
            perguntaId: 'bolsa',
            operador: OperadorCondicao.preenchida,
          ),
          resposta,
        ),
        isTrue,
      );
      expect(
        condicaoSatisfeita(
          const CondicaoVisibilidade(
            perguntaId: 'bolsa',
            operador: OperadorCondicao.vazia,
          ),
          resposta,
        ),
        isFalse,
      );
      expect(
        condicaoSatisfeita(
          CondicaoVisibilidade(
            perguntaId: 'bolsa',
            operador: OperadorCondicao.diferente,
            valor: '$resposta',
          ),
          resposta,
        ),
        isFalse,
      );
    });

    test('exibe e valida a pergunta obrigatória após responder $resposta', () {
      const perguntas = [
        PerguntaFormulario(
          id: 'bolsa',
          enunciado: 'É bolsista?',
          tipo: TipoPergunta.simNao,
        ),
        PerguntaFormulario(
          id: 'detalhe',
          enunciado: 'Qual sua situação?',
          tipo: TipoPergunta.textoCurto,
          obrigatoria: true,
          visivelSe: CondicaoVisibilidade(
            perguntaId: 'bolsa',
            operador: OperadorCondicao.preenchida,
          ),
        ),
      ];
      expect(PerguntasAdicionais.pendentes(perguntas, {}), isEmpty);
      expect(PerguntasAdicionais.pendentes(perguntas, {'bolsa': resposta}), [
        'detalhe',
      ]);
      final respostas = {'bolsa': resposta, 'detalhe': 'Minha situação'};
      expect(PerguntasAdicionais.pendentes(perguntas, respostas), isEmpty);
      expect(PerguntasAdicionais.limpar(perguntas, respostas), respostas);
    });
  }
}
