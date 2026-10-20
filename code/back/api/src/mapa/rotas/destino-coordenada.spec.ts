import { construirGrafo } from './grafo.js';
import type { Coordenada } from './geo.js';
import { calcularRota } from './rota.js';

// Custos assimétricos são intencionais: tempo não é necessariamente distância/1,4.
const pos = (x: number, y = 0): Coordenada => [
  -43.99 + x * 0.0001,
  -19.92 + y * 0.0001,
];
function exemplo() {
  const pontos = { s: pos(5, 10), a: pos(0), b: pos(10) };
  return construirGrafo({
    versao: 'regressao',
    nos: Object.entries(pontos).map(([id, coordenada]) => ({
      id,
      coordenada,
      predioId: id === 's' ? 'P01' : null,
    })),
    predios: [{ id: 'P01', nome: 'Origem', centro: pontos.s, poligono: null }],
    arestas: [
      {
        id: 'sa',
        origem: 's',
        destino: 'a',
        tempo: 1,
        distancia: 100,
        acessivel: true,
        geometria: [pontos.s, pontos.a],
      },
      {
        id: 'sb',
        origem: 's',
        destino: 'b',
        tempo: 2,
        distancia: 100,
        acessivel: true,
        geometria: [pontos.s, pontos.b],
      },
      {
        id: 'ab',
        origem: 'a',
        destino: 'b',
        tempo: 100,
        distancia: 100,
        acessivel: true,
        geometria: [pontos.a, pontos.b],
      },
      {
        id: 'ba',
        origem: 'b',
        destino: 'a',
        tempo: 100,
        distancia: 100,
        acessivel: true,
        geometria: [pontos.b, pontos.a],
      },
    ],
  });
}

describe('custo total até destino por coordenada', () => {
  it('prefere 2s até b + 10s finais a 1s até a + 90s finais', () => {
    const rota = calcularRota(exemplo(), {
      origem: { tipo: 'predio', predioId: 'P01' },
      destino: { tipo: 'coordenada', coordenada: pos(9) },
      acessivel: false,
    });
    expect(rota.tempo).toBeCloseTo(12, 5);
    expect(rota.geometria).toContainEqual(pos(10));
    expect(rota.geometria).not.toContainEqual(pos(0));
  });

  it('compara o atalho na mesma aresta com um caminho mais rápido pelo grafo', () => {
    const base = exemplo();
    const g = construirGrafo({
      versao: 'atalho',
      nos: [...base.nos.values()],
      predios: [],
      arestas: [
        ...base.arestas,
        {
          id: 'as',
          origem: 'a',
          destino: 's',
          tempo: 1,
          distancia: 100,
          acessivel: true,
          geometria: [pos(0), pos(5, 10)],
        },
      ],
    });
    const rota = calcularRota(g, {
      origem: { tipo: 'coordenada', coordenada: pos(1) },
      destino: { tipo: 'coordenada', coordenada: pos(9) },
      acessivel: false,
    });
    // 10s até a + 1s a→s + 2s s→b + 10s finais; direto custa 80s.
    expect(rota.tempo).toBeCloseTo(23, 5);
    expect(rota.geometria).toContainEqual(pos(5, 10));
  });
});
