// Benchmark local do snapshot; sem .env, banco, HTTP ou dados de usuário.
// Executar na raiz: node --expose-gc code/back/api/scripts/mapa/medir-rotas.mjs
import { readFileSync } from 'node:fs';
import { construirGrafo } from '../../dist/mapa/rotas/grafo.js';
import { calcularRota } from '../../dist/mapa/rotas/rota.js';

const snapshot = JSON.parse(readFileSync(new URL('./dados/pucmaps-12.json', import.meta.url), 'utf8'));
globalThis.gc?.();
const antes = process.memoryUsage().heapUsed;
const inicio = performance.now();
const grafo = construirGrafo({
  versao: snapshot.codigo,
  nos: snapshot.nos.map(n => ({ id: n.id, predioId: n.predioId, coordenada: n.localizacao.coordinates })),
  arestas: snapshot.arestas.map(e => ({ id: e.id, origem: e.origem, destino: e.destino, tempo: e.tempoCaminhadaS, distancia: e.distanciaM, acessivel: e.acessivel, geometria: e.geometria?.coordinates ?? null })),
  predios: snapshot.predios.map(p => {
    const pontos = p.poligono?.coordinates.flat();
    const centro = pontos ? [
      (Math.min(...pontos.map(c => c[0])) + Math.max(...pontos.map(c => c[0]))) / 2,
      (Math.min(...pontos.map(c => c[1])) + Math.max(...pontos.map(c => c[1]))) / 2,
    ] : p.localizacao.coordinates;
    return { id: p.id, nome: p.nome, centro, poligono: p.poligono?.coordinates ?? null };
  }),
});
const montarMs = performance.now() - inicio;
globalThis.gc?.();
const heapDeltaBytes = process.memoryUsage().heapUsed - antes;
const cenarios = [];
for (const acessivel of [false, true]) {
  const pedido = { origem: { tipo: 'predio', predioId: 'P03' }, destino: { tipo: 'predio', predioId: 'P45' }, acessivel };
  for (let i = 0; i < 100; i++) calcularRota(grafo, pedido);
  const tempos = [];
  let resultado;
  for (let i = 0; i < 1000; i++) {
    const t = performance.now();
    resultado = calcularRota(grafo, pedido);
    tempos.push(performance.now() - t);
  }
  tempos.sort((a, b) => a - b);
  cenarios.push({ origem: 'P03', destino: 'P45', acessivel, amostras: tempos.length, medianaMs: tempos[500], p95Ms: tempos[949], maxMs: tempos.at(-1), visitados: resultado.visitados });
}
const medicao = { ambiente: 'Node.js local, CPU do host, sem HTTP/DB; não representa latência de produção nem dispositivo físico', node: process.version, snapshot: snapshot.codigo, montarMs, heapDeltaBytes, aquecimentoPorCenario: 100, cenarios };
console.log(JSON.stringify(medicao, null, 2));
