import { alocarMatching, type ArestaMatching } from './matching.algorithm.js';

const completa = (quantidade: number) =>
  [1, 2].flatMap((padrinhoId) =>
    Array.from({ length: quantidade }, (_, i) => ({
      padrinhoId,
      apadrinhadoId: i + 10,
      score: 0.8,
    })),
  );
const capacidades = (quantidade: number) =>
  new Map(Array.from({ length: quantidade }, (_, i) => [i + 10, 1]));

describe('Equilíbrio condicionado à qualidade', () => {
  it.each([
    [3, [1, 2]],
    [6, [3, 3]],
  ] as const)(
    '%s alunos igualmente adequados são distribuídos sem concentrar',
    (quantidade, esperado) => {
      const resultado = alocarMatching(
        completa(quantidade),
        new Map([
          [1, 3],
          [2, 3],
        ]),
        capacidades(quantidade),
      );
      expect(
        [1, 2]
          .map((id) => resultado.filter((p) => p.padrinhoId === id).length)
          .sort(),
      ).toEqual([...esperado]);
    },
  );
  it('ocupação confirmada entra no desempate: 2/0 favorece o segundo', () => {
    expect(
      alocarMatching(
        completa(1),
        new Map([
          [1, 1],
          [2, 3],
        ]),
        capacidades(1),
        {
          ocupacaoPadrinhos: new Map([
            [1, 2],
            [2, 0],
          ]),
        },
      )[0].padrinhoId,
    ).toBe(2);
  });
  it('um padrinho no limite não recebe outra sugestão', () => {
    expect(
      alocarMatching(
        completa(1),
        new Map([
          [1, 0],
          [2, 3],
        ]),
        capacidades(1),
        { ocupacaoPadrinhos: new Map([[1, 3]]) },
      )[0].padrinhoId,
    ).toBe(2);
  });
  it('não usa padrinho sem aresta viável para equilibrar', () => {
    const arestas = completa(1).filter((p) => p.padrinhoId === 1);
    expect(
      alocarMatching(
        arestas,
        new Map([
          [1, 1],
          [2, 3],
        ]),
        capacidades(1),
        { ocupacaoPadrinhos: new Map([[1, 2]]) },
      )[0].padrinhoId,
    ).toBe(1);
    expect(
      alocarMatching(
        [],
        new Map([
          [1, 3],
          [2, 3],
        ]),
        capacidades(1),
      ),
    ).toEqual([]);
  });
  it('qualquer diferença representável de qualidade precede a ocupação', () => {
    const arestas = [
      { padrinhoId: 1, apadrinhadoId: 10, score: 0.8001 },
      { padrinhoId: 2, apadrinhadoId: 10, score: 0.8 },
    ];
    expect(
      alocarMatching(
        arestas,
        new Map([
          [1, 1],
          [2, 3],
        ]),
        capacidades(1),
        { ocupacaoPadrinhos: new Map([[1, 2]]) },
      )[0].padrinhoId,
    ).toBe(1);
  });
  it('prioriza o primeiro vínculo de um aluno antes de ampliar outros', () => {
    const arestas = [
      { padrinhoId: 1, apadrinhadoId: 10, score: 1 },
      { padrinhoId: 1, apadrinhadoId: 11, score: 0.5 },
    ];
    expect(
      alocarMatching(
        arestas,
        new Map([[1, 1]]),
        new Map([
          [10, 1],
          [11, 1],
        ]),
        { ocupacaoApadrinhados: new Map([[10, 1]]) },
      )[0].apadrinhadoId,
    ).toBe(11);
  });
  it('carga projetada e ocupação confirmada são combinadas', () => {
    const resultado = alocarMatching(
      completa(4),
      new Map([
        [1, 2],
        [2, 4],
      ]),
      capacidades(4),
      { ocupacaoPadrinhos: new Map([[1, 2]]) },
    );
    expect([
      2 + resultado.filter((p) => p.padrinhoId === 1).length,
      resultado.filter((p) => p.padrinhoId === 2).length,
    ]).toEqual([3, 3]);
  });
  it('coincide com enumeração independente em grafos pequenos e mantém determinismo', () => {
    const base = [1, 2, 3].flatMap((padrinhoId) =>
      [10, 11, 12].map((apadrinhadoId) => ({
        padrinhoId,
        apadrinhadoId,
        score: [0.2, 0.5, 0.9][(padrinhoId + apadrinhadoId) % 3],
      })),
    );
    const capP = new Map([
      [1, 2],
      [2, 2],
      [3, 1],
    ]);
    const capA = new Map([
      [10, 2],
      [11, 1],
      [12, 1],
    ]);
    const ocupacao = new Map([
      [1, 1],
      [2, 0],
      [3, 2],
    ]);
    const objetivo = (pares: ArestaMatching[], arestas: ArestaMatching[]) => [
      pares.length,
      new Set(
        pares.filter((p) => p.apadrinhadoId !== 10).map((p) => p.apadrinhadoId),
      ).size,
      pares.reduce((s, p) => s + Math.round(p.score * 10_000), 0),
      -[1, 2, 3].reduce(
        (s, id) =>
          s +
          ((ocupacao.get(id) ?? 0) +
            pares.filter((p) => p.padrinhoId === id).length) **
            2,
        0,
      ),
      -pares.reduce((s, p) => s + arestas.indexOf(p), 0),
    ];
    const melhor = (a: number[], b: number[]) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
      return false;
    };
    for (let mascara = 0; mascara < 512; mascara++) {
      const arestas = base.filter((_, i) => mascara & (1 << i));
      let otimo = objetivo([], arestas);
      for (
        let subconjunto = 0;
        subconjunto < 1 << arestas.length;
        subconjunto++
      ) {
        const pares = arestas.filter((_, i) => subconjunto & (1 << i));
        if (
          [...capP].some(
            ([id, c]) => pares.filter((p) => p.padrinhoId === id).length > c,
          ) ||
          [...capA].some(
            ([id, c]) => pares.filter((p) => p.apadrinhadoId === id).length > c,
          )
        )
          continue;
        const valor = objetivo(pares, arestas);
        if (melhor(valor, otimo)) otimo = valor;
      }
      const contexto = {
        ocupacaoPadrinhos: ocupacao,
        ocupacaoApadrinhados: new Map([[10, 1]]),
      };
      const resultado = alocarMatching(arestas, capP, capA, contexto);
      expect(objetivo(resultado, arestas)).toEqual(otimo);
      expect(
        alocarMatching(
          [...arestas].reverse(),
          new Map([...capP].reverse()),
          new Map([...capA].reverse()),
          contexto,
        ),
      ).toEqual(resultado);
    }
  });
});
