import { menorCaminho, type Caminho, type Custo } from './dijkstra.js';
import {
  comprimentoMetros,
  dentroDoPoligono,
  distanciaAoPoligono,
  distanciaMetros,
  projetarNaLinha,
  type Coordenada,
} from './geo.js';
import type { ArestaGrafo, Grafo, PredioGrafo } from './grafo.js';

/** Raio de encaixe de uma coordenada no grafo (mesmo valor do PUCMaps). */
export const RAIO_ENCAIXE_M = 30;
/** Origem e destino por coordenada mais perto que isto: já está no destino. */
export const MESMO_LOCAL_M = 10;
/**
 * Prédio sem nó próprio na origem (8 footprints só do OSM): usa o nó mais
 * próximo do contorno, até esta distância.
 */
export const RAIO_PREDIO_SEM_NO_M = 50;
/** Velocidade da origem (path-processor do PUCMaps) para trechos fora do grafo. */
export const VELOCIDADE_MPS = 1.4;

export type Conexao = 'entrada' | 'proximidade' | 'caminho';

export type PontaRota =
  | { tipo: 'coordenada'; coordenada: Coordenada }
  | { tipo: 'predio'; predioId: string };

export interface PontaResolvida {
  tipo: 'coordenada' | 'predio';
  predio: PredioGrafo | null;
  /** Como a ponta foi ligada ao grafo. */
  conexao: Conexao;
  coordenada: Coordenada;
}

export interface RotaCalculada {
  origem: PontaResolvida;
  destino: PontaResolvida;
  distancia: number;
  tempo: number;
  geometria: Coordenada[];
  nos: number;
  arestas: number;
  visitados: number;
}

export type FalhaRota =
  | 'predio-inexistente'
  | 'origem-fora'
  | 'destino-fora'
  | 'predio-sem-conexao'
  | 'mesmo-local'
  | 'sem-caminho';

export class RotaImpossivel extends Error {
  constructor(
    readonly motivo: FalhaRota,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Ponto de partida de uma ponta: nós candidatos com custo e trecho inicial. */
interface Encaixe {
  ponta: PontaResolvida;
  /** nó → custo até ele e trecho geométrico (da ponta até o nó). */
  nos: Map<string, { custo: Custo; trecho: Coordenada[] }>;
  /** Coordenada encaixada numa aresta (para o caso das duas pontas na mesma). */
  naAresta?: NaAresta;
}

interface NaAresta {
  aresta: ArestaGrafo;
  /** Aresta no sentido contrário (mesmos nós), se existir para o perfil. */
  volta: ArestaGrafo | undefined;
  proj: ReturnType<typeof projetarNaLinha>;
  total: number;
}

export function calcularRota(
  grafo: Grafo,
  pedido: {
    origem: PontaRota;
    /** Prédio (`id`) ou coordenada (evento/restaurante fora de prédio). */
    destino: PontaRota;
    acessivel: boolean;
  },
): RotaCalculada {
  const destino =
    pedido.destino.tipo === 'predio'
      ? encaixarPredio(grafo, pedido.destino.predioId, 'destino')
      : encaixarCoordenada(
          grafo,
          pedido.destino.coordenada,
          pedido.acessivel,
          'destino',
        );
  const origem =
    pedido.origem.tipo === 'predio'
      ? encaixarPredio(grafo, pedido.origem.predioId, 'origem')
      : encaixarCoordenada(
          grafo,
          pedido.origem.coordenada,
          pedido.acessivel,
          'origem',
        );
  // Mesmo prédio (por id, ou coordenada dentro dele), ou duas coordenadas
  // praticamente no mesmo ponto.
  if (
    origem.ponta.predio &&
    origem.ponta.predio.id === destino.ponta.predio?.id
  ) {
    throw new RotaImpossivel(
      'mesmo-local',
      'Origem e destino são o mesmo prédio.',
    );
  }
  // Destino (coordenada) dentro do prédio de origem: já está lá.
  const poligonoOrigem = origem.ponta.predio?.poligono;
  if (
    pedido.destino.tipo === 'coordenada' &&
    poligonoOrigem &&
    dentroDoPoligono(pedido.destino.coordenada, poligonoOrigem)
  ) {
    throw new RotaImpossivel(
      'mesmo-local',
      'O destino fica no mesmo prédio da origem.',
    );
  }
  if (
    pedido.origem.tipo === 'coordenada' &&
    pedido.destino.tipo === 'coordenada' &&
    distanciaMetros(pedido.origem.coordenada, pedido.destino.coordenada) <
      MESMO_LOCAL_M
  ) {
    throw new RotaImpossivel('mesmo-local', 'Você já está no destino.');
  }
  const direta = mesmaAresta(origem, destino);
  const caminho = menorCaminho({
    grafo,
    origens: new Map([...origem.nos].map(([no, v]) => [no, v.custo])),
    destinos: new Set(destino.nos.keys()),
    custosFinais: new Map([...destino.nos].map(([no, v]) => [no, v.custo])),
    acessivel: pedido.acessivel,
  });
  if (!caminho) {
    if (direta) return direta;
    throw new RotaImpossivel(
      'sem-caminho',
      pedido.acessivel
        ? 'Não há caminho acessível entre a origem e o destino.'
        : 'Não há caminho entre a origem e o destino.',
    );
  }
  const final = destino.nos.get(caminho.destino)!;
  // Mesmo na mesma aresta pode existir um desvio mais rápido. Compare o
  // tempo completo (e a distância no empate), como em qualquer outra rota.
  const tempo = caminho.tempo + final.custo.tempo;
  const distancia = caminho.distancia + final.custo.distancia;
  if (
    direta &&
    (direta.tempo < tempo - 1e-9 ||
      (Math.abs(direta.tempo - tempo) <= 1e-9 &&
        direta.distancia <= distancia + 1e-9))
  ) {
    return direta;
  }
  const geometria = montarGeometria(
    origem.nos.get(caminho.origem)!.trecho,
    caminho,
    final.trecho,
  );
  if (geometria.length < 2) {
    throw new RotaImpossivel('mesmo-local', 'Você já está no destino.');
  }
  return {
    origem: origem.ponta,
    destino: destino.ponta,
    distancia,
    tempo,
    geometria,
    nos: caminho.nos.length,
    arestas: caminho.arestas.length,
    visitados: caminho.visitados,
  };
}

/**
 * Prédio → nós ligados a ele na origem (todas as entradas: o Dijkstra escolhe
 * a melhor). Sem nó próprio: nó mais próximo do contorno até
 * [RAIO_PREDIO_SEM_NO_M], com o trecho reto até ele.
 */
function encaixarPredio(
  grafo: Grafo,
  id: string,
  papel: 'origem' | 'destino',
): Encaixe {
  const predio = grafo.predios.get(id);
  if (!predio)
    throw new RotaImpossivel('predio-inexistente', 'Prédio não encontrado.');
  if (predio.nos.length) {
    const nos = new Map(
      predio.nos.map((no) => [
        no,
        { custo: zero(), trecho: [] as Coordenada[] },
      ]),
    );
    const ponta: PontaResolvida = {
      tipo: 'predio',
      predio,
      conexao: 'entrada',
      coordenada: predio.centro,
    };
    return { ponta, nos };
  }
  let melhor: { id: string; d: number; c: Coordenada } | null = null;
  for (const no of grafo.nos.values()) {
    if (!grafo.saidas.get(no.id)?.length) continue; // nó isolado não serve
    const d = predio.poligono
      ? distanciaAoPoligono(no.coordenada, predio.poligono)
      : distanciaMetros(no.coordenada, predio.centro);
    if (!melhor || d < melhor.d || (d === melhor.d && no.id < melhor.id)) {
      melhor = { id: no.id, d, c: no.coordenada };
    }
  }
  if (!melhor || melhor.d > RAIO_PREDIO_SEM_NO_M) {
    throw new RotaImpossivel(
      'predio-sem-conexao',
      `O prédio de ${papel} não está ligado ao grafo de caminhos.`,
    );
  }
  const custo = { distancia: melhor.d, tempo: melhor.d / VELOCIDADE_MPS };
  return {
    ponta: {
      tipo: 'predio',
      predio,
      conexao: 'proximidade',
      coordenada: predio.centro,
    },
    nos: new Map([
      [melhor.id, { custo, trecho: papel === 'origem' ? [] : [melhor.c] }],
    ]),
  };
}

/**
 * Coordenada → aresta mais próxima até [RAIO_ENCAIXE_M] (regra do PUCMaps),
 * ligando o ponto encaixado aos dois extremos dessa aresta com o custo
 * proporcional do trecho (o PUCMaps desenhava esse trecho mas não o somava).
 * Respeita a direção: na origem, um extremo só vale se der para andar do
 * ponto até ele; no destino, se der para andar dele até o ponto.
 * Sem aresta próxima e dentro de um prédio: as entradas dele.
 */
function encaixarCoordenada(
  grafo: Grafo,
  p: Coordenada,
  acessivel: boolean,
  papel: 'origem' | 'destino',
): Encaixe {
  let melhor: {
    aresta: ArestaGrafo;
    proj: ReturnType<typeof projetarNaLinha>;
  } | null = null;
  for (const aresta of grafo.arestas) {
    if (!aresta.geometria || (acessivel && !aresta.acessivel)) continue;
    const proj = projetarNaLinha(p, aresta.geometria);
    if (
      !melhor ||
      proj.distancia < melhor.proj.distancia - 1e-9 ||
      (Math.abs(proj.distancia - melhor.proj.distancia) <= 1e-9 &&
        aresta.id < melhor.aresta.id)
    ) {
      melhor = { aresta, proj };
    }
  }
  if (melhor && melhor.proj.distancia <= RAIO_ENCAIXE_M) {
    const { aresta, proj } = melhor;
    const linha = aresta.geometria!;
    const total = comprimentoMetros(linha) || 1;
    const ate = (fracao: number, base: ArestaGrafo): Custo => ({
      distancia: proj.distancia + base.distancia * fracao,
      tempo: proj.distancia / VELOCIDADE_MPS + base.tempo * fracao,
    });
    const nos = new Map<string, { custo: Custo; trecho: Coordenada[] }>();
    const volta = (grafo.saidas.get(aresta.destino) ?? []).find(
      (e) => e.destino === aresta.origem && (!acessivel || e.acessivel),
    );
    const frente = linha.slice(proj.segmento + 1);
    const tras = linha.slice(0, proj.segmento + 1);
    if (papel === 'origem') {
      // Ponto → extremo final, pela própria aresta (origem → destino).
      nos.set(aresta.destino, {
        custo: ate(1 - proj.aoLongo / total, aresta),
        trecho: [p, proj.ponto, ...frente],
      });
      // Ponto → extremo inicial, só se existir a aresta no sentido contrário.
      if (volta) {
        const candidato = {
          custo: ate(proj.aoLongo / total, volta),
          trecho: [p, proj.ponto, ...tras.reverse()],
        };
        const atual = nos.get(aresta.origem);
        if (!atual || candidato.custo.tempo < atual.custo.tempo)
          nos.set(aresta.origem, candidato);
      }
    } else {
      // Extremo inicial → ponto, pela própria aresta (origem → destino).
      nos.set(aresta.origem, {
        custo: ate(proj.aoLongo / total, aresta),
        trecho: [...tras, proj.ponto, p],
      });
      // Extremo final → ponto, só se existir a aresta no sentido contrário.
      if (volta) {
        const candidato = {
          custo: ate(1 - proj.aoLongo / total, volta),
          trecho: [...frente.reverse(), proj.ponto, p],
        };
        const atual = nos.get(aresta.destino);
        if (!atual || candidato.custo.tempo < atual.custo.tempo)
          nos.set(aresta.destino, candidato);
      }
    }
    return {
      ponta: {
        tipo: 'coordenada',
        predio: null,
        conexao: 'caminho',
        coordenada: p,
      },
      nos,
      naAresta: { aresta, volta, proj, total },
    };
  }
  for (const predio of grafo.predios.values()) {
    if (
      predio.poligono &&
      predio.nos.length &&
      dentroDoPoligono(p, predio.poligono)
    ) {
      return {
        ponta: {
          tipo: 'coordenada',
          predio,
          conexao: 'entrada',
          coordenada: p,
        },
        nos: new Map(
          predio.nos.map((no) => {
            const entrada = grafo.nos.get(no)!.coordenada;
            return [
              no,
              {
                custo: zero(),
                trecho: papel === 'origem' ? [p, entrada] : [entrada, p],
              },
            ];
          }),
        ),
      };
    }
  }
  throw new RotaImpossivel(
    papel === 'origem' ? 'origem-fora' : 'destino-fora',
    `${papel === 'origem' ? 'A origem' : 'O destino'} está a mais de ${RAIO_ENCAIXE_M} m de um caminho do campus.`,
  );
}

/**
 * Origem e destino por coordenada encaixados na mesma aresta: andar direto
 * pela aresta entre as duas projeções, sem ir até um nó e voltar. Para trás
 * só se existir a aresta no sentido contrário; senão, `null` (Dijkstra).
 */
function mesmaAresta(origem: Encaixe, destino: Encaixe): RotaCalculada | null {
  const o = origem.naAresta;
  const d = destino.naAresta;
  if (!o || !d) return null;
  const mesma =
    o.aresta.id === d.aresta.id ||
    (o.aresta.origem === d.aresta.destino &&
      o.aresta.destino === d.aresta.origem);
  if (!mesma) return null;
  // Posição do destino na geometria da aresta encaixada pela origem.
  const linha = o.aresta.geometria!;
  const proj =
    d.aresta.id === o.aresta.id ? d.proj : projetarNaLinha(d.proj.ponto, linha);
  const paraFrente = proj.aoLongo >= o.proj.aoLongo;
  const base = paraFrente ? o.aresta : o.volta;
  if (!base) return null;
  const fracao = Math.abs(proj.aoLongo - o.proj.aoLongo) / o.total;
  const meio = paraFrente
    ? linha.slice(o.proj.segmento + 1, proj.segmento + 1)
    : linha.slice(proj.segmento + 1, o.proj.segmento + 1).reverse();
  const reto = o.proj.distancia + d.proj.distancia;
  return {
    origem: origem.ponta,
    destino: destino.ponta,
    distancia: reto + base.distancia * fracao,
    tempo: reto / VELOCIDADE_MPS + base.tempo * fracao,
    geometria: semRepetidos([
      origem.ponta.coordenada,
      o.proj.ponto,
      ...meio,
      proj.ponto,
      destino.ponta.coordenada,
    ]),
    nos: 0,
    arestas: 1,
    visitados: 0,
  };
}

/** Trecho inicial + arestas na ordem (já orientadas origem→destino) + final. */
function montarGeometria(
  inicio: Coordenada[],
  caminho: Caminho,
  fim: Coordenada[],
): Coordenada[] {
  const pontos: Coordenada[] = [...inicio];
  for (const aresta of caminho.arestas) {
    // Conector de comprimento zero: os dois nós estão no mesmo ponto.
    if (aresta.geometria) pontos.push(...aresta.geometria);
  }
  pontos.push(...fim);
  return semRepetidos(pontos);
}

/** Remove pontos consecutivos iguais (junção de trechos). */
function semRepetidos(pontos: Coordenada[]): Coordenada[] {
  const limpos: Coordenada[] = [];
  for (const ponto of pontos) {
    const ultimo = limpos.at(-1);
    if (!ultimo || ultimo[0] !== ponto[0] || ultimo[1] !== ponto[1])
      limpos.push(ponto);
  }
  return limpos;
}

function zero(): Custo {
  return { tempo: 0, distancia: 0 };
}
