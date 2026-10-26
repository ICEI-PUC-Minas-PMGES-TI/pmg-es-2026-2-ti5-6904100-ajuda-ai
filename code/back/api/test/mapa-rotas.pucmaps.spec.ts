/**
 * Equivalência com o PUCMaps (pgRouting) no grafo real da versão 12.
 *
 * Duas referências, porque o PUCMaps mudou de critério sem recalcular:
 *  - TEMPO: `pgr_dijkstra` dirigido com custo `walkingTimeSeconds` (código
 *    atual do PUCMaps, commit 69b2de0), rodado só em SELECT no banco antigo;
 *  - DISTÂNCIA: `precalculated_routes` gravadas em 24/09 pelo código anterior
 *    (custo `distanceMeters`, tempo = distância / 1,4).
 *
 * Sempre roda: amostra fixa em test/fixtures/mapa-rotas-pucmaps-12.json.
 * Comparação completa (770 302 pares em cada referência) com
 * PUCMAPS_ROTAS_TEMPO_CSV e PUCMAPS_ROTAS_DISTANCIA_CSV (exports somente
 * leitura; ver docs/tecnico/mapa/rotas.md). PUCMAPS_ROTAS_FIXTURE=1 regrava a
 * amostra; PUCMAPS_ROTAS_RESUMO=<arquivo> grava o resumo em JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { menorCaminho } from '../src/mapa/rotas/dijkstra.js';
import type { Grafo } from '../src/mapa/rotas/grafo.js';
import { calcularRota } from '../src/mapa/rotas/rota.js';
import { grafoDoSnapshot, lerSnapshot } from './mapa-rotas.grafo.js';

const ARQUIVO_AMOSTRA = resolve(
  import.meta.dirname,
  'fixtures/mapa-rotas-pucmaps-12.json',
);
const CSV_TEMPO = process.env.PUCMAPS_ROTAS_TEMPO_CSV;
const CSV_DISTANCIA = process.env.PUCMAPS_ROTAS_DISTANCIA_CSV;

/** [origem, destino, acessivel, tempo (s), distância (m)] da referência. */
type Par = [string, string, boolean, number, number];

interface Amostra {
  origem: {
    banco: string;
    versao: number;
    commitPucmaps: string;
    pares: number;
  };
  /** Referência TEMPO. */
  tempo: Par[];
  /** Referência DISTÂNCIA. */
  distancia: Par[];
  inalcancaveis: Array<[string, string, boolean]>;
  /**
   * Prédio → prédio: [A, B, acessivel, tempo, distância] do par de nós que o
   * PUCMaps escolhia (menor DISTÂNCIA entre as rotas de menor tempo).
   */
  predios: Par[];
}

const snapshot = lerSnapshot();
const grafo = grafoDoSnapshot(snapshot);
const grafoDistancia = grafoDoSnapshot(snapshot, { custo: 'distancia' });

function noANo(g: Grafo, de: string, para: string, acessivel: boolean) {
  return menorCaminho({
    grafo: g,
    origens: new Map([[de, { tempo: 0, distancia: 0 }]]),
    destinos: new Set([para]),
    acessivel,
  });
}

/** Mesmo tempo ótimo (inteiros: igualdade exata); no empate, distância ≤. */
function confereTempo([de, para, acessivel, tempo, distancia]: Par) {
  const r = noANo(grafo, de, para, acessivel);
  expect(r, `${de} → ${para} (${acessivel})`).not.toBeNull();
  expect(r!.tempo).toBe(tempo);
  expect(r!.distancia).toBeLessThanOrEqual(distancia + 1e-6);
  return r!;
}

/** Mesmo algoritmo minimizando metros: a mesma distância do pgRouting. */
function confereDistancia([de, para, acessivel, , distancia]: Par) {
  const r = noANo(grafoDistancia, de, para, acessivel);
  expect(r, `${de} → ${para} (${acessivel})`).not.toBeNull();
  // Em grafoDistancia o campo `tempo` carrega os metros.
  expect(Math.abs(r!.tempo - distancia)).toBeLessThan(1e-6);
}

function predioAPredio(a: string, b: string, acessivel: boolean) {
  return calcularRota(grafo, {
    origem: { tipo: 'predio', predioId: a },
    destino: { tipo: 'predio', predioId: b },
    acessivel,
  });
}

describe('rotas x PUCMaps (amostra fixa)', () => {
  const amostra = JSON.parse(readFileSync(ARQUIVO_AMOSTRA, 'utf8')) as Amostra;

  it('mesmo tempo ótimo do pgr_dijkstra (custo walkingTimeSeconds)', () => {
    expect(amostra.tempo.length).toBeGreaterThanOrEqual(300);
    expect(amostra.tempo.some((p) => p[2])).toBe(true);
    for (const par of amostra.tempo) confereTempo(par);
  }, 60_000); // Pesado: folga para a suíte em paralelo.

  it('mesma distância ótima das precalculated_routes (custo distanceMeters)', () => {
    expect(amostra.distancia.length).toBeGreaterThanOrEqual(100);
    for (const par of amostra.distancia) confereDistancia(par);
  }, 60_000); // Pesado: folga para a suíte em paralelo.

  it('sem caminho onde o pgRouting também não tinha', () => {
    expect(amostra.inalcancaveis.length).toBeGreaterThan(0);
    for (const [de, para, acessivel] of amostra.inalcancaveis) {
      expect(noANo(grafo, de, para, acessivel), `${de} → ${para}`).toBeNull();
    }
  });

  it('prédio → prédio nunca é mais lento que a escolha do PUCMaps', () => {
    expect(amostra.predios.length).toBeGreaterThan(0);
    for (const [a, b, acessivel, tempo] of amostra.predios) {
      expect(predioAPredio(a, b, acessivel).tempo).toBeLessThanOrEqual(tempo);
    }
  }, 60_000); // Pesado: folga para a suíte em paralelo.
});

function lerCsv(arquivo: string): Par[] {
  return readFileSync(arquivo, 'utf8')
    .trim()
    .split('\n')
    .map((l) => {
      const [de, para, acc, dist, tempo] = l.split(',');
      return [de, para, acc === '1', Number(tempo), Number(dist)];
    });
}

const chave = (de: string, para: string, acc: boolean) =>
  `${de}|${para}|${+acc}`;

describe.skipIf(!CSV_TEMPO || !CSV_DISTANCIA)(
  'rotas x PUCMaps (comparação completa)',
  () => {
    it(
      'todos os pares, as duas referências e prédio → prédio',
      () => {
        const tempo = lerCsv(CSV_TEMPO!);
        const distancia = lerCsv(CSV_DISTANCIA!);
        const refTempo = new Map(
          tempo.map((p) => [chave(p[0], p[1], p[2]), p]),
        );

        // 1) TEMPO: mesmo ótimo em todos os pares alcançáveis.
        let inicio = performance.now();
        let menorDistanciaNoEmpate = 0;
        for (const par of tempo) {
          if (confereTempo(par).distancia < par[4] - 1e-6)
            menorDistanciaNoEmpate++;
        }
        const msPar = (performance.now() - inicio) / tempo.length;

        // 2) DISTÂNCIA: mesmo ótimo de metros quando o custo é distância.
        inicio = performance.now();
        for (const par of distancia) confereDistancia(par);
        const msParDistancia = (performance.now() - inicio) / distancia.length;
        const mesmosPares =
          distancia.length === tempo.length &&
          distancia.every((p) => refTempo.has(chave(p[0], p[1], p[2])));
        expect(mesmosPares).toBe(true);

        // 3) Alcançabilidade idêntica (busca em largura a partir de cada nó).
        const ids = [...grafo.nos.keys()].sort();
        const inalcancaveis: Array<[string, string, boolean]> = [];
        let divergencias = 0;
        for (const acessivel of [false, true]) {
          for (const de of ids) {
            const vistos = new Set([de]);
            const fila = [de];
            while (fila.length) {
              for (const e of grafo.saidas.get(fila.pop()!) ?? []) {
                if ((!acessivel || e.acessivel) && !vistos.has(e.destino)) {
                  vistos.add(e.destino);
                  fila.push(e.destino);
                }
              }
            }
            for (const para of ids) {
              if (para === de) continue;
              const tinha = refTempo.has(chave(de, para, acessivel));
              if (tinha !== vistos.has(para)) divergencias++;
              if (!tinha) inalcancaveis.push([de, para, acessivel]);
            }
          }
        }
        expect(divergencias).toBe(0);

        // 4) Prédio → prédio. O PUCMaps escolhia, entre as rotas nó → nó (de
        // menor tempo), o par de MENOR DISTÂNCIA (ORDER BY distanceMeters
        // LIMIT 1). O novo escolhe o par de menor TEMPO.
        const predios = [...grafo.predios.values()]
          .filter((p) => p.nos.length)
          .map((p) => p.id);
        const escolhas: Par[] = [];
        let maisRapidos = 0;
        let ganhoMax = 0;
        let ganhoTotal = 0;
        let distanciaExtraMax = 0;
        let msPredio = 0;
        for (const acessivel of [false, true]) {
          for (const a of predios) {
            for (const b of predios) {
              if (a === b) continue;
              let antigo: Par | undefined;
              for (const na of grafo.predios.get(a)!.nos) {
                for (const nb of grafo.predios.get(b)!.nos) {
                  const p = refTempo.get(chave(na, nb, acessivel));
                  if (p && (!antigo || p[4] < antigo[4])) antigo = p;
                }
              }
              if (!antigo) continue;
              const t0 = performance.now();
              const r = predioAPredio(a, b, acessivel);
              msPredio += performance.now() - t0;
              expect(r.tempo).toBeLessThanOrEqual(antigo[3]);
              if (r.tempo < antigo[3]) {
                maisRapidos++;
                ganhoTotal += antigo[3] - r.tempo;
                ganhoMax = Math.max(ganhoMax, antigo[3] - r.tempo);
                distanciaExtraMax = Math.max(
                  distanciaExtraMax,
                  r.distancia - antigo[4],
                );
              }
              escolhas.push([a, b, acessivel, antigo[3], antigo[4]]);
            }
          }
        }

        // 5) Quanto o critério antigo (distância) diferia do atual (tempo).
        let rotasDiferentes = 0;
        for (const p of distancia) {
          if (refTempo.get(chave(p[0], p[1], p[2]))![4] > p[4] + 1e-6)
            rotasDiferentes++;
        }

        const resumo = JSON.stringify({
          pares: tempo.length,
          paresAcessiveis: tempo.filter((p) => p[2]).length,
          menorDistanciaNoEmpate,
          paresOndeTempoEDistanciaDivergem: rotasDiferentes,
          inalcancaveis: inalcancaveis.length,
          divergenciasAlcance: divergencias,
          msPorParNoANo: Number(msPar.toFixed(4)),
          msPorParNoANoDistancia: Number(msParDistancia.toFixed(4)),
          paresPredio: escolhas.length,
          paresPredioMaisRapidos: maisRapidos,
          ganhoMedioS: maisRapidos
            ? Number((ganhoTotal / maisRapidos).toFixed(1))
            : 0,
          ganhoMaxS: ganhoMax,
          distanciaExtraMaxM: Number(distanciaExtraMax.toFixed(1)),
          msPorRotaPredio: Number((msPredio / escolhas.length).toFixed(4)),
        });
        console.log(resumo);
        if (process.env.PUCMAPS_ROTAS_RESUMO) {
          writeFileSync(
            process.env.PUCMAPS_ROTAS_RESUMO,
            `${resumo}
`,
          );
        }

        if (process.env.PUCMAPS_ROTAS_FIXTURE === '1') {
          const cada = <T>(lista: T[], n: number) =>
            lista
              .filter(
                (_, i) => i % Math.max(1, Math.floor(lista.length / n)) === 0,
              )
              .slice(0, n);
          const amostra: Amostra = {
            origem: {
              banco: 'pucmaps (docker local)',
              versao: 12,
              commitPucmaps: '776e113',
              pares: tempo.length,
            },
            tempo: [
              ...cada(
                tempo.filter((p) => !p[2]),
                160,
              ),
              ...cada(
                tempo.filter((p) => p[2]),
                160,
              ),
            ],
            distancia: [
              ...cada(
                distancia.filter((p) => !p[2]),
                60,
              ),
              ...cada(
                distancia.filter((p) => p[2]),
                60,
              ),
            ],
            inalcancaveis: [
              ...cada(
                inalcancaveis.filter((p) => !p[2]),
                20,
              ),
              // Alcançáveis a pé, mas não no modo acessível (escadas).
              ...cada(
                inalcancaveis.filter(
                  (p) => p[2] && refTempo.has(chave(p[0], p[1], false)),
                ),
                20,
              ),
            ],
            predios: cada(escolhas, 200),
          };
          writeFileSync(ARQUIVO_AMOSTRA, `${JSON.stringify(amostra)}\n`);
        }
      },
      30 * 60_000,
    );
  },
);
