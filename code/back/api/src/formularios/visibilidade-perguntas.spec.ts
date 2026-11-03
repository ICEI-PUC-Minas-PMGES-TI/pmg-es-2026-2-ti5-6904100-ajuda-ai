import { describe, expect, it } from 'vitest';
import { PerguntaFormulario } from './entities/formulario.entity.js';
import {
  condicaoSatisfeita,
  normalizarCondicao,
  perguntasVisiveis,
} from './visibilidade-perguntas.js';

const base = (parcial: Partial<PerguntaFormulario>): PerguntaFormulario => ({
  id: 'q',
  enunciado: 'P',
  tipo: 'texto_curto',
  opcoes: [],
  obrigatoria: false,
  ...parcial,
});

describe('visibilidade de perguntas', () => {
  it('avalia operadores básicos', () => {
    expect(
      condicaoSatisfeita(
        { perguntaId: 'a', operador: 'igual', valor: 'Sim' },
        'Sim',
      ),
    ).toBe(true);
    expect(
      condicaoSatisfeita(
        { perguntaId: 'a', operador: 'diferente', valor: 'Sim' },
        'Não',
      ),
    ).toBe(true);
    expect(
      condicaoSatisfeita(
        { perguntaId: 'a', operador: 'contem', valor: 'Apoio acadêmico' },
        ['Apoio acadêmico', 'Carreira'],
      ),
    ).toBe(true);
    expect(
      condicaoSatisfeita({ perguntaId: 'a', operador: 'preenchida' }, 'x'),
    ).toBe(true);
    expect(condicaoSatisfeita({ perguntaId: 'a', operador: 'vazia' }, '')).toBe(
      true,
    );
  });

  it('só mostra perguntas cuja condição foi satisfeita', () => {
    const perguntas = [
      base({ id: 'a', enunciado: 'Tem interesse?' }),
      base({
        id: 'b',
        enunciado: 'Qual área?',
        visivelSe: { perguntaId: 'a', operador: 'igual', valor: 'Sim' },
      }),
    ];
    expect(perguntasVisiveis(perguntas, { a: 'Não' }).map((p) => p.id)).toEqual(
      ['a'],
    );
    expect(perguntasVisiveis(perguntas, { a: 'Sim' }).map((p) => p.id)).toEqual(
      ['a', 'b'],
    );
  });

  it('recusa condição apontando para pergunta inexistente ou posterior', () => {
    const anteriores = new Set(['a']);
    expect(() =>
      normalizarCondicao(
        { perguntaId: 'z', operador: 'igual', valor: 'x' },
        1,
        anteriores,
        2,
      ),
    ).toThrow(/anterior/);
    expect(
      normalizarCondicao(
        { perguntaId: 'a', operador: 'igual', valor: 'Sim' },
        1,
        anteriores,
        2,
      ),
    ).toEqual({ perguntaId: 'a', operador: 'igual', valor: 'Sim' });
  });
});
