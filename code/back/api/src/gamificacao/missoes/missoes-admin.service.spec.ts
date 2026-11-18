import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { NotificacoesService } from '../../notificacoes/notificacoes.service.js';
import { MissoesAdminService } from './missoes-admin.service.js';

const ID = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const ATUALIZADO = new Date('2026-11-16T18:00:00.000Z');
const AGORA = new Date('2026-11-17T12:00:00Z');

function banco(linha: Record<string, unknown> = {}) {
  const comandos: Array<[string, unknown[]]> = [];
  const atual = {
    id: ID,
    titulo: 'Missão',
    descricao: 'Descrição',
    tipo: 'UNICA',
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
    if (sql.startsWith('SELECT "ativada_em"'))
      return [{ ativada_em: linha.ativada_em ?? null }];
    return [];
  };
  const manager = { query };
  const db = {
    query,
    manager,
    transaction: async (fn: (m: typeof manager) => Promise<unknown>) =>
      fn(manager),
  } as unknown as DataSource;
  const avisos: Array<[string, { chave: string }]> = [];
  const notificacoes = {
    criarParaParticipantes: async (ciclo: string, nova: { chave: string }) => {
      avisos.push([ciclo, nova]);
    },
  } as unknown as NotificacoesService;
  return {
    service: new MissoesAdminService(db, notificacoes),
    comandos,
    avisos,
  };
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

  it('não muda o tipo de missão já concluída', async () => {
    const { service } = banco({ conclusoes: 3 });
    const erro = await service
      .atualizar(ID, {
        tipo: 'SEMANAL',
        xp: 30,
        atualizadoEm: ATUALIZADO.toISOString(),
      })
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-com-conclusoes',
    });
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
    ]);
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

  it('desativar grava ativa = false', async () => {
    const { service, comandos } = banco({ ativa: true });
    await service.definirAtiva(ID, false);
    const [, params] = comandos.find(([sql]) => sql.startsWith('UPDATE'))!;
    expect(params).toEqual([ID, false]);
  });

  it('primeira ativação avisa os participantes do ciclo', async () => {
    const { service, avisos } = banco();
    await service.definirAtiva(ID, true);
    expect(avisos).toEqual([
      [
        '2026/2',
        expect.objectContaining({
          chave: `missao-nova:${ID}`,
          tipo: 'MISSAO_NOVA',
        }),
      ],
    ]);
  });

  it('reativar não avisa de novo', async () => {
    const { service, avisos } = banco({ ativada_em: ATUALIZADO });
    await service.definirAtiva(ID, true);
    expect(avisos).toEqual([]);
  });

  it('desativar não avisa', async () => {
    const { service, avisos } = banco({ ativa: true, ativada_em: ATUALIZADO });
    await service.definirAtiva(ID, false);
    expect(avisos).toEqual([]);
  });

  it('criar já ativa avisa; rascunho não', async () => {
    const ativa = banco();
    await ativa.service.criar({ ...base, ativar: true }, null, AGORA);
    expect(ativa.avisos).toHaveLength(1);
    const rascunho = banco();
    await rascunho.service.criar(base, null, AGORA);
    expect(rascunho.avisos).toEqual([]);
  });
});
