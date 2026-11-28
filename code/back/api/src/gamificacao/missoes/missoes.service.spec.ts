import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import type { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../../participacoes/participacoes.service.js';
import { MissoesService } from './missoes.service.js';
import { semanaDe, xpPrevisto } from './missoes.js';
import { metaEfetiva } from './requisitos.js';

const ID = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const USUARIO = 7;
const AGORA = new Date('2026-11-18T15:00:00-03:00');
const CICLO = ParticipacoesService.programaAtual(AGORA);
const LEITURA = { codigo: 'biblio-26' };

function notificacoesFalsas() {
  const enviadas: Array<[number, { tipo: string; chave: string }]> = [];
  const servico = {
    criar: async (usuarioId: number, nova: { tipo: string; chave: string }) => {
      enviadas.push([usuarioId, nova]);
    },
  } as unknown as NotificacoesService;
  return { servico, enviadas };
}

interface Cenario {
  tipo?: 'UNICA' | 'SEMANAL';
  xp?: number;
  ativa?: boolean;
  ciclo?: string;
  iniciou?: boolean;
  aberta?: boolean;
  existe?: boolean;
  anterior?: boolean;
  geral?: number;
  semana?: number;
  xpAcumulado?: number;
  corrida?: boolean;
  requisito?: string | null;
  alcancavel?: boolean;
  tentativas?: number;
  codigoLiberado?: boolean;
}

function banco(c: Cenario = {}) {
  const {
    tipo = 'UNICA',
    xp = 80,
    ativa = true,
    ciclo = CICLO,
    iniciou = true,
    aberta = true,
    existe = true,
    anterior = false,
    geral = 0,
    semana = 0,
    xpAcumulado = 420,
    corrida = false,
    requisito = 'CODIGO',
    alcancavel = true,
    tentativas = 0,
    codigoLiberado = true,
  } = c;
  const comandos: Array<[string, unknown[]]> = [];
  let xpMovimentado = 0;
  let transacaoAberta = false;
  const qr = {
    get isTransactionActive() {
      return transacaoAberta;
    },
    connect: async () => {},
    startTransaction: async () => {
      transacaoAberta = true;
    },
    commitTransaction: async () => {
      transacaoAberta = false;
      comandos.push(['COMMIT', []]);
    },
    rollbackTransaction: async () => {
      transacaoAberta = false;
      comandos.push(['ROLLBACK', []]);
    },
    release: async () => {},
    query: async (sql: string, params: unknown[] = []) => {
      comandos.push([sql, params]);
      if (
        sql.includes('FROM "gamificacao"."missoes" WHERE "id" = $1 FOR SHARE')
      )
        return existe
          ? [
              {
                id: ID,
                titulo: 'Visite a biblioteca',
                tipo,
                xp,
                ativa,
                ciclo,
                inicio: null,
                fim: aberta ? null : new Date('2026-11-01T00:00:00Z'),
                iniciou,
                aberta,
                requisito,
                quantidade: 1,
                alvo_id: null,
                codigo: 'BIBLIO-26',
                codigo_liberado: codigoLiberado,
                alcancavel,
              },
            ]
          : [];
      if (sql.includes('"missoes_tentativas_codigo"'))
        return [{ erros: tentativas }];
      if (sql.includes('SELECT "saldo" FROM')) return [{ saldo: 230 }];
      if (sql.includes('FROM "gamificacao"."missoes_conclusoes" WHERE'))
        return anterior
          ? [
              {
                id: 'anterior',
                xp_creditado: 50,
                criado_em: new Date('2026-11-17T10:00:00Z'),
              },
            ]
          : [];
      if (sql.includes('SELECT "xp_acumulado" FROM'))
        return [{ xp_acumulado: xpAcumulado }];
      if (sql.includes('AS totens')) return [{ totens: 0, geral, semana }];
      if (sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"')) {
        xpMovimentado = Number(params[2]);
        return [{ id: '99', criado_em: new Date() }];
      }
      if (sql.includes('UPDATE "gamificacao"."xp_carteiras"'))
        return [{ xp_acumulado: xpAcumulado + xpMovimentado }];
      if (sql.includes('INSERT INTO "gamificacao"."missoes_conclusoes"')) {
        if (corrida)
          throw Object.assign(new Error('duplicada'), {
            code: '23505',
            constraint: 'uq_missoes_conclusoes_unica',
          });
        return [{ id: 'conclusao', criado_em: AGORA }];
      }
      return [];
    },
  } as unknown as QueryRunner;
  const db = {
    options: { schema: 'feed' },
    createQueryRunner: () => qr,
    query: (sql: string, params?: unknown[]) => qr.query(sql, params),
  } as unknown as DataSource;
  const avisos = notificacoesFalsas();
  return {
    service: new MissoesService(db, avisos.servico),
    comandos,
    enviadas: avisos.enviadas,
  };
}

const ledger = (comandos: Array<[string, unknown[]]>) =>
  comandos.find(([sql]) =>
    sql.includes('INSERT INTO "gamificacao"."xp_movimentacoes"'),
  );
const conclusao = (comandos: Array<[string, unknown[]]>) =>
  comandos.find(([sql]) =>
    sql.includes('INSERT INTO "gamificacao"."missoes_conclusoes"'),
  );

describe('semanaDe', () => {
  it.each([
    ['2026-11-16T00:00:00-03:00', '2026-11-16'],
    ['2026-11-18T15:00:00-03:00', '2026-11-16'],
    ['2026-11-22T23:59:00-03:00', '2026-11-16'],
    ['2026-11-23T01:00:00Z', '2026-11-16'],
    ['2026-11-23T03:00:00Z', '2026-11-23'],
    ['2027-01-01T12:00:00-03:00', '2026-12-28'],
  ])('%s → %s', (data, esperado) => {
    expect(semanaDe(new Date(data))).toBe(esperado);
  });
});

describe('xpPrevisto', () => {
  it('aplica o teto do ciclo e, nas semanais, o semanal', () => {
    expect(xpPrevisto(80, 'UNICA', { geral: 0, missoesSemana: 60 })).toBe(80);
    expect(xpPrevisto(80, 'UNICA', { geral: 1450, missoesSemana: 0 })).toBe(50);
    expect(xpPrevisto(30, 'SEMANAL', { geral: 0, missoesSemana: 40 })).toBe(20);
    expect(xpPrevisto(30, 'SEMANAL', { geral: 1500, missoesSemana: 0 })).toBe(
      0,
    );
  });
});

describe('MissoesService.concluir', () => {
  it('subir de nível gera a notificação NIVEL_SUBIU depois do commit', async () => {
    const { service, enviadas, comandos } = banco();
    await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(enviadas).toEqual([
      [
        USUARIO,
        expect.objectContaining({ tipo: 'NIVEL_SUBIU', chave: 'nivel:5' }),
      ],
    ]);
    expect(comandos.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });

  it('sem subir de nível não notifica', async () => {
    const { service, enviadas } = banco({ geral: 1500 });
    await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(enviadas).toEqual([]);
  });

  it('credita XP e moedas pelo ledger com a chave da missão no ciclo', async () => {
    const { service, comandos } = banco();
    const r = await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(r).toMatchObject({
      missaoId: ID,
      conclusaoId: 'conclusao',
      xpConfigurado: 80,
      xp: 80,
      moedas: 80,
      limitado: false,
      teto: null,
      saldoMoedas: 310,
      xpAcumulado: 500,
      subiuDeNivel: true,
      ciclo: CICLO,
      semana: null,
    });
    expect(r.nivel.numero).toBe(5);
    const [, params] = ledger(comandos)!;
    expect(params).toEqual([
      USUARIO,
      80,
      80,
      CICLO,
      'MISSAO',
      'MISSAO',
      ID,
      'Missão: Visite a biblioteca',
      `missao:${ID}:${USUARIO}:${CICLO}`,
      310,
    ]);
    const gravada = conclusao(comandos)![1];
    expect(gravada.slice(0, 7)).toEqual([
      ID,
      USUARIO,
      CICLO,
      null,
      80,
      80,
      '99',
    ]);
    // A evidência identifica o código aceito sem guardá-lo.
    const evidencia = JSON.parse(gravada[7] as string) as Record<
      string,
      unknown
    >;
    expect(evidencia).toEqual({
      requisito: 'CODIGO',
      codigo: true,
      codigoUsado: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(JSON.stringify(evidencia)).not.toContain('BIBLIO');
    expect(comandos.at(-1)![0]).toBe('COMMIT');
  });

  it('teto semanal corta a recorrente e usa a semana na chave', async () => {
    const { service, comandos } = banco({
      tipo: 'SEMANAL',
      xp: 30,
      semana: 40,
    });
    const r = await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(r).toMatchObject({
      xpConfigurado: 30,
      xp: 20,
      moedas: 20,
      limitado: true,
      teto: 'semanal',
      semana: '2026-11-16',
    });
    const [, params] = ledger(comandos)!;
    expect(params[5]).toBe('MISSAO_SEMANAL');
    expect(params[8]).toBe(`missao:${ID}:${USUARIO}:2026-11-16`);
    expect(conclusao(comandos)![1][3]).toBe('2026-11-16');
  });

  it('teto do ciclo cheio: grava a conclusão sem movimentação', async () => {
    const { service, comandos } = banco({ geral: 1500 });
    const r = await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(r).toMatchObject({
      xp: 0,
      moedas: 0,
      limitado: true,
      teto: 'ciclo',
      saldoMoedas: 230,
      xpAcumulado: 420,
      subiuDeNivel: false,
    });
    expect(ledger(comandos)).toBeUndefined();
    expect(conclusao(comandos)![1].slice(4, 7)).toEqual([80, 0, null]);
  });

  it('teto do ciclo parcial', async () => {
    const { service } = banco({ geral: 1470 });
    const r = await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(r).toMatchObject({ xp: 30, limitado: true, teto: 'ciclo' });
  });

  it('conclusão duplicada: 409 ja-concluida sem crédito', async () => {
    const { service, comandos } = banco({ anterior: true });
    const erro = await service
      .concluir(USUARIO, ID, AGORA, LEITURA)
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'ja-concluida',
      conclusao: { id: 'anterior', xp: 50, moedas: 50 },
    });
    expect(ledger(comandos)).toBeUndefined();
    expect(comandos.at(-1)![0]).toBe('ROLLBACK');
  });

  it('corrida barrada pelo índice único vira 409', async () => {
    const { service, comandos } = banco({ corrida: true });
    const erro = await service
      .concluir(USUARIO, ID, AGORA, LEITURA)
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(erro.getResponse()).toMatchObject({ motivo: 'ja-concluida' });
    expect(comandos.at(-1)![0]).toBe('ROLLBACK');
  });

  it.each([
    ['inexistente', { existe: false }],
    ['inativa', { ativa: false }],
    ['de outro ciclo', { ciclo: '2020/1' }],
  ])('missão %s: 404', async (_nome, cenario) => {
    const { service, comandos } = banco(cenario);
    await expect(service.concluir(USUARIO, ID, AGORA, LEITURA)).rejects.toThrow(
      NotFoundException,
    );
    expect(ledger(comandos)).toBeUndefined();
  });

  it.each([
    ['expirada', { aberta: false }],
    ['ainda não iniciada', { iniciou: false }],
  ])('missão %s: 422 fora-do-periodo', async (_nome, cenario) => {
    const { service, comandos } = banco(cenario);
    const erro = await service
      .concluir(USUARIO, ID, AGORA, LEITURA)
      .catch((e) => e);
    expect(erro).toBeInstanceOf(UnprocessableEntityException);
    expect(erro.getResponse()).toMatchObject({ motivo: 'fora-do-periodo' });
    expect(ledger(comandos)).toBeUndefined();
  });

  it.each([
    ['sem requisito (missão antiga)', { requisito: null }],
    ['fora do alcance do aluno', { alcancavel: false }],
  ])('missão %s: 404 sem crédito', async (_nome, cenario) => {
    const { service, comandos } = banco(cenario);
    await expect(service.concluir(USUARIO, ID, AGORA, LEITURA)).rejects.toThrow(
      NotFoundException,
    );
    expect(ledger(comandos)).toBeUndefined();
  });

  it('código errado: 422, sem crédito, e a tentativa fica gravada', async () => {
    const { service, comandos } = banco();
    const erro = await service
      .concluir(USUARIO, ID, AGORA, { codigo: 'CHUTE' })
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({ motivo: 'codigo-incorreto' });
    expect(ledger(comandos)).toBeUndefined();
    const tentativa = comandos.findIndex(([sql]) =>
      sql.startsWith('INSERT INTO "gamificacao"."missoes_tentativas_codigo"'),
    );
    expect(tentativa).toBeGreaterThan(-1);
    expect(comandos[tentativa + 1][0]).toBe('COMMIT');
    expect(comandos.some(([sql]) => sql === 'ROLLBACK')).toBe(false);
  });

  it('sem código: 400; muitas tentativas: 429 mesmo com o código certo', async () => {
    const sem = banco();
    const e1 = await sem.service
      .concluir(USUARIO, ID, AGORA, {})
      .catch((e) => e);
    expect(e1.getStatus()).toBe(400);
    const bloqueado = banco({ tentativas: 5 });
    const e2 = await bloqueado.service
      .concluir(USUARIO, ID, AGORA, LEITURA)
      .catch((e) => e);
    expect(e2.getStatus()).toBe(429);
    expect(ledger(bloqueado.comandos)).toBeUndefined();
  });

  it('código fechado pela coordenação: 422 sem conferir o código nem gastar tentativa', async () => {
    const { service, comandos } = banco({ codigoLiberado: false });
    const erro = await service
      .concluir(USUARIO, ID, AGORA, LEITURA)
      .catch((e) => e);
    expect(erro).toBeInstanceOf(UnprocessableEntityException);
    expect(erro.getResponse()).toMatchObject({ motivo: 'codigo-fechado' });
    expect(ledger(comandos)).toBeUndefined();
    expect(
      comandos.some(([sql]) => sql.includes('"missoes_tentativas_codigo"')),
    ).toBe(false);
    expect(comandos.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('a leitura da missão traz se o código está no tempo liberado', async () => {
    const { service, comandos } = banco();
    await service.concluir(USUARIO, ID, AGORA, LEITURA);
    expect(comandos[0][0]).toContain(
      'COALESCE("codigo_liberado_ate" > now(), false) AS codigo_liberado',
    );
  });

  it('id malformado: 404 sem abrir transação', async () => {
    const { service, comandos } = banco();
    await expect(
      service.concluir(USUARIO, 'abc', AGORA, LEITURA),
    ).rejects.toThrow(NotFoundException);
    expect(comandos).toEqual([]);
  });
});

describe('MissoesService.listar', () => {
  function bancoLista(geral: number, semana: number) {
    const linhas = [
      {
        id: 'a',
        titulo: 'Concluída',
        descricao: 'x',
        tipo: 'UNICA',
        requisito: 'CODIGO',
        quantidade: 1,
        progresso: 0,
        xp: 50,
        fim: null,
        conclusao_id: 'c1',
        xp_configurado: 50,
        xp_creditado: 50,
        concluida_em: AGORA,
      },
      {
        id: 'b',
        titulo: 'Semanal',
        descricao: 'x',
        tipo: 'SEMANAL',
        requisito: 'FEED_COMENTARIOS',
        quantidade: 3,
        progresso: 5,
        xp: 30,
        fim: null,
        conclusao_id: null,
        xp_configurado: null,
        xp_creditado: null,
        concluida_em: null,
      },
      {
        id: 'c',
        titulo: 'Única',
        descricao: 'x',
        tipo: 'UNICA',
        requisito: 'PUCSTOPS',
        quantidade: 2,
        progresso: 1,
        disponiveis: 1,
        xp: 80,
        fim: new Date('2026-12-05T02:59:59Z'),
        conclusao_id: null,
        xp_configurado: null,
        xp_creditado: null,
        concluida_em: null,
      },
    ];
    const db = {
      options: { schema: 'feed' },
      query: async (sql: string) =>
        sql.includes('AS totens')
          ? [{ totens: 0, geral, semana }]
          : sql.includes('pg_extension')
            ? [{ schema: 'public' }]
            : sql.includes('lower("email")')
              ? [{ email: 'camila@pucminas.edu.br' }]
              : linhas,
    } as unknown as DataSource;
    return new MissoesService(db, notificacoesFalsas().servico);
  }

  it('status por missão, limites e concluídas no fim', async () => {
    const r = await bancoLista(420, 40).listar(USUARIO, AGORA);
    expect(r.ciclo).toBe(CICLO);
    expect(r.semana).toBe('2026-11-16');
    expect(r.limites).toEqual({
      ciclo: { ganho: 420, limite: 1500 },
      semanal: { ganho: 40, limite: 60 },
    });
    expect(
      r.missoes.map((m) => [m.id, m.status, m.xpPrevisto, m.moedas]),
    ).toEqual([
      ['b', 'limitada', 20, 30],
      ['c', 'disponivel', 80, 80],
      ['a', 'concluida', 0, 50],
    ]);
    expect(r.missoes.map((m) => [m.id, m.progresso, m.pronta])).toEqual([
      ['b', { atual: 3, meta: 3 }, true],
      ['c', { atual: 1, meta: 2 }, false],
      ['a', null, false],
    ]);
    expect(r.missoes[2].conclusao).toMatchObject({
      id: 'c1',
      xp: 50,
      limitado: false,
    });
  });

  function bancoComLinhas(linhas: Array<Record<string, unknown>>) {
    const base = {
      descricao: 'x',
      tipo: 'UNICA',
      xp: 40,
      fim: null,
      conclusao_id: null,
      xp_configurado: null,
      xp_creditado: null,
      concluida_em: null,
      disponiveis: 0,
      codigo_liberado_ate: null,
    };
    const comandos: string[] = [];
    const db = {
      options: { schema: 'feed' },
      query: async (sql: string) => {
        comandos.push(sql);
        return sql.includes('AS totens')
          ? [{ totens: 0, geral: 0, semana: 0 }]
          : sql.includes('pg_extension')
            ? [{ schema: 'public' }]
            : sql.includes('lower("email")')
              ? [{ email: 'camila@pucminas.edu.br' }]
              : linhas.map((l) => ({ ...base, ...l }));
      },
    } as unknown as DataSource;
    return {
      service: new MissoesService(db, notificacoesFalsas().servico),
      comandos,
    };
  }

  it('roteiro com ponto desativado: a meta desconta o ponto que o aluno não coletou', async () => {
    const pontos = [
      { id: 'p1', nome: 'Biblioteca', coletado: true, ativo: true },
      { id: 'p2', nome: 'Prédio 34', coletado: false, ativo: false },
      { id: 'p3', nome: 'Cantina', coletado: false, ativo: true },
    ];
    const { service, comandos } = bancoComLinhas([
      {
        id: 'r',
        titulo: 'Roteiro',
        requisito: 'PUCSTOPS',
        quantidade: 3,
        progresso: 1,
        disponiveis: 1,
        pontos,
      },
    ]);
    const [m] = (await service.listar(USUARIO, AGORA)).missoes;
    expect(m.progresso).toEqual({ atual: 1, meta: 2 });
    expect(m.pronta).toBe(false);
    expect(m.pontos).toEqual(pontos);
    const sql = comandos.find((c) => c.includes('AS disponiveis'))!;
    expect(sql).toContain('p."ativo" AND (m."pucstops" IS NULL');
    expect(sql).toContain('OR NOT p."ativo"), o."n" LIMIT 1');
  });

  it('código: mostra até quando vale só se a coordenação liberou e ainda não venceu', async () => {
    const depois = new Date(AGORA.getTime() + 10 * 60_000);
    const antes = new Date(AGORA.getTime() - 60_000);
    const { service } = bancoComLinhas([
      {
        id: 'aberto',
        titulo: 'A',
        requisito: 'CODIGO',
        quantidade: 1,
        progresso: 0,
        codigo_liberado_ate: depois,
      },
      {
        id: 'vencido',
        titulo: 'B',
        requisito: 'CODIGO',
        quantidade: 1,
        progresso: 0,
        codigo_liberado_ate: antes,
      },
      {
        id: 'fechado',
        titulo: 'C',
        requisito: 'CODIGO',
        quantidade: 1,
        progresso: 0,
      },
    ]);
    const r = await service.listar(USUARIO, AGORA);
    expect(r.missoes.map((m) => [m.id, m.codigoLiberadoAte, m.pronta])).toEqual(
      [
        ['aberto', depois.toISOString(), true],
        ['vencido', null, true],
        ['fechado', null, true],
      ],
    );
  });
});

describe('metaEfetiva', () => {
  it.each([
    ['sem ponto desativado, vale a quantidade', 'PUCSTOPS', 3, 1, 5, 3],
    [
      'roteiro: ponto desativado e não coletado sai da meta',
      'PUCSTOPS',
      3,
      1,
      1,
      2,
    ],
    ['ponto já coletado continua contando', 'PUCSTOPS', 3, 2, 0, 2],
    [
      'quaisquer: faltam menos totens ativos do que a meta',
      'PUCSTOPS',
      5,
      2,
      1,
      3,
    ],
    [
      'nenhum ponto ativo nem coletado: não se cumpre sozinha',
      'PUCSTOPS',
      3,
      0,
      0,
      1,
    ],
    ['outros requisitos não mudam', 'FEED_COMENTARIOS', 4, 1, 0, 4],
  ] as const)(
    '%s',
    (_caso, requisito, quantidade, atual, disponiveis, meta) => {
      expect(metaEfetiva(requisito, quantidade, atual, disponiveis)).toBe(meta);
    },
  );
});

describe('MissoesService.xpDaMissaoDePucStop', () => {
  const VISITA = 'VISITA_PUCSTOP';
  const MISSAO = 'MISSAO_PUCSTOPS';

  type Papel = 'padrinho' | 'apadrinhado' | null;

  function regra(acao: string, extra: Record<string, unknown> = {}) {
    return {
      acao,
      regraId: acao === VISITA ? 1 : 2,
      versao: 1,
      valorXp: 80,
      elegibilidade: 'todos',
      limiteRepeticoes: null,
      combinavelCom: [] as string[],
      ...extra,
    };
  }

  function servico(
    regras: Array<ReturnType<typeof regra>>,
    coletaXp: number,
    { jaCreditado = 0, usosDaRegra = 0 } = {},
  ) {
    const consultas: Array<[string, unknown[]]> = [];
    const qr = {
      query: async (sql: string, params: unknown[] = []) => {
        consultas.push([sql, params]);
        if (sql.includes('"pucstop_coletas" c'))
          return [{ id: '41', xp: coletaXp }];
        if (sql.includes('"jaCreditado"')) return [{ jaCreditado }];
        if (sql.includes(`'regraXpId'`)) return [{ total: usosDaRegra }];
        return [];
      },
    } as unknown as QueryRunner;
    const regrasXp = {
      configuracoesVigentes: async () => regras,
    } as unknown as ConstructorParameters<typeof MissoesService>[2];
    const s = new MissoesService(
      { options: { schema: 'feed' } } as unknown as DataSource,
      notificacoesFalsas().servico,
      regrasXp,
    );
    const calcular = (meta: number, papel: Papel = 'apadrinhado') =>
      (
        s as unknown as {
          xpDaMissaoDePucStop: (
            qr: QueryRunner,
            usuarioId: number,
            missao: { id: string; ciclo: string; xp: number },
            meta: number,
            papel: Papel,
          ) => Promise<{
            xp: number;
            xpConfigurado: number;
            coletaId: string;
            regra: { regraId: number } | null;
          }>;
        }
      ).xpDaMissaoDePucStop(
        qr,
        USUARIO,
        { id: ID, ciclo: CICLO, xp: 80 },
        meta,
        papel,
      );
    return { calcular, consultas };
  }

  it('sem combinação configurada, desconta o XP já pago pela coleta', async () => {
    const { calcular } = servico([regra(VISITA), regra(MISSAO)], 30);
    expect(await calcular(1)).toMatchObject({
      xp: 50,
      xpConfigurado: 80,
      coletaId: '41',
    });
  });

  it('sem regras vigentes, usa o XP da missão e não soma a visita', async () => {
    const { calcular } = servico([], 30);
    expect(await calcular(1)).toMatchObject({
      xp: 50,
      xpConfigurado: 80,
      regra: null,
    });
  });

  it.each([
    ['a visita', VISITA, MISSAO],
    ['a missão', MISSAO, VISITA],
  ])(
    'combinação declarada pela regra d%s soma os dois ganhos',
    async (_c, acao, outra) => {
      const { calcular } = servico(
        [regra(acao, { combinavelCom: [outra] }), regra(outra)],
        30,
      );
      expect((await calcular(1)).xp).toBe(80);
    },
  );

  it('o valor da regra MISSAO_PUCSTOPS substitui o XP da missão', async () => {
    const { calcular } = servico([regra(MISSAO, { valorXp: 45 })], 30);
    expect(await calcular(1)).toMatchObject({
      xp: 15,
      xpConfigurado: 45,
      regra: { regraId: 2 },
    });
  });

  it('com combinação, paga o valor da regra uma vez só, sem duplicar', async () => {
    const { calcular } = servico(
      [regra(MISSAO, { valorXp: 45, combinavelCom: [VISITA] })],
      30,
      { jaCreditado: 45 },
    );
    expect((await calcular(1)).xp).toBe(0);
  });

  it.each([
    ['apadrinhado', 'apadrinhado', 0],
    ['padrinho', 'padrinho', 50],
    ['sem papel no ciclo', null, 0],
  ] as const)(
    'regra só para padrinhos: %s recebe %s',
    async (_c, papel, esperado) => {
      const { calcular } = servico(
        [regra(MISSAO, { elegibilidade: 'padrinho' })],
        30,
      );
      expect((await calcular(1, papel)).xp).toBe(esperado);
    },
  );

  it.each([
    [1, 0, 50],
    [2, 2, 0],
  ])(
    'limite de %s repetições com %s já pagas',
    async (limiteRepeticoes, usosDaRegra, esperado) => {
      const { calcular, consultas } = servico(
        [regra(MISSAO, { limiteRepeticoes })],
        30,
        { usosDaRegra },
      );
      expect((await calcular(1)).xp).toBe(esperado);
      const [, params] = consultas.find(([sql]) =>
        sql.includes(`'regraXpId'`),
      )!;
      expect(params).toEqual([USUARIO, CICLO, '2']);
    },
  );

  it('desconta o que outra missão já creditou pela mesma coleta', async () => {
    const { calcular } = servico([], 30, { jaCreditado: 20 });
    expect((await calcular(1)).xp).toBe(30);
  });

  it('coleta que já pagou mais que a missão não gera XP negativo', async () => {
    const { calcular } = servico([], 120);
    expect((await calcular(1)).xp).toBe(0);
  });

  it('usa a coleta que completou a meta', async () => {
    const { calcular, consultas } = servico([], 30);
    await calcular(3);
    const [, params] = consultas.find(([sql]) =>
      sql.includes('"pucstop_coletas" c'),
    )!;
    expect(params).toEqual([USUARIO, ID, 2]);
  });
});
