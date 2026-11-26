import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { MissoesAdminService } from './missoes-admin.service.js';

const ID = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const ATUALIZADO = new Date('2026-11-16T18:00:00.000Z');
const AGORA = new Date('2026-11-17T12:00:00Z');
const PONTO_A = '0b6f3c1e-2a4d-4f8b-9c7e-5d1a2b3c4d5e';
const PONTO_B = '7e2d9a4c-1b3f-4c6a-8d5e-9f0a1b2c3d4e';
const INATIVO = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';
const PUBLICADA = { ativa: true, publicada_em: ATUALIZADO };

function banco(linha: Record<string, unknown> = {}, programa = true) {
  const comandos: Array<[string, unknown[]]> = [];
  const atual = {
    id: ID,
    titulo: 'Missão',
    descricao: 'Descrição',
    tipo: 'UNICA',
    requisito: 'CODIGO',
    quantidade: 1,
    alvo_id: null,
    alvo_nome: null,
    codigo: 'BIBLIO-26',
    xp: 80,
    ativa: false,
    inicio: null,
    fim: null,
    ciclo: '2026/2',
    vigente_agora: false,
    conclusoes: 0,
    xp_creditado_total: 0,
    criado_por: null,
    criado_em: ATUALIZADO,
    atualizado_em: ATUALIZADO,
    ...linha,
  };
  const query = async (sql: string, params: unknown[] = []) => {
    comandos.push([sql, params]);
    if (sql.startsWith('INSERT INTO')) return [{ id: ID }];
    if (sql.startsWith('SELECT m."id"')) return [atual];
    if (sql.includes('"programas"')) return programa ? [{ existe: 1 }] : [];
    if (sql.includes('AS ativos')) {
      const pontos = (params[0] as string[] | null) ?? [PONTO_A, PONTO_B];
      return [{ ativos: pontos.filter((id) => id !== INATIVO).length }];
    }
    // PucStops escolhidos: todos ativos, menos o INATIVO.
    if (sql.includes('= ANY($1::uuid[])')) {
      return (params[0] as string[])
        .filter((id) => id !== INATIVO)
        .map((id) => ({ id }));
    }
    return [];
  };
  const manager = { query };
  const db = {
    options: {},
    query,
    manager,
    transaction: async (fn: (m: typeof manager) => Promise<unknown>) =>
      fn(manager),
  } as unknown as DataSource;
  return { service: new MissoesAdminService(db), comandos };
}

const gravou = (comandos: Array<[string, unknown[]]>) =>
  comandos.some(
    ([sql]) => sql.startsWith('INSERT INTO') || sql.startsWith('UPDATE'),
  );

const base = {
  titulo: ' Visite a biblioteca ',
  descricao: 'Tire uma foto',
  tipo: 'UNICA' as const,
  xp: 80,
  requisito: 'CODIGO' as const,
  codigo: ' biblio-26 ',
};

describe('MissoesAdminService', () => {
  it('cria no ciclo atual, inativa por padrão, com o autor', async () => {
    const { service, comandos } = banco();
    const r = await service.criar(base, 3, AGORA);
    expect(r.id).toBe(ID);
    const [, params] = comandos.find(([sql]) => sql.startsWith('INSERT'))!;
    expect(params).toEqual([
      'Visite a biblioteca',
      'Tire uma foto',
      'UNICA',
      80,
      false,
      null,
      null,
      '2026/2',
      3,
      'CODIGO',
      1,
      null,
      'BIBLIO-26',
      null,
      'TODOS',
      null,
    ]);
  });

  it.each([
    [{ ...base, tipo: 'SEMANAL' as const, xp: 70 }, /semanal limitada a 60/],
    [
      {
        ...base,
        inicio: '2026-11-20T08:00:00-03:00',
        fim: '2026-11-19T08:00:00-03:00',
      },
      /depois do início/,
    ],
    [{ ...base, fim: '2026-11-01T08:00:00-03:00' }, /no futuro/],
  ])('recusa regra inválida (%#)', async (dados, mensagem) => {
    const { service, comandos } = banco();
    const erro = await service.criar(dados, null, AGORA).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(erro.message).toMatch(mensagem);
    expect(gravou(comandos)).toBe(false);
  });

  it('edição com atualizadoEm antigo: 409 missao-alterada', async () => {
    const { service, comandos } = banco();
    const erro = await service
      .atualizar(ID, { xp: 50, atualizadoEm: '2026-11-15T00:00:00.000Z' })
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({ motivo: 'missao-alterada' });
    expect(gravou(comandos)).toBe(false);
  });

  it('publicada: tipo e XP não mudam (409 missao-publicada com os campos)', async () => {
    const { service, comandos } = banco({ ...PUBLICADA, conclusoes: 3 });
    const erro = await service
      .atualizar(ID, {
        tipo: 'SEMANAL',
        xp: 30,
        atualizadoEm: ATUALIZADO.toISOString(),
      })
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-publicada',
      campos: ['tipo', 'xp'],
    });
    expect(gravou(comandos)).toBe(false);
  });

  it.each([
    ['público', { publico: 'PADRINHOS' as const }, 'publico'],
    ['início', { inicio: '2026-11-20T08:00:00-03:00' }, 'inicio'],
    ['meta', { quantidade: 2 }, 'quantidade'],
    ['objetivo', { requisito: 'FEED_COMENTARIOS' as const }, 'requisito'],
  ])('arquivada também congela %s', async (_caso, mudanca, campo) => {
    const { service, comandos } = banco({
      ativa: false,
      publicada_em: ATUALIZADO,
    });
    const erro = await service
      .atualizar(ID, { ...mudanca, atualizadoEm: ATUALIZADO.toISOString() })
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-publicada',
      campos: [campo],
    });
    expect(gravou(comandos)).toBe(false);
  });

  it('publicada: título, instruções e prazo prorrogado mudam; mesmo valor não conta como mudança', async () => {
    const { service, comandos } = banco({
      ...PUBLICADA,
      fim: new Date('2026-11-25T21:00:00.000Z'),
    });
    await service.atualizar(
      ID,
      {
        titulo: ' Biblioteca Central ',
        instrucoes: ' Peça o código no balcão. ',
        fim: '2026-12-01T18:00:00-03:00',
        xp: 80,
        tipo: 'UNICA',
        atualizadoEm: ATUALIZADO.toISOString(),
      },
      AGORA,
    );
    const [, params] = comandos.find(([sql]) => sql.startsWith('UPDATE'))!;
    expect(params[1]).toBe('Biblioteca Central');
    expect(params[6]).toEqual(new Date('2026-12-01T21:00:00.000Z'));
    expect(params[11]).toBe('Peça o código no balcão.');
  });

  it.each([
    ['encurtado', new Date('2026-12-10T21:00:00.000Z')],
    ['criado onde não havia', null],
  ])('publicada: prazo %s dá 409', async (_caso, fimAtual) => {
    const { service, comandos } = banco({ ...PUBLICADA, fim: fimAtual });
    const erro = await service
      .atualizar(
        ID,
        {
          fim: '2026-12-01T18:00:00-03:00',
          atualizadoEm: ATUALIZADO.toISOString(),
        },
        AGORA,
      )
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-publicada',
      campos: ['fim'],
      message: expect.stringContaining('só pode ser prorrogado'),
    });
    expect(gravou(comandos)).toBe(false);
  });

  it('publicada: tirar o prazo vale como prorrogação; junto de outro campo, lista os dois', async () => {
    const semPrazo = banco({
      ...PUBLICADA,
      fim: new Date('2026-12-10T21:00:00.000Z'),
    });
    await semPrazo.service.atualizar(
      ID,
      { fim: null, atualizadoEm: ATUALIZADO.toISOString() },
      AGORA,
    );
    const [, params] = semPrazo.comandos.find(([sql]) =>
      sql.startsWith('UPDATE'),
    )!;
    expect(params[6]).toBeNull();

    const dois = banco({
      ...PUBLICADA,
      fim: new Date('2026-12-10T21:00:00.000Z'),
    });
    const erro = await dois.service
      .atualizar(
        ID,
        {
          xp: 50,
          fim: '2026-12-01T18:00:00-03:00',
          atualizadoEm: ATUALIZADO.toISOString(),
        },
        AGORA,
      )
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-publicada',
      campos: ['xp', 'fim'],
    });
  });

  it('rascunho: o prazo ainda pode encurtar', async () => {
    const { service, comandos } = banco({
      fim: new Date('2026-12-10T21:00:00.000Z'),
    });
    await service.atualizar(
      ID,
      {
        fim: '2026-12-01T18:00:00-03:00',
        atualizadoEm: ATUALIZADO.toISOString(),
      },
      AGORA,
    );
    const [, params] = comandos.find(([sql]) => sql.startsWith('UPDATE'))!;
    expect(params[6]).toEqual(new Date('2026-12-01T21:00:00.000Z'));
  });

  it('excluir: rascunho apaga; publicada ou arquivada responde 409', async () => {
    const rascunho = banco();
    await rascunho.service.excluir(ID);
    expect(
      rascunho.comandos.some(([sql]) => sql.startsWith('DELETE FROM')),
    ).toBe(true);

    for (const linha of [PUBLICADA, { ativa: false, publicada_em: ATUALIZADO }]) {
      const { service, comandos } = banco(linha);
      const erro = await service.excluir(ID).catch((e) => e);
      expect(erro).toBeInstanceOf(ConflictException);
      expect(erro.getResponse()).toMatchObject({ motivo: 'missao-publicada' });
      expect(comandos.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
    }
  });

  it('PucStops: alvoId antigo vira lista; alvoIds sem repetidos e meta = todos os pontos', async () => {
    const antigo = banco();
    await antigo.service.criar(
      { ...base, codigo: undefined, requisito: 'PUCSTOPS', alvoId: PONTO_A },
      null,
      AGORA,
    );
    const [, p1] = antigo.comandos.find(([sql]) => sql.startsWith('INSERT'))!;
    expect([p1[10], p1[11], p1[15]]).toEqual([1, null, [PONTO_A]]);

    const varios = banco();
    await varios.service.criar(
      {
        ...base,
        codigo: undefined,
        requisito: 'PUCSTOPS',
        alvoIds: [PONTO_A, PONTO_B.toUpperCase(), PONTO_A],
      },
      null,
      AGORA,
    );
    const [, p2] = varios.comandos.find(([sql]) => sql.startsWith('INSERT'))!;
    expect([p2[10], p2[15]]).toEqual([2, [PONTO_A, PONTO_B]]);

    // O painel manda a regra inteira: alvoId nulo e os pontos em alvoIds.
    const painel = banco();
    await painel.service.criar(
      {
        ...base,
        codigo: undefined,
        requisito: 'PUCSTOPS',
        alvoId: null,
        alvoIds: [PONTO_B],
      },
      null,
      AGORA,
    );
    const [, p3] = painel.comandos.find(([sql]) => sql.startsWith('INSERT'))!;
    expect([p3[10], p3[11], p3[15]]).toEqual([1, null, [PONTO_B]]);
  });

  it.each([
    [
      { alvoIds: [PONTO_A, INATIVO] },
      UnprocessableEntityException,
      /não existe ou foi desativado/,
    ],
    [
      { alvoIds: [PONTO_A, PONTO_B], quantidade: 1 },
      BadRequestException,
      /quantidade deve ser 2/,
    ],
    [
      { alvoId: PONTO_A, alvoIds: [PONTO_B] },
      BadRequestException,
      /só em alvoIds/,
    ],
  ])('PucStops recusa pontos incoerentes (%#)', async (mudanca, tipo, mensagem) => {
    const { service, comandos } = banco();
    const erro = await service
      .criar(
        { ...base, codigo: undefined, requisito: 'PUCSTOPS', ...mudanca },
        null,
        AGORA,
      )
      .catch((e) => e);
    expect(erro).toBeInstanceOf(tipo);
    expect(erro.message).toMatch(mensagem);
    expect(gravou(comandos)).toBe(false);
  });

  it('publicação no feed não vale para o público de apadrinhados', async () => {
    const { service, comandos } = banco();
    const erro = await service
      .criar(
        {
          ...base,
          codigo: undefined,
          requisito: 'FEED_PUBLICACOES',
          quantidade: 2,
          publico: 'APADRINHADOS',
        },
        null,
        AGORA,
      )
      .catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(erro.message).toMatch(/Só padrinhos com dupla publicam/);
    expect(gravou(comandos)).toBe(false);
  });

  it('virar semanal exige xp dentro do teto semanal', async () => {
    const { service } = banco();
    await expect(
      service.atualizar(ID, {
        tipo: 'SEMANAL',
        atualizadoEm: ATUALIZADO.toISOString(),
      }),
    ).rejects.toThrow(/semanal limitada a 60/);
  });

  it('atualiza mantendo o que não veio', async () => {
    const { service, comandos } = banco();
    await service.atualizar(
      ID,
      { xp: 60, atualizadoEm: ATUALIZADO.toISOString() },
      AGORA,
    );
    const [, params] = comandos.find(([sql]) => sql.startsWith('UPDATE'))!;
    expect(params).toEqual([
      ID,
      'Missão',
      'Descrição',
      'UNICA',
      60,
      null,
      null,
      'CODIGO',
      1,
      null,
      'BIBLIO-26',
      null,
      'TODOS',
      null,
      false,
    ]);
  });

  it('missão do auto-claim já publicada ganha o primeiro requisito, segue publicada e a janela recomeça', async () => {
    const { service, comandos } = banco({
      requisito: null,
      codigo: null,
      ativa: false,
      publicada_em: ATUALIZADO,
      conclusoes: 4,
    });
    await service.atualizar(
      ID,
      {
        requisito: 'PUCSTOPS',
        alvoId: PONTO_A,
        atualizadoEm: ATUALIZADO.toISOString(),
      },
      AGORA,
    );
    const [sql, params] = comandos.find(([q]) => q.startsWith('UPDATE'))!;
    expect(sql).toContain(
      '"publicada_em" = CASE WHEN $15 AND "publicada_em" IS NOT NULL THEN now()',
    );
    expect([params[7], params[13], params[14]]).toEqual([
      'PUCSTOPS',
      [PONTO_A],
      true,
    ]);
  });

  it('missão do auto-claim: ganhar o requisito não destrava o XP', async () => {
    const { service, comandos } = banco({
      requisito: null,
      codigo: null,
      ativa: false,
      publicada_em: ATUALIZADO,
    });
    const erro = await service
      .atualizar(
        ID,
        {
          requisito: 'PUCSTOPS',
          alvoId: PONTO_A,
          xp: 50,
          atualizadoEm: ATUALIZADO.toISOString(),
        },
        AGORA,
      )
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-publicada',
      campos: ['xp'],
    });
    expect(gravou(comandos)).toBe(false);
  });

  it('sem campos: 400', async () => {
    const { service } = banco();
    await expect(
      service.atualizar(ID, { atualizadoEm: ATUALIZADO.toISOString() }),
    ).rejects.toThrow(BadRequestException);
  });

  it('ativar é idempotente e recusa missão vencida', async () => {
    const ativa = banco({ ativa: true });
    await ativa.service.definirAtiva(ID, true);
    expect(gravou(ativa.comandos)).toBe(false);

    const vencida = banco({ fim: new Date('2020-01-01T00:00:00Z') });
    const erro = await vencida.service.definirAtiva(ID, true).catch((e) => e);
    expect(erro).toBeInstanceOf(UnprocessableEntityException);
    expect(gravou(vencida.comandos)).toBe(false);
  });

  it('desativar grava ativa = false e fecha o código liberado', async () => {
    const { service, comandos } = banco({ ativa: true });
    await service.definirAtiva(ID, false);
    const [sql, params] = comandos.find(([sql]) => sql.startsWith('UPDATE'))!;
    expect(params).toEqual([ID, false]);
    expect(sql).toContain(
      '"codigo_liberado_ate" = CASE WHEN $2 THEN "codigo_liberado_ate" END',
    );
  });

  it('liberar o código: só missão publicada, no período e com código', async () => {
    const vigente = { ...PUBLICADA, vigente_agora: true };
    const ok = banco(vigente);
    await ok.service.liberarCodigo(ID, 15);
    const [sql, params] = ok.comandos.find(([s]) => s.startsWith('UPDATE'))!;
    expect(sql).toBe(
      'UPDATE "gamificacao"."missoes" SET "codigo_liberado_ate" = now() + make_interval(mins => $2) WHERE "id" = $1',
    );
    expect(params).toEqual([ID, 15]);
    expect(ok.comandos.some(([s]) => s.includes('FOR UPDATE'))).toBe(true);

    for (const [linha, motivo] of [
      [{ ...vigente, requisito: 'FEED_COMENTARIOS', codigo: null }, 'sem-codigo'],
      [{ vigente_agora: false }, 'missao-nao-publicada'],
      [{ ...PUBLICADA, vigente_agora: false }, 'fora-do-periodo'],
    ] as const) {
      const { service, comandos } = banco(linha);
      const erro = await service.liberarCodigo(ID, 15).catch((e) => e);
      expect(erro).toBeInstanceOf(UnprocessableEntityException);
      expect(erro.getResponse()).toMatchObject({ motivo });
      expect(gravou(comandos)).toBe(false);
    }
  });

  it('encerrar o código fecha na hora, sem mexer em atualizado_em', async () => {
    const { service, comandos } = banco({ ...PUBLICADA, vigente_agora: true });
    await service.encerrarCodigo(ID);
    const [sql, params] = comandos.find(([s]) => s.startsWith('UPDATE'))!;
    expect(sql).toBe(
      'UPDATE "gamificacao"."missoes" SET "codigo_liberado_ate" = NULL WHERE "id" = $1',
    );
    expect(params).toEqual([ID]);
  });

  it('publicar de novo com ponto desativado no roteiro: o ponto não conta, basta um ativo', async () => {
    const roteiro = {
      requisito: 'PUCSTOPS',
      codigo: null,
      quantidade: 2,
      publicada_em: ATUALIZADO,
    };
    const ok = banco({
      ...roteiro,
      pontos: [
        { id: PONTO_A, nome: 'Biblioteca', ativo: true },
        { id: INATIVO, nome: 'Prédio 34', ativo: false },
      ],
    });
    await ok.service.definirAtiva(ID, true);
    const [, params] = ok.comandos.find(([s]) => s.startsWith('UPDATE'))!;
    expect(params).toEqual([ID, true]);

    const vazio = banco({
      ...roteiro,
      quantidade: 1,
      pontos: [{ id: INATIVO, nome: 'Prédio 34', ativo: false }],
    });
    const erro = await vazio.service.definirAtiva(ID, true).catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'alvo-invalido',
      message: 'Todos os PucStops do roteiro foram desativados. Crie outra missão.',
    });
    expect(gravou(vazio.comandos)).toBe(false);

    const primeira = banco({
      ...roteiro,
      publicada_em: null,
      pontos: [
        { id: PONTO_A, nome: 'Biblioteca', ativo: true },
        { id: INATIVO, nome: 'Prédio 34', ativo: false },
      ],
    });
    const naPrimeira = await primeira.service
      .definirAtiva(ID, true)
      .catch((e) => e);
    expect(naPrimeira.getResponse()).toMatchObject({ motivo: 'alvo-invalido' });
  });

  it('ativar grava ativa = true', async () => {
    const { service, comandos } = banco();
    await service.definirAtiva(ID, true);
    const [, params] = comandos.find(([sql]) => sql.startsWith('UPDATE'))!;
    expect(params).toEqual([ID, true]);
  });

  it('ativar missão sem requisito: 422 sem-requisito', async () => {
    const { service, comandos } = banco({ requisito: null, codigo: null });
    const erro = await service.definirAtiva(ID, true).catch((e) => e);
    expect(erro).toBeInstanceOf(UnprocessableEntityException);
    expect(erro.getResponse()).toMatchObject({ motivo: 'sem-requisito' });
    expect(gravou(comandos)).toBe(false);
  });

  it('publicada: o requisito não muda; o código pode trocar', async () => {
    const { service } = banco({ ...PUBLICADA, conclusoes: 2 });
    const erro = await service
      .atualizar(ID, {
        requisito: 'FEED_COMENTARIOS',
        atualizadoEm: ATUALIZADO.toISOString(),
      })
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-publicada',
    });
    const outro = banco({ ...PUBLICADA, conclusoes: 2 });
    await outro.service.atualizar(
      ID,
      { codigo: 'biblio-27', atualizadoEm: ATUALIZADO.toISOString() },
      AGORA,
    );
    const [, params] = outro.comandos.find(([sql]) =>
      sql.startsWith('UPDATE'),
    )!;
    expect(params[10]).toBe('BIBLIO-27');
  });

  it.each([
    [{ requisito: 'CODIGO' as const, codigo: 'ab' }, /4 a 20/],
    [{ requisito: 'CODIGO' as const, codigo: undefined }, /4 a 20/],
    [
      { requisito: 'FEED_CURTIDAS' as const, codigo: 'SEGREDO' },
      /codigo só vale/,
    ],
    [{ requisito: 'CODIGO' as const, quantidade: 3 }, /quantidade deve ser 1/],
    [
      {
        requisito: 'FEED_COMENTARIOS' as const,
        codigo: undefined,
        alvoId: '8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b',
      },
      /alvoId só vale/,
    ],
    [{ requisito: 'EVENTO' as const, codigo: undefined }, /Escolha o evento/],
  ])('recusa requisito incoerente (%#)', async (mudanca, mensagem) => {
    const { service, comandos } = banco();
    const erro = await service
      .criar({ ...base, ...mudanca }, null, AGORA)
      .catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(erro.message).toMatch(mensagem);
    expect(gravou(comandos)).toBe(false);
  });

  it('criar exige o ciclo aberto em Programas', async () => {
    const { service, comandos } = banco({}, false);
    const erro = await service.criar(base, null, AGORA).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(erro.message).toMatch(/Ciclo 2026\/2 não cadastrado/);
    expect(gravou(comandos)).toBe(false);
  });
});
