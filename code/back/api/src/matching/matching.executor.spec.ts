import { calcularMatching } from './matching.calculo.js';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { calcularMatchingAssincrono } from './matching.executor.js';
import { alocarMatching } from './matching.algorithm.js';
import { alocarMatchingAssincrono } from './matching.executor.js';

describe('Alocação em thread separada', () => {
  it('preserva resultado, capacidades e ocupação sem bloquear o event loop', async () => {
    const arestas = Array.from({ length: 12 }, (_, p) =>
      Array.from({ length: 36 }, (_, a) => ({
        padrinhoId: p + 1,
        apadrinhadoId: 100 + a,
        score: 1,
      })),
    ).flat();
    const p = new Map(Array.from({ length: 12 }, (_, i) => [i + 1, 3])),
      a = new Map(Array.from({ length: 36 }, (_, i) => [100 + i, 1]));
    const contexto = {
      ocupacaoPadrinhos: new Map([[1, 1]]),
      ocupacaoApadrinhados: new Map([[100, 1]]),
    };
    let concluido = false;
    const tarefa = alocarMatchingAssincrono(arestas, p, a, contexto).then(
      (r) => {
        concluido = true;
        return r;
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(concluido).toBe(false);
    expect(await tarefa).toEqual(alocarMatching(arestas, p, a, contexto));
  });
  it('interrompe a thread ao vencer o prazo, sem publicar uma alocação parcial', async () => {
    await expect(
      alocarMatchingAssincrono([], new Map(), new Map(), {}, 1),
    ).rejects.toThrow('excedeu o prazo');
  });
});

describe('Pontuação e relatório fora da thread HTTP', () => {
  function entrada() {
    const c = cenarioMatching({ padrinhos: 6, alunos: 18 });
    return {
      padrinhos: c.participantes.filter((p) => p.papel === 'candidato'),
      apadrinhados: c.participantes.filter((p) => p.papel === 'apadrinhado'),
      criterios: c.configs[0].criterios,
      metadata: { campos: { padrinho: new Map(), apadrinhado: new Map() } },
      vinculos: [{ padrinhoParticipacaoId: 1, apadrinhadoParticipacaoId: 100 }],
      impedidos: new Set(['2:101']),
      usadosP: new Map([[1, 1]]),
      usadosA: new Map([[100, 1]]),
      capP: new Map(
        Array.from({ length: 6 }, (_, i) => [i + 1, i === 0 ? 2 : 3]),
      ),
      capA: new Map(
        Array.from({ length: 18 }, (_, i) => [i + 100, i === 0 ? 0 : 1]),
      ),
      capacidadePorPadrinho: 3,
      capacidadePorApadrinhado: 1,
    };
  }
  it('pontua os pares, respeita recusas e produz o mesmo relatório sem bloquear o event loop', async () => {
    const dados = entrada();
    let concluido = false;
    const trabalho = calcularMatchingAssincrono(dados).then((r) => {
      concluido = true;
      return r;
    });
    await new Promise<void>((r) => setImmediate(r));
    expect(concluido).toBe(false);
    const resultado = await trabalho;
    expect(resultado).toEqual(calcularMatching(dados));
    expect(resultado.alocacao).toHaveLength(17);
    expect(resultado.alocacao).not.toContainEqual(
      expect.objectContaining({ padrinhoId: 2, apadrinhadoId: 101 }),
    );
    expect(resultado.explicacoes.size).toBe(resultado.alocacao.length);
  });
  it('o prazo também cancela a pontuação, sem devolver sugestões parciais', async () => {
    await expect(calcularMatchingAssincrono(entrada(), 1)).rejects.toThrow(
      'excedeu o prazo',
    );
  });
});
