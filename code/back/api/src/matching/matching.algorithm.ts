export interface ArestaMatching {
  padrinhoId: number;
  apadrinhadoId: number;
  score: number;
}

/** Custos lexicográficos evitam fatores artificiais que troquem qualidade por equilíbrio. */
type Custo = [number, number, number, number];
const ZERO: Custo = [0, 0, 0, 0];
const somar = (a: Custo, b: Custo): Custo => a.map((v, i) => v + b[i]) as Custo;
const menor = (a: Custo, b: Custo) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
};

export interface ContextoAlocacao {
  ocupacaoPadrinhos?: Map<number, number>;
  ocupacaoApadrinhados?: Map<number, number>;
}

interface Arco {
  para: number;
  reverso: number;
  capacidade: number;
  custo: Custo;
  par?: ArestaMatching;
}

function adicionar(
  grafo: Arco[][],
  de: number,
  para: number,
  capacidade: number,
  custo: Custo,
  par?: ArestaMatching,
) {
  const ida: Arco = {
    para,
    reverso: grafo[para].length,
    capacidade,
    custo,
    par,
  };
  const volta: Arco = {
    para: de,
    reverso: grafo[de].length,
    capacidade: 0,
    custo: custo.map((v) => -v) as Custo,
  };
  grafo[de].push(ida);
  grafo[para].push(volta);
}

/** Fluxo máximo; novos alunos, qualidade, carga quadrática e ordem estável, nesta ordem. */
export function alocarMatching(
  arestas: ArestaMatching[],
  capacidadePadrinhos: Map<number, number>,
  capacidadeApadrinhados: Map<number, number>,
  contexto: ContextoAlocacao = {},
): ArestaMatching[] {
  for (const mapa of [
    capacidadePadrinhos,
    capacidadeApadrinhados,
    contexto.ocupacaoPadrinhos,
    contexto.ocupacaoApadrinhados,
  ]) {
    for (const [id, valor] of mapa ?? []) {
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(valor))
        throw new Error(
          'Capacidades e identificadores devem ser inteiros seguros.',
        );
    }
  }
  if (
    arestas.some((a) => !Number.isFinite(a.score) || a.score < 0 || a.score > 1)
  )
    throw new Error('Score deve estar entre zero e um.');
  if (
    new Set(arestas.map((a) => `${a.padrinhoId}:${a.apadrinhadoId}`)).size !==
    arestas.length
  )
    throw new Error('Par duplicado no grafo.');
  const padrinhos = [...capacidadePadrinhos]
    .filter(([, c]) => c > 0)
    .map(([id]) => id)
    .sort((a, b) => a - b);
  const apadrinhados = [...capacidadeApadrinhados]
    .filter(([, c]) => c > 0)
    .map(([id]) => id)
    .sort((a, b) => a - b);
  const origem = 0;
  const primeiroPadrinho = 1;
  const primeiroApadrinhado = primeiroPadrinho + padrinhos.length;
  const destino = primeiroApadrinhado + apadrinhados.length;
  const grafo: Arco[][] = Array.from({ length: destino + 1 }, () => []);
  const indiceP = new Map(padrinhos.map((id, i) => [id, primeiroPadrinho + i]));
  const indiceA = new Map(
    apadrinhados.map((id, i) => [id, primeiroApadrinhado + i]),
  );

  const unidades = Math.max(
    1,
    Math.min(
      arestas.length,
      apadrinhados.reduce(
        (total, id) => total + capacidadeApadrinhados.get(id)!,
        0,
      ),
    ),
  );
  for (const id of padrinhos) {
    const ocupacao = Math.max(0, contexto.ocupacaoPadrinhos?.get(id) ?? 0);
    for (
      let vaga = 0;
      vaga < Math.min(capacidadePadrinhos.get(id)!, unidades);
      vaga++
    )
      adicionar(grafo, origem, indiceP.get(id)!, 1, [
        0,
        0,
        2 * (ocupacao + vaga) + 1,
        0,
      ]);
  }
  for (const id of apadrinhados) {
    const novo = (contexto.ocupacaoApadrinhados?.get(id) ?? 0) === 0;
    for (
      let vaga = 0;
      vaga < Math.min(capacidadeApadrinhados.get(id)!, unidades);
      vaga++
    )
      adicionar(grafo, indiceA.get(id)!, destino, 1, [
        novo && vaga === 0 ? -1 : 0,
        0,
        0,
        0,
      ]);
  }

  const validas = arestas
    .filter(
      (a) =>
        indiceP.has(a.padrinhoId) &&
        indiceA.has(a.apadrinhadoId) &&
        a.padrinhoId !== a.apadrinhadoId,
    )
    .sort(
      (a, b) =>
        a.padrinhoId - b.padrinhoId || a.apadrinhadoId - b.apadrinhadoId,
    );
  validas.forEach((par, rank) =>
    adicionar(
      grafo,
      indiceP.get(par.padrinhoId)!,
      indiceA.get(par.apadrinhadoId)!,
      1,
      [0, -Math.round(par.score * 10_000), 0, rank],
      par,
    ),
  );

  while (true) {
    const distancia: Array<Custo | undefined> = Array(grafo.length).fill(
      undefined,
    );
    const anteriorNo = Array(grafo.length).fill(-1);
    const anteriorArco = Array(grafo.length).fill(-1);
    distancia[origem] = ZERO;
    // Bellman-Ford é suficiente aqui e suporta os arcos de score negativos.
    for (let rodada = 0; rodada < grafo.length - 1; rodada++) {
      let mudou = false;
      for (let no = 0; no < grafo.length; no++) {
        const atual = distancia[no];
        if (!atual) continue;
        grafo[no].forEach((arco, i) => {
          const nova = somar(atual, arco.custo);
          if (
            arco.capacidade > 0 &&
            (!distancia[arco.para] || menor(nova, distancia[arco.para]!))
          ) {
            // Empates preservam o primeiro caminho encontrado. Trocar o
            // predecessor com custo igual pode formar um ciclo de custo zero
            // no grafo residual e impedir a reconstrução de terminar.
            // A ordem estável dos nós e arcos já torna o resultado determinístico.
            distancia[arco.para] = nova;
            anteriorNo[arco.para] = no;
            anteriorArco[arco.para] = i;
            mudou = true;
          }
        });
      }
      if (!mudou) break;
    }
    if (anteriorNo[destino] < 0) break;
    const caminho = new Set<number>();
    for (let no = destino; no !== origem; no = anteriorNo[no]) {
      if (no < 0 || caminho.has(no))
        throw new Error('Caminho residual inválido.');
      caminho.add(no);
      const arco = grafo[anteriorNo[no]][anteriorArco[no]];
      arco.capacidade--;
      grafo[no][arco.reverso].capacidade++;
    }
  }

  return grafo
    .flatMap((arcos) => arcos)
    .filter((arco) => arco.par && arco.capacidade === 0)
    .map((arco) => arco.par!)
    .sort(
      (a, b) =>
        a.padrinhoId - b.padrinhoId || a.apadrinhadoId - b.apadrinhadoId,
    );
}
