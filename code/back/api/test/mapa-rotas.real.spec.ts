/**
 * Rotas no grafo REAL da versão `pucmaps-12` (snapshot versionado), sem banco:
 * as mesmas funções que o RotasService usa depois de carregar o grafo.
 */
import {
  distanciaMetros,
  comprimentoMetros,
  type Coordenada,
} from '../src/mapa/rotas/geo.js';
import {
  calcularRota,
  RotaImpossivel,
  type PontaRota,
} from '../src/mapa/rotas/rota.js';
import { grafoDoSnapshot, lerSnapshot } from './mapa-rotas.grafo.js';

const grafo = grafoDoSnapshot(lerSnapshot());
const coord = (no: string) => grafo.nos.get(no)!.coordenada;
const rota = (origem: PontaRota, destino: string, acessivel = false) =>
  calcularRota(grafo, {
    origem,
    destino: { tipo: 'predio', predioId: destino },
    acessivel,
  });
const predio = (id: string): PontaRota => ({ tipo: 'predio', predioId: id });

function motivo(fn: () => unknown) {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof RotaImpossivel) return erro.motivo;
    throw erro;
  }
  return null;
}

/** A linha termina numa entrada do prédio. */
function terminaEm(linha: Coordenada[], id: string) {
  const fim = linha.at(-1)!;
  return grafo.predios
    .get(id)!
    .nos.some((n) => distanciaMetros(coord(n), fim) < 0.01);
}

describe('grafo real pucmaps-12', () => {
  it('carrega como no banco', () => {
    expect(grafo.versao).toBe('pucmaps-12');
    expect(grafo.nos.size).toBe(653);
    expect(grafo.arestas.length).toBe(1654);
    expect(grafo.predios.size).toBe(101);
    expect(
      [...grafo.predios.values()].filter((p) => !p.nos.length),
    ).toHaveLength(8);
    expect(grafo.arestas.filter((e) => !e.geometria)).toHaveLength(32);
  });

  it('toda geometria de aresta vai da origem para o destino', () => {
    for (const e of grafo.arestas) {
      if (!e.geometria) {
        expect(distanciaMetros(coord(e.origem), coord(e.destino))).toBeLessThan(
          0.1,
        );
        continue;
      }
      expect(distanciaMetros(e.geometria[0], coord(e.origem))).toBeLessThan(
        0.01,
      );
      expect(
        distanciaMetros(e.geometria.at(-1)!, coord(e.destino)),
      ).toBeLessThan(0.01);
    }
  });

  it('Prédio 1 (PROGRAD) → Prédio 2', () => {
    const r = rota(predio('P01_R4751608'), 'P02');
    expect(r.tempo).toBeGreaterThan(0);
    expect(r.distancia).toBeGreaterThan(10);
    expect(r.distancia).toBeLessThan(600);
    const inicio = r.geometria[0];
    expect(grafo.predios.get('P01_R4751608')!.nos.map(coord)).toContainEqual(
      inicio,
    );
    expect(terminaEm(r.geometria, 'P02')).toBe(true);
    // A linha desenhada tem o comprimento somado das arestas.
    expect(
      Math.abs(comprimentoMetros(r.geometria) - r.distancia) / r.distancia,
    ).toBeLessThan(0.01);
  });

  it('Biblioteca (P26) → ICEI (P34), normal e acessível', () => {
    const normal = rota(predio('P26'), 'P34');
    const acessivel = rota(predio('P26'), 'P34', true);
    expect(terminaEm(normal.geometria, 'P34')).toBe(true);
    expect(terminaEm(acessivel.geometria, 'P34')).toBe(true);
    expect(acessivel.tempo).toBeGreaterThanOrEqual(normal.tempo);
    // Ida e volta custam o mesmo (cada trecho existe nos dois sentidos).
    expect(rota(predio('P34'), 'P26').tempo).toBe(normal.tempo);
  });

  it('rota acessível só usa arestas acessíveis', () => {
    // Pela geometria: cada par de pontos consecutivos pertence a uma aresta acessível.
    const segmentos = new Set<string>();
    for (const e of grafo.arestas) {
      if (!e.acessivel || !e.geometria) continue;
      for (let i = 1; i < e.geometria.length; i++) {
        segmentos.add(`${e.geometria[i - 1]}>${e.geometria[i]}`);
      }
    }
    const r = rota(predio('P26'), 'P04', true);
    for (let i = 1; i < r.geometria.length; i++) {
      expect(segmentos.has(`${r.geometria[i - 1]}>${r.geometria[i]}`)).toBe(
        true,
      );
    }
  });

  it('todos os pares de prédios com nós: rota válida ou sem caminho explícito', () => {
    const ids = [...grafo.predios.values()]
      .filter((p) => p.nos.length)
      .map((p) => p.id);
    let ok = 0;
    let semCaminho = 0;
    let maiorTempo = 0;
    const inicio = performance.now();
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        try {
          const r = rota(predio(a), b);
          ok++;
          maiorTempo = Math.max(maiorTempo, r.tempo);
          expect(r.geometria.length).toBeGreaterThanOrEqual(2);
          expect(terminaEm(r.geometria, b)).toBe(true);
        } catch (erro) {
          expect(erro).toBeInstanceOf(RotaImpossivel);
          expect((erro as RotaImpossivel).motivo).toBe('sem-caminho');
          semCaminho++;
        }
      }
    }
    const ms = (performance.now() - inicio) / (ok + semCaminho);
    expect(ok).toBeGreaterThan(0.9 * (ok + semCaminho));
    expect(maiorTempo).toBeLessThan(30 * 60); // campus: < 30 min a pé
    expect(ms).toBeLessThan(5);
  }, 60_000); // Pesado: folga para a suíte em paralelo.

  it('origem por coordenada no campus encaixa e começa no ponto do usuário', () => {
    // Ao lado da Biblioteca, fora do polígono.
    const centro = grafo.predios.get('P26')!.centro;
    const p: Coordenada = [centro[0] + 0.0004, centro[1] + 0.0002];
    const r = rota({ tipo: 'coordenada', coordenada: p }, 'P34');
    expect(r.origem.conexao).toBe('caminho');
    expect(r.geometria[0]).toEqual(p);
    expect(terminaEm(r.geometria, 'P34')).toBe(true);
  });

  it('coordenada fora do campus: origem-fora', () => {
    // Praça da Liberdade, a ~6 km.
    expect(
      motivo(() =>
        rota({ tipo: 'coordenada', coordenada: [-43.938, -19.932] }, 'P26'),
      ),
    ).toBe('origem-fora');
  });

  it('prédios sem nó próprio usam o nó mais próximo (até 50 m) ou recusam', () => {
    const semNo = [...grafo.predios.values()].filter((p) => !p.nos.length);
    const resultados = semNo.map(
      (p) => motivo(() => rota(predio('P26'), p.id)) ?? 'ok',
    );
    expect(
      resultados.every((r) => r === 'ok' || r === 'predio-sem-conexao'),
    ).toBe(true);
    expect(resultados).toContain('ok');
    const ok = semNo.find((_, i) => resultados[i] === 'ok')!;
    expect(rota(predio('P26'), ok.id).destino.conexao).toBe('proximidade');
  });

  it('é determinístico', () => {
    const a = rota(predio('P03'), 'P45');
    for (let i = 0; i < 5; i++) expect(rota(predio('P03'), 'P45')).toEqual(a);
  });
});
