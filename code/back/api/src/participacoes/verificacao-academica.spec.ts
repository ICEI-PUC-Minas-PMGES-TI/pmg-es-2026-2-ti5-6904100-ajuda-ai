import {
  acrescentarVerificacao,
  exigirConferenciaParaAprovar,
  itensDaConferencia,
  LIMITE_HISTORICO_VERIFICACAO,
  montarVerificacao,
  type VerificacaoAcademica,
} from './verificacao-academica.js';

const REQUISITOS = [
  { id: 'calculo-i', descricao: 'Cálculo I', obrigatorio: true },
  { id: 'monitoria', descricao: 'Já foi monitor', obrigatorio: false },
];

const todos = (ids: string[], atende = true) =>
  ids.map((id) => ({ id, atende }));

describe('verificação acadêmica (F09)', () => {
  describe('itens da conferência', () => {
    it('apadrinhado: matrícula ativa e 1º período', () => {
      expect(itensDaConferencia('apadrinhado').map((i) => i.id)).toEqual([
        'matricula_ativa',
        'primeiro_periodo',
      ]);
    });

    it('padrinho: requisitos do papel + critérios do programa', () => {
      const itens = itensDaConferencia('candidato', REQUISITOS);
      expect(itens.map((i) => [i.id, i.obrigatorio, i.origem])).toEqual([
        ['matricula_ativa', true, 'papel'],
        ['periodo_minimo', true, 'papel'],
        ['programa:calculo-i', true, 'programa'],
        ['programa:monitoria', false, 'programa'],
      ]);
    });
  });

  describe('registro', () => {
    const esperados = itensDaConferencia('candidato', REQUISITOS);
    const ids = esperados.map((e) => e.id);

    it('grava resultado, itens, observações, responsável e data', () => {
      const agora = new Date('2026-10-26T12:00:00Z');
      const v = montarVerificacao(
        esperados,
        { itens: todos(ids), observacoes: '  Conferido no SGA.  ' },
        'renata@pucminas.edu.br',
        agora,
      );
      expect(v).toMatchObject({
        resultado: 'requisitos_atendidos',
        observacoes: 'Conferido no SGA.',
        por: 'renata@pucminas.edu.br',
        em: '2026-10-26T12:00:00.000Z',
      });
      expect(v.itens).toHaveLength(4);
    });

    it('critério opcional não atendido não reprova; obrigatório reprova', () => {
      const opcional = montarVerificacao(
        esperados,
        {
          itens: ids.map((id) => ({ id, atende: id !== 'programa:monitoria' })),
        },
        'coord',
      );
      expect(opcional.resultado).toBe('requisitos_atendidos');

      const obrigatorio = montarVerificacao(
        esperados,
        { itens: ids.map((id) => ({ id, atende: id !== 'matricula_ativa' })) },
        'coord',
      );
      expect(obrigatorio.resultado).toBe('requisitos_nao_atendidos');
    });

    it('exige todos os itens, recusa itens desconhecidos e formato inválido', () => {
      expect(() =>
        montarVerificacao(esperados, { itens: todos(ids.slice(1)) }, 'c'),
      ).toThrow(/Faltam: Matrícula ativa/);
      expect(() =>
        montarVerificacao(
          esperados,
          { itens: [...todos(ids), { id: 'inventado', atende: true }] },
          'c',
        ),
      ).toThrow(/inventado/);
      expect(() =>
        montarVerificacao(esperados, { itens: [{ id: 'x' }] }, 'c'),
      ).toThrow(/id e de atende/);
      expect(() => montarVerificacao(esperados, {}, 'c')).toThrow(
        /cada requisito/,
      );
      expect(() =>
        montarVerificacao(
          esperados,
          { itens: todos(ids), observacoes: 'x'.repeat(1001) },
          'c',
        ),
      ).toThrow(/1000 caracteres/);
    });
  });

  describe('histórico', () => {
    const v = (em: string): VerificacaoAcademica => ({
      resultado: 'requisitos_atendidos',
      itens: [],
      observacoes: null,
      por: 'c',
      em,
    });

    it('a nova vira a atual e a anterior entra no topo do histórico', () => {
      const primeiro = acrescentarVerificacao(null, v('1'));
      expect(primeiro).toEqual({ atual: v('1'), anteriores: [] });
      const segundo = acrescentarVerificacao(primeiro, v('2'));
      expect(segundo.atual.em).toBe('2');
      expect(segundo.anteriores.map((a) => a.em)).toEqual(['1']);
    });

    it('limita o histórico', () => {
      let registro = acrescentarVerificacao(null, v('0'));
      for (let i = 1; i <= LIMITE_HISTORICO_VERIFICACAO + 5; i++)
        registro = acrescentarVerificacao(registro, v(String(i)));
      expect(registro.anteriores).toHaveLength(LIMITE_HISTORICO_VERIFICACAO);
      expect(registro.anteriores[0].em).toBe(
        String(LIMITE_HISTORICO_VERIFICACAO + 4),
      );
    });
  });

  describe('aprovação', () => {
    const esperados = itensDaConferencia('apadrinhado');
    const ids = esperados.map((e) => e.id);

    it('sem conferência não aprova', () => {
      expect(() => exigirConferenciaParaAprovar(null, esperados)).toThrow(
        /Registre a conferência acadêmica/,
      );
    });

    it('conferência com obrigatório não atendido não aprova', () => {
      const atual = montarVerificacao(
        esperados,
        { itens: ids.map((id) => ({ id, atende: id === 'matricula_ativa' })) },
        'c',
      );
      expect(() =>
        exigirConferenciaParaAprovar({ atual, anteriores: [] }, esperados),
      ).toThrow(/não atendidos/);
    });

    it('conferência desatualizada (critério novo) pede nova conferência', () => {
      const atual = montarVerificacao(esperados, { itens: todos(ids) }, 'c');
      const comNovo = [
        ...esperados,
        {
          id: 'programa:novo',
          descricao: 'Novo',
          obrigatorio: true,
          origem: 'programa' as const,
        },
      ];
      expect(() =>
        exigirConferenciaParaAprovar({ atual, anteriores: [] }, comNovo),
      ).toThrow(/Registre a conferência novamente/);
    });

    it('conferência com requisitos atendidos libera a aprovação', () => {
      const atual = montarVerificacao(esperados, { itens: todos(ids) }, 'c');
      expect(() =>
        exigirConferenciaParaAprovar({ atual, anteriores: [] }, esperados),
      ).not.toThrow();
    });
  });
});
