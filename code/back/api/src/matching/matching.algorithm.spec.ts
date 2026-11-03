import { alocarMatching, type ArestaMatching } from './matching.algorithm.js';

describe('alocarMatching', () => {
  it('maximiza cobertura antes do score, evitando top-scores independentes', () => {
    const arestas: ArestaMatching[] = [
      { padrinhoId: 1, apadrinhadoId: 10, score: 1 },
      { padrinhoId: 1, apadrinhadoId: 11, score: 0.9 },
      { padrinhoId: 2, apadrinhadoId: 10, score: 0.8 },
    ];
    expect(
      alocarMatching(
        arestas,
        new Map([
          [1, 1],
          [2, 1],
        ]),
        new Map([
          [10, 1],
          [11, 1],
        ]),
      ),
    ).toEqual([
      { padrinhoId: 1, apadrinhadoId: 11, score: 0.9 },
      { padrinhoId: 2, apadrinhadoId: 10, score: 0.8 },
    ]);
  });

  it('respeita capacidade simultânea dos dois lados e permite vários padrinhos', () => {
    const arestas = [
      { padrinhoId: 1, apadrinhadoId: 10, score: 1 },
      { padrinhoId: 2, apadrinhadoId: 10, score: 0.8 },
      { padrinhoId: 3, apadrinhadoId: 10, score: 0.7 },
    ];
    const resultado = alocarMatching(
      arestas,
      new Map([
        [1, 2],
        [2, 2],
        [3, 2],
      ]),
      new Map([[10, 2]]),
    );
    expect(resultado).toHaveLength(2);
    expect(resultado.map((p) => p.padrinhoId)).toEqual([1, 2]);
  });

  it('é determinístico em empates, independentemente da ordem de entrada', () => {
    const arestas = [
      { padrinhoId: 2, apadrinhadoId: 11, score: 0.5 },
      { padrinhoId: 1, apadrinhadoId: 11, score: 0.5 },
      { padrinhoId: 2, apadrinhadoId: 10, score: 0.5 },
      { padrinhoId: 1, apadrinhadoId: 10, score: 0.5 },
    ];
    const capacidadesP = new Map([
      [1, 1],
      [2, 1],
    ]);
    const capacidadesA = new Map([
      [10, 1],
      [11, 1],
    ]);
    expect(alocarMatching(arestas, capacidadesP, capacidadesA)).toEqual(
      alocarMatching([...arestas].reverse(), capacidadesP, capacidadesA),
    );
  });

  it('ignora self-pair e capacidades já esgotadas', () => {
    expect(
      alocarMatching(
        [
          { padrinhoId: 1, apadrinhadoId: 1, score: 1 },
          { padrinhoId: 1, apadrinhadoId: 2, score: 0.5 },
        ],
        new Map([[1, 1]]),
        new Map([
          [1, 1],
          [2, 0],
        ]),
      ),
    ).toEqual([]);
  });
});
