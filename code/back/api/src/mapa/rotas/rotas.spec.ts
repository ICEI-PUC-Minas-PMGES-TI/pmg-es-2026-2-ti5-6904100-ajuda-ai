import { menorCaminho, FilaPrioridade, type Custo } from './dijkstra.js';
import {
  dentroDoPoligono,
  distanciaAoPoligono,
  distanciaMetros,
  projetarNaLinha,
  type Coordenada,
} from './geo.js';
import { construirGrafo, type ArestaGrafo, type Grafo } from './grafo.js';
import {
  calcularRota,
  RotaImpossivel,
  type FalhaRota,
  type PontaRota,
} from './rota.js';

/** Coordenada em "passos" de 1e-4° a partir de um ponto do campus (~10,5 m × 11,1 m). */
const c = (dx: number, dy: number): Coordenada => [
  -43.99 + dx * 1e-4,
  -19.92 + dy * 1e-4,
];
const quadrado = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Coordenada[][] => [[c(x0, y0), c(x1, y0), c(x1, y1), c(x0, y1), c(x0, y0)]];

interface Def {
  nos: Record<string, [number, number, string?]>;
  /** `id: [origem, destino, tempo?, distancia?, acessivel?, geometria?]` */
  arestas?: Record<string, [string, string, number?, number?, boolean?, null?]>;
  predios?: Record<string, Coordenada[][] | null>;
}

/** Grafo dirigido sintético; tempo/distância padrão = haversine a 1,4 m/s. */
function grafo(def: Def): Grafo {
  const pos = (id: string) => c(def.nos[id][0], def.nos[id][1]);
  return construirGrafo({
    versao: 'teste',
    nos: Object.entries(def.nos).map(([id, [x, y, predio]]) => ({
      id,
      coordenada: c(x, y),
      predioId: predio ?? null,
    })),
    arestas: Object.entries(def.arestas ?? {}).map(
      ([id, [o, d, tempo, distancia, acessivel, geometria]]): ArestaGrafo => {
        const dist = distancia ?? distanciaMetros(pos(o), pos(d));
        return {
          id,
          origem: o,
          destino: d,
          distancia: dist,
          tempo: tempo ?? dist / 1.4,
          acessivel: acessivel ?? true,
          geometria: geometria === null ? null : [pos(o), pos(d)],
        };
      },
    ),
    predios: Object.entries(def.predios ?? {}).map(([id, poligono]) => ({
      id,
      nome: `Prédio ${id}`,
      poligono,
      centro: poligono ? centro(poligono) : c(0, 0),
    })),
  });
}

function centro(p: Coordenada[][]): Coordenada {
  const xs = p[0].map((v) => v[0]);
  const ys = p[0].map((v) => v[1]);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

/** Ida e volta com o mesmo custo (como os caminhos do OSM no PUCMaps). */
function duplo(
  id: string,
  o: string,
  d: string,
  tempo?: number,
  distancia?: number,
  acessivel?: boolean,
): Def['arestas'] {
  return {
    [`${id}a`]: [o, d, tempo, distancia, acessivel],
    [`${id}b`]: [d, o, tempo, distancia, acessivel],
  };
}

function caminho(
  g: Grafo,
  de: string | Record<string, Custo>,
  para: string | string[],
  acessivel = false,
) {
  const origens =
    typeof de === 'string'
      ? new Map([[de, { tempo: 0, distancia: 0 }]])
      : new Map(Object.entries(de));
  return menorCaminho({
    grafo: g,
    origens,
    destinos: new Set(typeof para === 'string' ? [para] : para),
    acessivel,
  });
}

function falha(fn: () => unknown): FalhaRota {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof RotaImpossivel) return erro.motivo;
    throw erro;
  }
  throw new Error('esperava RotaImpossivel');
}

describe('geo', () => {
  it('haversine com o raio do PUCMaps', () => {
    // 1e-3° de latitude = 6371e3 × π/180 × 1e-3
    expect(distanciaMetros([0, 0], [0, 0.001])).toBeCloseTo(111.195, 2);
    expect(distanciaMetros(c(0, 0), c(0, 0))).toBe(0);
  });

  it('projeta no segmento certo e mede ao longo da linha', () => {
    const linha = [c(0, 0), c(10, 0), c(10, 10)];
    const p = projetarNaLinha(c(12, 5), linha);
    expect(p.segmento).toBe(1);
    expect(p.ponto[0]).toBeCloseTo(c(10, 0)[0], 9);
    expect(p.ponto[1]).toBeCloseTo(c(10, 5)[1], 9);
    expect(p.distancia).toBeCloseTo(distanciaMetros(c(12, 5), c(10, 5)), 1);
    expect(p.aoLongo).toBeCloseTo(
      distanciaMetros(c(0, 0), c(10, 0)) + distanciaMetros(c(10, 0), c(10, 5)),
      1,
    );
    // Antes do início: encosta no primeiro vértice.
    expect(projetarNaLinha(c(-5, 0), linha).aoLongo).toBe(0);
  });

  it('dentro/fora do polígono e distância ao contorno', () => {
    const q = quadrado(0, 0, 10, 10);
    expect(dentroDoPoligono(c(5, 5), q)).toBe(true);
    expect(dentroDoPoligono(c(15, 5), q)).toBe(false);
    expect(distanciaAoPoligono(c(5, 5), q)).toBe(0);
    expect(distanciaAoPoligono(c(15, 5), q)).toBeCloseTo(
      distanciaMetros(c(15, 5), c(10, 5)),
      1,
    );
  });
});

describe('FilaPrioridade', () => {
  it('retira em ordem de custo, com desempate estável', () => {
    const fila = new FilaPrioridade();
    const custos = Array.from({ length: 200 }, (_, i) => ({
      no: `n${String(i % 37).padStart(2, '0')}`,
      custo: { tempo: (i * 7919) % 50, distancia: (i * 104729) % 13 },
    }));
    for (const { no, custo } of custos) fila.inserir(no, custo);
    const saida = [];
    for (let item = fila.retirar(); item; item = fila.retirar())
      saida.push(item);
    const esperado = [...custos].sort(
      (a, b) =>
        a.custo.tempo - b.custo.tempo ||
        a.custo.distancia - b.custo.distancia ||
        (a.no < b.no ? -1 : a.no > b.no ? 1 : 0),
    );
    expect(saida.map((s) => [s.no, s.custo])).toEqual(
      esperado.map((s) => [s.no, s.custo]),
    );
    expect(fila.tamanho).toBe(0);
  });
});

describe('construirGrafo', () => {
  it('recusa aresta para nó inexistente e custo negativo', () => {
    expect(() =>
      grafo({
        nos: { A: [0, 0] },
        arestas: { e: ['A', 'X', 1, 1, true, null] },
      }),
    ).toThrow(/inexistente/);
    expect(() =>
      grafo({ nos: { A: [0, 0], B: [1, 0] }, arestas: { e: ['A', 'B', -1] } }),
    ).toThrow(/custo/);
  });

  it('agrupa os nós por prédio', () => {
    const g = grafo({
      nos: { B: [0, 0, 'P'], A: [1, 0, 'P'], C: [2, 0] },
      predios: { P: quadrado(-1, -1, 2, 1), Q: null },
    });
    expect(g.predios.get('P')!.nos).toEqual(['A', 'B']);
    expect(g.predios.get('Q')!.nos).toEqual([]);
  });
});

describe('Dijkstra (menorCaminho)', () => {
  it('caminho único', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 0], C: [20, 0] },
      arestas: {
        ...duplo('ab', 'A', 'B', 10, 100),
        ...duplo('bc', 'B', 'C', 20, 100),
      },
    });
    const r = caminho(g, 'A', 'C')!;
    expect(r.nos).toEqual(['A', 'B', 'C']);
    expect(r.arestas.map((e) => e.id)).toEqual(['aba', 'bca']);
    expect(r.tempo).toBe(30);
    expect(r.distancia).toBe(200);
  });

  it('dois caminhos: vence o de menor TEMPO, mesmo sendo mais longo', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 5], C: [10, -5], D: [20, 0] },
      arestas: {
        // Mais curto, mas com escadas (lento).
        ...duplo('ab', 'A', 'B', 100, 50),
        ...duplo('bd', 'B', 'D', 100, 50),
        // Mais longo, porém mais rápido.
        ...duplo('ac', 'A', 'C', 60, 80),
        ...duplo('cd', 'C', 'D', 60, 80),
      },
    });
    const r = caminho(g, 'A', 'D')!;
    expect(r.nos).toEqual(['A', 'C', 'D']);
    expect(r.tempo).toBe(120);
    expect(r.distancia).toBe(160);
  });

  it('empate de tempo: vence a menor distância', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 5], C: [10, -5], D: [20, 0] },
      arestas: {
        ab: ['A', 'B', 50, 90],
        bd: ['B', 'D', 50, 90],
        ac: ['A', 'C', 50, 70],
        cd: ['C', 'D', 50, 70],
      },
    });
    expect(caminho(g, 'A', 'D')!.nos).toEqual(['A', 'C', 'D']);
  });

  it('desconectado: null', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 0], C: [20, 0], D: [30, 0] },
      arestas: { ...duplo('ab', 'A', 'B'), ...duplo('cd', 'C', 'D') },
    });
    expect(caminho(g, 'A', 'D')).toBeNull();
    expect(caminho(g, 'A', 'B')).not.toBeNull();
  });

  it('respeita a direção das arestas', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 0], C: [5, 10] },
      arestas: { ab: ['A', 'B', 10], ba1: ['B', 'C', 10], ba2: ['C', 'A', 10] },
    });
    expect(caminho(g, 'A', 'B')!.nos).toEqual(['A', 'B']);
    // B → A só pelo contorno, porque não existe aresta B → A.
    expect(caminho(g, 'B', 'A')!.nos).toEqual(['B', 'C', 'A']);
    const so = grafo({
      nos: { A: [0, 0], B: [10, 0] },
      arestas: { ab: ['A', 'B'] },
    });
    expect(caminho(so, 'B', 'A')).toBeNull();
  });

  it('acessível: ignora arestas não acessíveis', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 0], C: [5, 10] },
      arestas: {
        ...duplo('ab', 'A', 'B', 30, 40, false), // escada
        ...duplo('ac', 'A', 'C', 40, 60),
        ...duplo('cb', 'C', 'B', 40, 60),
      },
    });
    expect(caminho(g, 'A', 'B', false)!.nos).toEqual(['A', 'B']);
    const acessivel = caminho(g, 'A', 'B', true)!;
    expect(acessivel.nos).toEqual(['A', 'C', 'B']);
    expect(acessivel.arestas.every((e) => e.acessivel)).toBe(true);
    const so = grafo({
      nos: { A: [0, 0], B: [10, 0] },
      arestas: duplo('ab', 'A', 'B', 1, 1, false),
    });
    expect(caminho(so, 'A', 'B', true)).toBeNull();
  });

  it('ciclo não prende o algoritmo', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 0], C: [10, 10], D: [0, 10], E: [30, 0] },
      arestas: {
        ab: ['A', 'B', 1],
        bc: ['B', 'C', 1],
        cd: ['C', 'D', 1],
        da: ['D', 'A', 1],
        ce: ['C', 'E', 5],
      },
    });
    const r = caminho(g, 'A', 'E')!;
    expect(r.nos).toEqual(['A', 'B', 'C', 'E']);
    expect(caminho(g, 'A', 'X')).toBeNull();
  });

  it('aresta de comprimento zero (conector de entrada) é usada', () => {
    const g = grafo({
      nos: { E: [0, 0, 'P'], N: [0, 0], M: [10, 0] },
      arestas: {
        en: ['E', 'N', 1, 0, true, null],
        ne: ['N', 'E', 1, 0, true, null],
        ...duplo('nm', 'N', 'M', 10, 100),
      },
    });
    const r = caminho(g, 'M', 'E')!;
    expect(r.nos).toEqual(['M', 'N', 'E']);
    expect(r.tempo).toBe(11);
    expect(r.distancia).toBe(100);
  });

  it('origem = destino: caminho vazio de custo zero', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [1, 0] },
      arestas: duplo('ab', 'A', 'B'),
    });
    const r = caminho(g, 'A', 'A')!;
    expect(r.nos).toEqual(['A']);
    expect(r.arestas).toEqual([]);
    expect(r.tempo).toBe(0);
  });

  it('várias origens (com custo inicial) e vários destinos', () => {
    const g = grafo({
      nos: { O1: [0, 0], O2: [0, 10], M: [10, 5], D1: [20, 0], D2: [20, 10] },
      arestas: {
        a: ['O1', 'M', 10],
        b: ['O2', 'M', 10],
        c: ['M', 'D1', 30],
        d: ['M', 'D2', 20],
      },
    });
    const r = caminho(
      g,
      { O1: { tempo: 8, distancia: 0 }, O2: { tempo: 3, distancia: 0 } },
      ['D1', 'D2'],
    )!;
    expect(r.origem).toBe('O2');
    expect(r.destino).toBe('D2');
    expect(r.tempo).toBe(33);
  });

  it('é determinístico entre execuções', () => {
    const g = grafo({
      nos: { A: [0, 0], B: [10, 5], C: [10, -5], D: [20, 0] },
      arestas: {
        ab: ['A', 'B', 5, 5],
        bd: ['B', 'D', 5, 5],
        ac: ['A', 'C', 5, 5],
        cd: ['C', 'D', 5, 5],
      },
    });
    const primeiro = caminho(g, 'A', 'D')!.nos;
    for (let i = 0; i < 20; i++)
      expect(caminho(g, 'A', 'D')!.nos).toEqual(primeiro);
    expect(primeiro).toEqual(['A', 'B', 'D']); // empate total: menor id primeiro
  });
});

describe('calcularRota (encaixe + geometria)', () => {
  // N1 ──── N2 ──── N3, ida e volta; PA em N1, PB em N3; PC sem nó, perto de
  // N3; PD sem nó, longe; PE com nó isolado, longe de tudo.
  const base: Def = {
    nos: {
      N1: [0, 0, 'PA'],
      N2: [10, 0],
      N3: [20, 0, 'PB'],
      N4: [0, 30, 'PE'],
    },
    arestas: { ...duplo('e12', 'N1', 'N2'), ...duplo('e23', 'N2', 'N3') },
    predios: {
      PA: quadrado(-1, -1, 1, 1),
      PB: quadrado(19, -1, 21, 1),
      PC: quadrado(22, 2, 24, 4),
      PD: quadrado(60, 60, 62, 62),
      PE: quadrado(-3, 27, 3, 33),
    },
  };
  const g = grafo(base);
  const L = distanciaMetros(c(0, 0), c(10, 0));
  const rota = (
    origem: PontaRota,
    destino: string,
    acessivel = false,
    gr = g,
  ) =>
    calcularRota(gr, {
      origem,
      destino: { tipo: 'predio', predioId: destino },
      acessivel,
    });

  it('prédio → prédio pelas entradas, geometria orientada', () => {
    const r = rota({ tipo: 'predio', predioId: 'PA' }, 'PB');
    expect(r.distancia).toBeCloseTo(2 * L, 6);
    expect(r.tempo).toBeCloseTo((2 * L) / 1.4, 6);
    expect(r.geometria).toEqual([c(0, 0), c(10, 0), c(20, 0)]);
    expect(r.origem.conexao).toBe('entrada');
    expect(r.destino.predio!.id).toBe('PB');
    expect(rota({ tipo: 'predio', predioId: 'PB' }, 'PA').geometria).toEqual([
      c(20, 0),
      c(10, 0),
      c(0, 0),
    ]);
  });

  it('coordenada encaixa na aresta mais próxima e soma o trecho parcial', () => {
    const p = c(5, 1);
    const r = rota({ tipo: 'coordenada', coordenada: p }, 'PB');
    const afastamento = distanciaMetros(p, c(5, 0));
    expect(r.origem.conexao).toBe('caminho');
    expect(r.distancia).toBeCloseTo(afastamento + L / 2 + L, 0);
    expect(r.tempo).toBeCloseTo((afastamento + L / 2 + L) / 1.4, 0);
    // Começa no usuário, desce até o caminho e termina na entrada.
    expect(r.geometria[0]).toEqual(p);
    expect(r.geometria[1][0]).toBeCloseTo(c(5, 0)[0], 9);
    expect(r.geometria[1][1]).toBeCloseTo(c(5, 0)[1], 9);
    expect(r.geometria.at(-1)).toEqual(c(20, 0));
    // Para o outro lado, sai pelo extremo oposto da mesma aresta.
    const volta = rota({ tipo: 'coordenada', coordenada: p }, 'PA');
    expect(volta.distancia).toBeCloseTo(afastamento + L / 2, 0);
    expect(volta.geometria.at(-1)).toEqual(c(0, 0));
  });

  it('coordenada respeita a direção da aresta encaixada', () => {
    const umaMao = grafo({
      ...base,
      arestas: { ...duplo('e12', 'N1', 'N2'), e23: ['N2', 'N3'] },
    });
    const p = c(15, 1); // perto do trecho de mão única N2 → N3
    expect(
      rota({ tipo: 'coordenada', coordenada: p }, 'PB', false, umaMao)
        .distancia,
    ).toBeLessThan(L);
    expect(
      falha(() =>
        rota({ tipo: 'coordenada', coordenada: p }, 'PA', false, umaMao),
      ),
    ).toBe('sem-caminho');
  });

  it(`origem a mais de 30 m de qualquer caminho: origem-fora`, () => {
    expect(
      falha(() => rota({ tipo: 'coordenada', coordenada: c(5, 10) }, 'PB')),
    ).toBe('origem-fora');
  });

  it('coordenada dentro de prédio sem caminho próximo usa as entradas dele', () => {
    expect(
      falha(() => rota({ tipo: 'coordenada', coordenada: c(0, 31) }, 'PE')),
    ).toBe('mesmo-local');
    // N4 não tem arestas: entra no prédio, mas não há caminho.
    expect(
      falha(() => rota({ tipo: 'coordenada', coordenada: c(0, 31) }, 'PB')),
    ).toBe('sem-caminho');
  });

  it('origem = destino', () => {
    expect(falha(() => rota({ tipo: 'predio', predioId: 'PA' }, 'PA'))).toBe(
      'mesmo-local',
    );
    expect(
      falha(() => rota({ tipo: 'coordenada', coordenada: c(20, 0) }, 'PB')),
    ).toBe('mesmo-local');
  });

  it('prédio sem nó: nó mais próximo até 50 m; além disso, sem conexão', () => {
    const r = rota({ tipo: 'predio', predioId: 'PA' }, 'PC');
    expect(r.destino.conexao).toBe('proximidade');
    const ate = distanciaAoPoligono(c(20, 0), quadrado(22, 2, 24, 4));
    expect(ate).toBeGreaterThan(20);
    expect(r.distancia).toBeCloseTo(2 * L + ate, 6);
    expect(r.geometria.at(-1)).toEqual(c(20, 0));
    expect(falha(() => rota({ tipo: 'predio', predioId: 'PA' }, 'PD'))).toBe(
      'predio-sem-conexao',
    );
    expect(falha(() => rota({ tipo: 'predio', predioId: 'PD' }, 'PA'))).toBe(
      'predio-sem-conexao',
    );
  });

  it('prédio inexistente', () => {
    expect(falha(() => rota({ tipo: 'predio', predioId: 'PA' }, 'PX'))).toBe(
      'predio-inexistente',
    );
    expect(falha(() => rota({ tipo: 'predio', predioId: 'PX' }, 'PA'))).toBe(
      'predio-inexistente',
    );
  });

  it('acessível: não encaixa nem passa por escada', () => {
    const escada = grafo({
      nos: { ...base.nos, N5: [10, 10] },
      arestas: {
        ...duplo('e12', 'N1', 'N2'),
        ...duplo('e23', 'N2', 'N3', undefined, undefined, false),
        ...duplo('e25', 'N2', 'N5'),
        ...duplo('e53', 'N5', 'N3'),
      },
      predios: base.predios,
    });
    const normal = rota(
      { tipo: 'predio', predioId: 'PA' },
      'PB',
      false,
      escada,
    );
    const acessivel = rota(
      { tipo: 'predio', predioId: 'PA' },
      'PB',
      true,
      escada,
    );
    expect(normal.geometria).toEqual([c(0, 0), c(10, 0), c(20, 0)]);
    expect(acessivel.geometria).toEqual([
      c(0, 0),
      c(10, 0),
      c(10, 10),
      c(20, 0),
    ]);
    expect(acessivel.tempo).toBeGreaterThan(normal.tempo);
    // Ponto junto à escada: no modo acessível encaixa em outro trecho.
    const p = c(17, 1);
    const naEscada = rota(
      { tipo: 'coordenada', coordenada: p },
      'PB',
      false,
      escada,
    );
    expect(naEscada.geometria[1][1]).toBeCloseTo(c(17, 0)[1], 9);
    const r = rota({ tipo: 'coordenada', coordenada: p }, 'PB', true, escada);
    // Encaixa em N5 → N3 (acima da escada), não no degrau mais próximo.
    expect(r.geometria[1][1]).toBeGreaterThan(c(17, 1)[1]);
    expect(r.geometria.at(-1)).toEqual(c(20, 0));
  });

  it('conector zero não gera ponto repetido na geometria', () => {
    const z = grafo({
      nos: { E: [0, 0, 'PA'], N: [0, 0], M: [10, 0], F: [10, 0, 'PB'] },
      arestas: {
        en: ['E', 'N', 1, 0, true, null],
        ...duplo('nm', 'N', 'M'),
        mf: ['M', 'F', 1, 0, true, null],
      },
      predios: { PA: quadrado(-1, -1, 1, 1), PB: quadrado(9, -1, 11, 1) },
    });
    const r = rota({ tipo: 'predio', predioId: 'PA' }, 'PB', false, z);
    expect(r.geometria).toEqual([c(0, 0), c(10, 0)]);
    expect(r.tempo).toBeCloseTo(L / 1.4 + 2, 6);
    expect(r.arestas).toBe(3);
  });
});
