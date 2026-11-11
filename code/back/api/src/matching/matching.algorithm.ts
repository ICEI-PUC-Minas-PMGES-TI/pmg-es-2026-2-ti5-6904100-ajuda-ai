export interface ArestaMatching {
  padrinhoId: number;
  apadrinhadoId: number;
  score: number;
}

interface Arco {
  para: number;
  reverso: number;
  capacidade: number;
  custo: number;
  par?: ArestaMatching;
}

function adicionar(
  grafo: Arco[][],
  de: number,
  para: number,
  capacidade: number,
  custo: number,
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
    custo: -custo,
  };
  grafo[de].push(ida);
  grafo[para].push(volta);
}

/**
 * Fluxo de custo mínimo com capacidades nos dois lados. O fluxo máximo é
 * encontrado primeiro; entre soluções dessa cardinalidade, maximiza o score.
 * IDs ordenados e penalidade de rank tornam empates reproduzíveis.
 */
export function alocarMatching(
  arestas: ArestaMatching[],
  capacidadePadrinhos: Map<number, number>,
  capacidadeApadrinhados: Map<number, number>,
): ArestaMatching[] {
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

  for (const id of padrinhos)
    adicionar(grafo, origem, indiceP.get(id)!, capacidadePadrinhos.get(id)!, 0);
  for (const id of apadrinhados)
    adicionar(
      grafo,
      indiceA.get(id)!,
      destino,
      capacidadeApadrinhados.get(id)!,
      0,
    );

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
  const fluxoMaximo = Math.min(
    [...capacidadePadrinhos.values()].reduce((a, b) => a + Math.max(0, b), 0),
    [...capacidadeApadrinhados.values()].reduce(
      (a, b) => a + Math.max(0, b),
      0,
    ),
  );
  const fatorScore = validas.length * Math.max(1, fluxoMaximo) + 1;
  validas.forEach((par, rank) =>
    adicionar(
      grafo,
      indiceP.get(par.padrinhoId)!,
      indiceA.get(par.apadrinhadoId)!,
      1,
      -Math.round(par.score * 10_000) * fatorScore + rank,
      par,
    ),
  );

  while (true) {
    const distancia = Array(grafo.length).fill(Number.POSITIVE_INFINITY);
    const anteriorNo = Array(grafo.length).fill(-1);
    const anteriorArco = Array(grafo.length).fill(-1);
    distancia[origem] = 0;
    // Bellman-Ford é suficiente aqui e suporta os arcos de score negativos.
    for (let rodada = 0; rodada < grafo.length - 1; rodada++) {
      let mudou = false;
      for (let no = 0; no < grafo.length; no++) {
        if (!Number.isFinite(distancia[no])) continue;
        grafo[no].forEach((arco, i) => {
          const nova = distancia[no] + arco.custo;
          if (
            arco.capacidade > 0 &&
            (nova < distancia[arco.para] ||
              (nova === distancia[arco.para] &&
                (no < anteriorNo[arco.para] ||
                  (no === anteriorNo[arco.para] &&
                    i < anteriorArco[arco.para]))))
          ) {
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
    for (let no = destino; no !== origem; no = anteriorNo[no]) {
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
