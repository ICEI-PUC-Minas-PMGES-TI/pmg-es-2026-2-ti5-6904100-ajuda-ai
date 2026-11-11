import type { Coordenada } from './geo.js';

/**
 * Grafo de navegação de UMA versão, somente leitura e sem TypeORM: só o que o
 * cálculo usa. Arestas são DIRIGIDAS, como no PUCMaps (`pgr_dijkstra` com
 * `directed := true`); cada trecho existe nos dois sentidos na origem.
 */
export interface NoGrafo {
  readonly id: string;
  readonly coordenada: Coordenada;
  /** Chave estável do prédio quando o nó é entrada/centroide dele. */
  readonly predioId: string | null;
}

export interface ArestaGrafo {
  readonly id: string;
  readonly origem: string;
  readonly destino: string;
  /** Metros (haversine na origem). */
  readonly distancia: number;
  /** Segundos de caminhada: o custo da rota (como no PUCMaps). */
  readonly tempo: number;
  readonly acessivel: boolean;
  /**
   * Polilinha origem→destino. `null` nos 32 conectores de comprimento zero
   * (entrada do prédio sobre um nó de caminho): não desenham nada.
   */
  readonly geometria: readonly Coordenada[] | null;
}

export interface PredioGrafo {
  readonly id: string;
  readonly nome: string | null;
  readonly centro: Coordenada;
  /** Anéis do polígono (`null` em portões). */
  readonly poligono: readonly (readonly Coordenada[])[] | null;
  /** Nós ligados ao prédio na origem (entradas ou centroide), 0 a 9. */
  readonly nos: readonly string[];
}

export interface Grafo {
  readonly versao: string;
  readonly nos: ReadonlyMap<string, NoGrafo>;
  /** Arestas que saem de cada nó. */
  readonly saidas: ReadonlyMap<string, readonly ArestaGrafo[]>;
  readonly arestas: readonly ArestaGrafo[];
  readonly predios: ReadonlyMap<string, PredioGrafo>;
}

export function construirGrafo(dados: {
  versao: string;
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
  predios: Omit<PredioGrafo, 'nos'>[];
}): Grafo {
  const nos = new Map(dados.nos.map((n) => [n.id, Object.freeze(n)]));
  const saidas = new Map<string, ArestaGrafo[]>();
  for (const aresta of dados.arestas) {
    if (!nos.has(aresta.origem) || !nos.has(aresta.destino)) {
      throw new Error(`Aresta ${aresta.id} aponta para nó inexistente.`);
    }
    if (!(aresta.tempo >= 0) || !(aresta.distancia >= 0)) {
      throw new Error(`Aresta ${aresta.id} com custo inválido.`);
    }
    Object.freeze(aresta);
    const lista = saidas.get(aresta.origem);
    if (lista) lista.push(aresta);
    else saidas.set(aresta.origem, [aresta]);
  }
  const nosPorPredio = new Map<string, string[]>();
  for (const no of nos.values()) {
    if (!no.predioId) continue;
    const lista = nosPorPredio.get(no.predioId);
    if (lista) lista.push(no.id);
    else nosPorPredio.set(no.predioId, [no.id]);
  }
  const predios = new Map(
    dados.predios.map((p) => [
      p.id,
      Object.freeze({
        ...p,
        nos: Object.freeze((nosPorPredio.get(p.id) ?? []).sort()),
      }),
    ]),
  );
  return Object.freeze({
    versao: dados.versao,
    nos,
    saidas,
    arestas: Object.freeze([...dados.arestas]),
    predios,
  });
}
