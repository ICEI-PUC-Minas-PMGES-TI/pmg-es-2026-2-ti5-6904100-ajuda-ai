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
    expect(conclusao(comandos)![1]).toEqual([
      ID,
      USUARIO,
      CICLO,
      null,
      80,
      80,
      '99',
      JSON.stringify({ requisito: 'CODIGO', codigo: true }),
    ]);
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
});
