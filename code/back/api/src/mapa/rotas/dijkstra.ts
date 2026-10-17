import type { ArestaGrafo, Grafo } from './grafo.js';

/** Custo lexicográfico: tempo (s) primeiro; distância (m) desempata. */
export interface Custo {
  tempo: number;
  distancia: number;
}

export interface Caminho {
  /** Nó de partida escolhido (um dos `origens`). */
  origem: string;
  /** Nó de chegada escolhido (um dos `destinos`). */
  destino: string;
  nos: string[];
  arestas: ArestaGrafo[];
  /** Inclui o custo inicial da origem escolhida. */
  tempo: number;
  distancia: number;
  visitados: number;
}

/**
 * Dijkstra dirigido, com várias origens (cada uma com custo inicial, ex.:
 * trecho até o nó a partir de um ponto encaixado) e vários destinos (as
 * entradas de um prédio): devolve o caminho de menor tempo até QUALQUER
 * destino. Com `acessivel`, só arestas `acessivel = true`.
 *
 * Empates: menor distância; depois ordem estável dos ids (determinístico).
 * Custos negativos são recusados ao construir o grafo.
 */
export function menorCaminho(entrada: {
  grafo: Grafo;
  origens: ReadonlyMap<string, Custo>;
  destinos: ReadonlySet<string>;
  acessivel: boolean;
}): Caminho | null {
  const { grafo, origens, destinos, acessivel } = entrada;
  if (!origens.size || !destinos.size) return null;
  const custo = new Map<string, Custo>();
  const anterior = new Map<string, ArestaGrafo>();
  const fechados = new Set<string>();
  const fila = new FilaPrioridade();
  for (const [no, inicial] of origens) {
    if (!grafo.nos.has(no)) continue;
    const atual = custo.get(no);
    if (!atual || menor(inicial, atual)) {
      custo.set(no, inicial);
      fila.inserir(no, inicial);
    }
  }
  let visitados = 0;
  for (let item = fila.retirar(); item; item = fila.retirar()) {
    const { no, custo: c } = item;
    if (fechados.has(no)) continue;
    const melhor = custo.get(no)!;
    if (menor(melhor, c)) continue; // entrada antiga da fila
    fechados.add(no);
    visitados++;
    if (destinos.has(no)) return reconstruir(no, melhor, anterior, visitados);
    for (const aresta of grafo.saidas.get(no) ?? []) {
      if (acessivel && !aresta.acessivel) continue;
      if (fechados.has(aresta.destino)) continue;
      const proximo = {
        tempo: c.tempo + aresta.tempo,
        distancia: c.distancia + aresta.distancia,
      };
      const conhecido = custo.get(aresta.destino);
      if (!conhecido || menor(proximo, conhecido)) {
        custo.set(aresta.destino, proximo);
        anterior.set(aresta.destino, aresta);
        fila.inserir(aresta.destino, proximo);
      }
    }
  }
  return null;
}

/** Tolerância para somas de ponto flutuante na distância. */
const EPS = 1e-9;

function menor(a: Custo, b: Custo): boolean {
  if (a.tempo < b.tempo - EPS) return true;
  if (a.tempo > b.tempo + EPS) return false;
  return a.distancia < b.distancia - EPS;
}

function reconstruir(
  destino: string,
  total: Custo,
  anterior: ReadonlyMap<string, ArestaGrafo>,
  visitados: number,
): Caminho {
  const arestas: ArestaGrafo[] = [];
  const nos = [destino];
  for (let no = destino; anterior.has(no);) {
    const aresta = anterior.get(no)!;
    arestas.push(aresta);
    no = aresta.origem;
    nos.push(no);
  }
  arestas.reverse();
  nos.reverse();
  return {
    origem: nos[0],
    destino,
    nos,
    arestas,
    tempo: total.tempo,
    distancia: total.distancia,
    visitados,
  };
}

interface ItemFila {
  no: string;
  custo: Custo;
  ordem: number;
}

/** Heap binário mínimo pequeno; `ordem` torna o desempate estável. */
export class FilaPrioridade {
  private readonly itens: ItemFila[] = [];
  private contador = 0;

  get tamanho(): number {
    return this.itens.length;
  }

  inserir(no: string, custo: Custo): void {
    this.itens.push({ no, custo, ordem: this.contador++ });
    let i = this.itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (!this.antes(this.itens[i], this.itens[pai])) break;
      [this.itens[i], this.itens[pai]] = [this.itens[pai], this.itens[i]];
      i = pai;
    }
  }

  retirar(): ItemFila | undefined {
    const topo = this.itens[0];
    const ultimo = this.itens.pop();
    if (!topo || !ultimo) return topo;
    if (this.itens.length) {
      this.itens[0] = ultimo;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1;
        const d = e + 1;
        let m = i;
        if (e < this.itens.length && this.antes(this.itens[e], this.itens[m]))
          m = e;
        if (d < this.itens.length && this.antes(this.itens[d], this.itens[m]))
          m = d;
        if (m === i) break;
        [this.itens[i], this.itens[m]] = [this.itens[m], this.itens[i]];
        i = m;
      }
    }
    return topo;
  }

  private antes(a: ItemFila, b: ItemFila): boolean {
    if (menor(a.custo, b.custo)) return true;
    if (menor(b.custo, a.custo)) return false;
    if (a.no !== b.no) return a.no < b.no;
    return a.ordem < b.ordem;
  }
}
