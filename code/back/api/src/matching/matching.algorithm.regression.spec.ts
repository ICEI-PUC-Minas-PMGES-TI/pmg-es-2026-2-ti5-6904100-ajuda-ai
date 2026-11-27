import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import ts from 'typescript';
import { alocarMatching, type ArestaMatching } from './matching.algorithm.js';

interface EntradaMatching {
  arestas: ArestaMatching[];
  padrinhos: Array<[number, number]>;
  apadrinhados: Array<[number, number]>;
}

// Compila o arquivo real, sem manter uma cópia do algoritmo dentro do teste.
// Um worker permite interromper o cálculo mesmo se houver um loop síncrono.
const algoritmoCompilado = ts.transpileModule(
  readFileSync(new URL('./matching.algorithm.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
    },
  },
).outputText;

function executarIsolado(entrada: EntradaMatching): Promise<ArestaMatching[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
        const { parentPort, workerData } = require('node:worker_threads');
        const exports = {};
        ${algoritmoCompilado}
        parentPort.postMessage(exports.alocarMatching(
          workerData.arestas,
          new Map(workerData.padrinhos),
          new Map(workerData.apadrinhados),
        ));
      `,
      { eval: true, workerData: entrada },
    );
    const prazo = setTimeout(() => {
      void worker.terminate();
      reject(new Error('O matching não terminou dentro de 3 segundos.'));
    }, 3_000);

    worker.once('message', (resultado: ArestaMatching[]) => {
      clearTimeout(prazo);
      void worker.terminate();
      resolve(resultado);
    });
    worker.once('error', (erro) => {
      clearTimeout(prazo);
      void worker.terminate();
      reject(erro);
    });
    worker.once('exit', (codigo) => {
      clearTimeout(prazo);
      reject(new Error(`Worker encerrou sem resultado (código ${codigo}).`));
    });
  });
}

function entradaCompleta(
  quantidadePadrinhos: number,
  quantidadeApadrinhados: number,
  capacidadePadrinho: number,
  score: number,
): EntradaMatching {
  const padrinhos: Array<[number, number]> = Array.from(
    { length: quantidadePadrinhos },
    (_, i) => [i + 1, capacidadePadrinho],
  );
  const apadrinhados: Array<[number, number]> = Array.from(
    { length: quantidadeApadrinhados },
    (_, i) => [i + 100, 1],
  );
  return {
    padrinhos,
    apadrinhados,
    arestas: padrinhos.flatMap(([padrinhoId]) =>
      apadrinhados.map(([apadrinhadoId]) => ({
        padrinhoId,
        apadrinhadoId,
        score,
      })),
    ),
  };
}

function verificarCapacidades(
  resultado: ArestaMatching[],
  entrada: EntradaMatching,
) {
  expect(
    new Set(resultado.map((par) => `${par.padrinhoId}:${par.apadrinhadoId}`))
      .size,
  ).toBe(resultado.length);
  for (const [id, capacidade] of entrada.padrinhos)
    expect(
      resultado.filter((par) => par.padrinhoId === id).length,
    ).toBeLessThanOrEqual(capacidade);
  for (const [id, capacidade] of entrada.apadrinhados)
    expect(
      resultado.filter((par) => par.apadrinhadoId === id).length,
    ).toBeLessThanOrEqual(capacidade);
}

function melhorPorEnumeracao(entrada: EntradaMatching) {
  let melhor = { quantidade: 0, score: 0 };
  for (let mascara = 0; mascara < 2 ** entrada.arestas.length; mascara++) {
    const pares = entrada.arestas.filter((_, i) => mascara & (1 << i));
    const cabe =
      entrada.padrinhos.every(
        ([id, capacidade]) =>
          pares.filter((par) => par.padrinhoId === id).length <= capacidade,
      ) &&
      entrada.apadrinhados.every(
        ([id, capacidade]) =>
          pares.filter((par) => par.apadrinhadoId === id).length <= capacidade,
      );
    if (!cabe) continue;
    const score = pares.reduce((soma, par) => soma + par.score, 0);
    if (
      pares.length > melhor.quantidade ||
      (pares.length === melhor.quantidade && score > melhor.score)
    )
      melhor = { quantidade: pares.length, score };
  }
  return melhor;
}

describe('alocarMatching: regressões de caminhos residuais e capacidades', () => {
  it.each([0, 0.5, 1])(
    'termina com três padrinhos e três apadrinhados empatados em %s',
    async (score) => {
      const entrada = entradaCompleta(3, 3, 1, score);
      const resultado = await executarIsolado(entrada);
      expect(resultado).toHaveLength(3);
      verificarCapacidades(resultado, entrada);
    },
    10_000,
  );

  it('termina com dez apadrinhados e permite três vínculos por padrinho', async () => {
    const entrada = entradaCompleta(3, 10, 3, 1);
    const resultado = await executarIsolado(entrada);
    expect(resultado).toHaveLength(9);
    verificarCapacidades(resultado, entrada);
    expect(
      entrada.padrinhos.map(
        ([id]) => resultado.filter((par) => par.padrinhoId === id).length,
      ),
    ).toEqual([3, 3, 3]);
  }, 10_000);

  it('preserva o desempate com três participantes por lado e mapas invertidos', async () => {
    const entrada = entradaCompleta(3, 3, 1, 0.5);
    const primeiro = await executarIsolado(entrada);
    const invertido = await executarIsolado({
      arestas: [...entrada.arestas].reverse(),
      padrinhos: [...entrada.padrinhos].reverse(),
      apadrinhados: [...entrada.apadrinhados].reverse(),
    });
    expect(invertido).toEqual(primeiro);
  }, 10_000);

  it('retorna vazio sem arestas ou sem capacidade disponível', () => {
    expect(alocarMatching([], new Map([[1, 3]]), new Map([[100, 1]]))).toEqual(
      [],
    );
    expect(
      alocarMatching(
        [{ padrinhoId: 1, apadrinhadoId: 100, score: 1 }],
        new Map([[1, 0]]),
        new Map([[100, 1]]),
      ),
    ).toEqual([]);
    expect(
      alocarMatching(
        [{ padrinhoId: 1, apadrinhadoId: 100, score: 1 }],
        new Map([[1, 3]]),
        new Map([[100, 0]]),
      ),
    ).toEqual([]);
  });

  it('considera somente a capacidade restante e as arestas viáveis fornecidas', () => {
    const entrada: EntradaMatching = {
      // O serviço já descontou dois vínculos da capacidade total de três.
      padrinhos: [
        [1, 1],
        [2, 3],
      ],
      apadrinhados: [
        [100, 1],
        [101, 1],
        [102, 1],
      ],
      arestas: [
        { padrinhoId: 1, apadrinhadoId: 100, score: 1 },
        { padrinhoId: 1, apadrinhadoId: 101, score: 0.9 },
        { padrinhoId: 1, apadrinhadoId: 102, score: 0.8 },
        { padrinhoId: 2, apadrinhadoId: 101, score: 0.7 },
        { padrinhoId: 2, apadrinhadoId: 102, score: 0.6 },
      ],
    };
    const resultado = alocarMatching(
      entrada.arestas,
      new Map(entrada.padrinhos),
      new Map(entrada.apadrinhados),
    );
    expect(resultado).toHaveLength(3);
    expect(resultado.filter((par) => par.padrinhoId === 1)).toEqual([
      { padrinhoId: 1, apadrinhadoId: 100, score: 1 },
    ]);
    verificarCapacidades(resultado, entrada);
  });

  it('maximiza cobertura e score em todos os 4096 grafos pequenos da matriz', () => {
    const matriz = entradaCompleta(2, 3, 2, 0).arestas;
    for (let codigo = 0; codigo < 4 ** matriz.length; codigo++) {
      let restante = codigo;
      const arestas = matriz.flatMap((par) => {
        const estado = restante % 4;
        restante = Math.floor(restante / 4);
        // Cada par pode estar ausente ou ter score 0, 0.5 ou 1.
        return estado === 0 ? [] : [{ ...par, score: (estado - 1) / 2 }];
      });
      const entrada: EntradaMatching = {
        arestas,
        padrinhos: [
          [1, 2],
          [2, 1],
        ],
        apadrinhados: [
          [100, 1],
          [101, 1],
          [102, 1],
        ],
      };
      const resultado = alocarMatching(
        arestas,
        new Map(entrada.padrinhos),
        new Map(entrada.apadrinhados),
      );
      expect({
        quantidade: resultado.length,
        score: resultado.reduce((soma, par) => soma + par.score, 0),
      }).toEqual(melhorPorEnumeracao(entrada));
      verificarCapacidades(resultado, entrada);
    }
  }, 15_000);
});
