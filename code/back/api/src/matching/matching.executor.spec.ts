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
