/**
 * Grafo de rotas montado direto do snapshot versionado (`pucmaps-12.json`),
 * com as mesmas regras do carregamento do banco em `RotasService`: centro do
 * prédio = centro do bbox do polígono (ou o ponto, nos portões).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validarSnapshot,
  type SnapshotMapa,
} from '../src/mapa/importacao/snapshot.js';
import type { Coordenada } from '../src/mapa/rotas/geo.js';
import { construirGrafo, type Grafo } from '../src/mapa/rotas/grafo.js';

export function lerSnapshot(): SnapshotMapa {
  return validarSnapshot(
    JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../scripts/mapa/dados/pucmaps-12.json'),
        'utf8',
      ),
    ),
  );
}

/**
 * `custo: 'distancia'` troca tempo e distância das arestas: o mesmo Dijkstra
 * passa a minimizar metros (critério do PUCMaps antes do commit 69b2de0).
 */
export function grafoDoSnapshot(
  s: SnapshotMapa,
  opcoes: { custo?: 'tempo' | 'distancia' } = {},
): Grafo {
  const porDistancia = opcoes.custo === 'distancia';
  return construirGrafo({
    versao: s.codigo,
    nos: s.nos.map((n) => ({
      id: n.id,
      predioId: n.predioId,
      coordenada: n.localizacao.coordinates as Coordenada,
    })),
    arestas: s.arestas.map((e) => ({
      id: e.id,
      origem: e.origem,
      destino: e.destino,
      distancia: porDistancia ? e.tempoCaminhadaS : e.distanciaM,
      tempo: porDistancia ? e.distanciaM : e.tempoCaminhadaS,
      acessivel: e.acessivel,
      geometria: (e.geometria?.coordinates as Coordenada[] | undefined) ?? null,
    })),
    predios: s.predios.map((p) => {
      const aneis = p.poligono?.coordinates as Coordenada[][] | undefined;
      let centro = p.localizacao.coordinates as Coordenada;
      if (aneis) {
        const xs = aneis.flat().map((c) => c[0]);
        const ys = aneis.flat().map((c) => c[1]);
        centro = [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        ];
      }
      return { id: p.id, nome: p.nome, poligono: aneis ?? null, centro };
    }),
  });
}
