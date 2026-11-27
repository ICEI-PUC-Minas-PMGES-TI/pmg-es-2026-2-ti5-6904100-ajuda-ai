import { LIMITES } from '../economia.js';
import {
  chaveConquista,
  contextoDe,
  CRITERIOS_CONQUISTA,
  DEFINICAO_CRITERIOS,
  estadoDaConquista,
  problemaDaRegra,
  progressoDe,
  sqlConquistaElegivel,
  textoCriterio,
} from './conquistas.js';

const valida = { criterio: 'MISSOES_CONCLUIDAS', meta: 3, publico: 'TODOS', xp: 0 } as const;

describe('conquistas: regras puras', () => {
  it('estado sai de ativa + publicada_em', () => {
    expect(estadoDaConquista(false, null)).toBe('rascunho');
    expect(estadoDaConquista(true, new Date())).toBe('publicada');
    expect(estadoDaConquista(false, new Date())).toBe('arquivada');
  });

  it('todo critério tem definição e texto para o aluno', () => {
    for (const c of CRITERIOS_CONQUISTA) {
      const d = DEFINICAO_CRITERIOS[c];
      expect(d.metaMin).toBeLessThanOrEqual(d.metaMax);
      expect(textoCriterio(c, d.metaMin)).toMatch(/\.$/);
    }
    expect(textoCriterio('MISSOES_CONCLUIDAS', 1)).toBe('Concluir 1 missão no semestre.');
    expect(textoCriterio('MISSOES_CONCLUIDAS', 2)).toBe('Concluir 2 missões no semestre.');
  });

  it.each([
    ['critério inexistente', { ...valida, criterio: 'LOGIN' }, /não suportado/],
    ['meta zero', { ...valida, meta: 0 }, /meta vai de 1 a 50/],
    ['meta fracionada', { ...valida, meta: 1.5 }, /meta/],
    ['nível 1', { ...valida, criterio: 'NIVEL_ALCANCADO', meta: 1 }, /2 a 10/],
    ['feed para apadrinhados', { ...valida, criterio: 'FEED_PUBLICACOES', publico: 'APADRINHADOS' }, /padrinhos/],
    ['XP negativo', { ...valida, xp: -1 }, /XP/],
    ['XP acima do teto', { ...valida, xp: LIMITES.porConquista + 1 }, /XP/],
  ] as const)('recusa %s', (_, regra, motivo) => {
    expect(problemaDaRegra(regra as Parameters<typeof problemaDaRegra>[0])).toMatch(motivo);
  });

  it('aceita a regra válida', () => {
    expect(problemaDaRegra(valida)).toBeNull();
    expect(problemaDaRegra({ ...valida, xp: LIMITES.porConquista })).toBeNull();
  });

  it('contexto: ciclo nos critérios do semestre, GERAL no nível', () => {
    expect(contextoDe('MISSOES_CONCLUIDAS', '2026/2')).toBe('2026/2');
    expect(contextoDe('NIVEL_ALCANCADO', '2026/2')).toBe('GERAL');
  });

  it('chave do ledger é própria da conquista (nunca a da missão)', () => {
    const chave = chaveConquista('abc', 7, '2026/2');
    expect(chave).toBe('conquista:abc:7:2026/2');
    expect(chave.startsWith('missao:')).toBe(false);
  });

  it('progresso lê a contagem do critério', () => {
    const c = { missoes: 1, pucstops: 2, publicacoes: 3, comentarios: 4, nivel: 5 };
    expect(CRITERIOS_CONQUISTA.map((k) => progressoDe(k, c))).toEqual([1, 2, 3, 4, 5]);
  });

  it('elegibilidade: público do papel, programa por parâmetro e feed só para quem publica', () => {
    const apadrinhado = sqlConquistaElegivel('c', 'apadrinhado', '$2', false);
    expect(apadrinhado).toContain(`IN ('TODOS', 'APADRINHADOS')`);
    expect(apadrinhado).toContain(`c."programa_codigo" = $2`);
    expect(apadrinhado).toContain(`<> 'FEED_PUBLICACOES'`);
    const padrinho = sqlConquistaElegivel('c', 'padrinho', '$2', true);
    expect(padrinho).toContain(`IN ('TODOS', 'PADRINHOS')`);
    expect(padrinho).not.toContain('FEED_PUBLICACOES');
    expect(sqlConquistaElegivel('c', null, '$2', false)).toContain(`IN ('TODOS')`);
  });
});
