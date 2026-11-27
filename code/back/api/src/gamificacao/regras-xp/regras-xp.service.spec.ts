import type { DataSource } from 'typeorm';
import { LIMITES } from '../economia.js';
import { RegrasXpService } from './regras-xp.service.js';

const autor = 'renata@pucminas.edu.br';
const encontro = 'ENCONTRO_REALIZADO';
const visita = 'VISITA';
const missao = 'MISSAO_VISITA';
const valores = { valorXp: 30, elegibilidade: 'todos' } as const;

function prepararServico() {
  const query = vi.fn();
  const manager = { query };
  const dados = {
    query,
    manager,
    transaction: vi.fn(async (executar: (m: typeof manager) => unknown) =>
      executar(manager),
    ),
  };
  return {
    query,
    servico: new RegrasXpService(dados as unknown as DataSource),
  };
}

describe(RegrasXpService.name, () => {
  it('insere nova versão e altera só o ponteiro do catálogo', async () => {
    const { query, servico } = prepararServico();
    const anterior = {
      id: 10,
      regra_id: 1,
      versao: 1,
      valor_xp: 30,
      elegibilidade: 'todos',
      limite_repeticoes: 2,
      combinavel_com: [missao],
      criado_por: autor,
      criado_em: '2026-11-22T12:00:00.000Z',
    };
    const nova = { ...anterior, id: 11, versao: 2, valor_xp: 50 };
    query
      .mockResolvedValueOnce([{ id: 1, acao: encontro, versao_atual: 1 }])
      .mockResolvedValueOnce([anterior])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 1, versaoAtual: 2, versao: nova, versoes: [nova, anterior] },
      ]);

    const regra = await servico.atualizar(
      1,
      { ...valores, valorXp: 50 },
      autor,
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [1],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO "gamificacao"."regras_xp_versoes"'),
      [1, 2, 50, 'todos', 2, JSON.stringify([missao]), autor],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining(
        'UPDATE "gamificacao"."regras_xp" SET "versao_atual"',
      ),
      [1, 2],
    );
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(
      /(?:UPDATE|DELETE FROM) "gamificacao"\."regras_xp_versoes"/,
    );
    expect(regra.versaoAtual).toBe(2);
    expect(regra.versoes).toMatchObject([
      { versao: 2, valorXp: 50 },
      { versao: 1, valorXp: 30, limiteRepeticoes: 2, combinavelCom: [missao] },
    ]);
  });

  it.each([
    ['ação ativa', [{ id: 1, ativo: true, versao_atual: 1 }]],
    ['violação do UNIQUE em criação concorrente', []],
  ])('retorna 409 acao-duplicada para %s', async (_, existentes) => {
    const { query, servico } = prepararServico();
    query.mockResolvedValueOnce(existentes).mockRejectedValueOnce({
      driverError: { code: '23505', constraint: 'uq_regras_xp_acao_programa' },
    });

    await expect(
      servico.criar({ acao: encontro, ...valores }, autor),
    ).rejects.toMatchObject({
      response: { statusCode: 409, motivo: 'acao-duplicada' },
    });
  });

  it('propaga violações de unicidade que não são da ação', async () => {
    const { query, servico } = prepararServico();
    const erro = { code: '23505', constraint: 'uq_regras_xp_versao' };
    query.mockResolvedValueOnce([]).mockRejectedValueOnce(erro);

    await expect(
      servico.criar({ acao: encontro, ...valores }, autor),
    ).rejects.toBe(erro);
  });

  it.each([
    { configuracao: [], xp: 70 },
    { configuracao: [encontro], xp: 70 },
    { configuracao: [visita], xp: 100 },
  ])(
    'seleciona $xp XP para visita e missão com configuração $configuracao',
    async ({ configuracao, xp }) => {
      const { query, servico } = prepararServico();
      const regras = [
        { acao: visita, regraId: 1, versao: 1, ...valores, combinavelCom: [] },
        {
          acao: missao,
          regraId: 2,
          versao: 3,
          ...valores,
          valorXp: 70,
          combinavelCom: configuracao,
        },
      ];
      query
        .mockResolvedValueOnce([...regras])
        .mockResolvedValueOnce([...regras].reverse());

      const ganhos = await servico.selecionarGanhosDoEvento([visita, missao]);
      expect(ganhos.reduce((total, ganho) => total + ganho.valorXp, 0)).toBe(
        xp,
      );
      expect(ganhos[0]).toMatchObject({ acao: missao, regraId: 2, versao: 3 });
      expect(await servico.selecionarGanhosDoEvento([missao, visita])).toEqual(
        ganhos,
      );
    },
  );

  it.each([
    [missao, LIMITES.porMissao],
    [encontro, LIMITES.geralPorCiclo],
  ])('aplica teto de %s na criação e na atualização', async (acao, teto) => {
    const { query, servico } = prepararServico();
    const acima = { ...valores, valorXp: teto + 1 };

    await expect(
      servico.criar({ acao, ...acima }, autor),
    ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();

    query.mockResolvedValueOnce([{ id: 1, acao, versao_atual: 1 }]);
    await expect(servico.atualizar(1, acima, autor)).rejects.toMatchObject({
      status: 400,
    });
    expect(query).toHaveBeenCalledTimes(1);

    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ versao: {}, versoes: [] }]);
    await servico.criar({ acao, ...valores, valorXp: teto }, autor);
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO "gamificacao"."regras_xp_versoes"'),
      [1, 1, teto, 'todos', null, '[]', autor],
    );
  });

  it('busca só a versão atual da regra ativa e devolve o contrato de valorVigente', async () => {
    const { query, servico } = prepararServico();
    query
      .mockResolvedValueOnce([
        {
          acao: encontro,
          regraId: 1,
          versao: 2,
          ...valores,
          combinavelCom: [missao],
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      servico.valorVigente(encontro, undefined, '2026/2'),
    ).resolves.toEqual({
      regraId: 1,
      versao: 2,
      ...valores,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/v\."versao" = r\."versao_atual" WHERE r\."ativo"/),
      [[encontro], '2026/2'],
    );
    expect(query.mock.calls[0][0]).toMatch(
      /DISTINCT ON \(r\."acao"\)[\s\S]*r\."programa" IS NULL OR r\."programa" = \$2[\s\S]*ORDER BY r\."acao", \(r\."programa" IS NULL\)/,
    );
    await expect(servico.valorVigente('SEM_REGRA_ATIVA')).resolves.toBeNull();
  });
});
