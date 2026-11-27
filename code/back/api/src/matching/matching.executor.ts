import type {
  calcularMatching,
  EntradaCalculoMatching,
} from './matching.calculo.js';
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
  return executarWorker<ArestaMatching[]>(
    'alocar',
    { arestas, padrinhos, apadrinhados, contexto },
    prazoMs,
  );
}

export function calcularMatchingAssincrono(
  entrada: EntradaCalculoMatching,
  prazoMs = 60_000,
) {
  return executarWorker<ReturnType<typeof calcularMatching>>(
    'calcular',
    entrada,
    prazoMs,
  );
}

function executarWorker<T>(
  operacao: 'alocar' | 'calcular',
  entrada: unknown,
  prazoMs: number,
): Promise<T> {
  // Nest executa o JS de dist; Vitest usa o TS puro, suportado pelo Node do projeto.
  const modulo = new URL(
    import.meta.url.endsWith('.ts')
      ? operacao === 'alocar'
        ? './matching.algorithm.ts'
        : './matching.calculo.ts'
      : operacao === 'alocar'
        ? './matching.algorithm.js'
        : './matching.calculo.js',
    import.meta.url,
  ).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const {parentPort, workerData} = require('node:worker_threads');
      (async () => {
        const modulo = await import(workerData.modulo);
        const e = workerData.entrada;
        parentPort.postMessage(workerData.operacao === 'alocar'
          ? modulo.alocarMatching(e.arestas, e.padrinhos, e.apadrinhados, e.contexto)
          : modulo.calcularMatching(e));
      })().catch(erro => { throw erro; });
    `,
      {
        eval: true,
        workerData: { modulo, operacao, entrada },
      },
    );
    let terminou = false;
    const concluir = (erro: Error | null, resultado?: T) => {
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
    worker.once('message', (resultado: T) => concluir(null, resultado));
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
