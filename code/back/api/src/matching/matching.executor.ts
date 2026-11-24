import { Worker } from 'node:worker_threads';
import type { ArestaMatching, ContextoAlocacao } from './matching.algorithm.js';

/** Executa o mesmo algoritmo fora do event loop HTTP/SSE, com prazo cancelável. */
export function alocarMatchingAssincrono(
  arestas: ArestaMatching[],
  padrinhos: Map<number, number>,
  apadrinhados: Map<number, number>,
  contexto: ContextoAlocacao = {},
  prazoMs = 60_000,
): Promise<ArestaMatching[]> {
  // Nest executa o JS de dist; Vitest usa o TS puro, suportado pelo Node do projeto.
  const modulo = new URL(
    import.meta.url.endsWith('.ts')
      ? './matching.algorithm.ts'
      : './matching.algorithm.js',
    import.meta.url,
  ).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const {parentPort, workerData} = require('node:worker_threads');
      (async () => {
        const {alocarMatching} = await import(workerData.modulo);
        parentPort.postMessage(alocarMatching(workerData.arestas, workerData.padrinhos, workerData.apadrinhados, workerData.contexto));
      })().catch(erro => { throw erro; });
    `,
      {
        eval: true,
        workerData: { modulo, arestas, padrinhos, apadrinhados, contexto },
      },
    );
    let terminou = false;
    const concluir = (erro: Error | null, resultado?: ArestaMatching[]) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      void worker.terminate().then(() => {
        if (erro) reject(erro);
        else resolve(resultado!);
      }, reject);
    };
    const timer = setTimeout(
      () =>
        concluir(
          new Error(
            'O cálculo do matching excedeu o prazo de processamento. Tente novamente com uma rodada menor.',
          ),
        ),
      prazoMs,
    );
    worker.once('message', (resultado: ArestaMatching[]) =>
      concluir(null, resultado),
    );
    worker.once('error', (erro: Error) => concluir(erro));
    worker.once('exit', (codigo) =>
      concluir(
        new Error(
          `O cálculo do matching encerrou sem resultado (código ${codigo}).`,
        ),
      ),
    );
  });
}
