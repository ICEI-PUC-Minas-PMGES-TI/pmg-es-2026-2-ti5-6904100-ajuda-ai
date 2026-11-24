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
      'CODIGO',
      1,
      null,
      'BIBLIO-26',
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

  it('requisito já concluído por alunos não muda; o código pode trocar', async () => {
    const { service } = banco({ conclusoes: 2 });
    const erro = await service
      .atualizar(ID, {
        requisito: 'FEED_COMENTARIOS',
        atualizadoEm: ATUALIZADO.toISOString(),
      })
      .catch((e) => e);
    expect(erro.getResponse()).toMatchObject({
      motivo: 'missao-com-conclusoes',
    });
    const outro = banco({ conclusoes: 2 });
    await outro.service.atualizar(
      ID,
      { codigo: 'biblio-27', atualizadoEm: ATUALIZADO.toISOString() },
      AGORA,
    );
    const [, params] = outro.comandos.find(([sql]) =>
      sql.startsWith('UPDATE'),
    )!;
    expect(params.at(-1)).toBe('BIBLIO-27');
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
