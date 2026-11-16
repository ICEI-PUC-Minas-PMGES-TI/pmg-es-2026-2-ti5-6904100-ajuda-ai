import { ForbiddenException } from '@nestjs/common';
import type { DataSource, QueryRunner } from 'typeorm';
import type { AccessTokenPayload } from '../auth/authenticated-request.js';
import { LIMITES } from './economia.js';

/**
 * Domínio de gamificação do Ajuda-aí (ADR-0002): XP global por usuário,
 * ledger de movimentações e coletas de PucStop. Fica num schema próprio,
 * fora de `feed` (sem entidades TypeORM: o `synchronize` local nunca toca
 * nele) e fora de `mapa` (o mapa só descreve onde estão os PucStops).
 */
export const SCHEMA_GAMIFICACAO = 'gamificacao';

/**
 * Tipos da migration original (1792279161187). Fica congelado: a migration
 * histórica lê esta lista; tipos novos entram em [TIPOS_MOVIMENTACAO].
 */
export const TIPOS_MOVIMENTACAO_XP = [
  'PUCSTOP_CLAIM',
  'RECOMPENSA',
  'AJUSTE_ADMIN',
] as const;

/** Tipos aceitos hoje pelo ledger (CHECK da migration 1794000000000). */
export const TIPOS_MOVIMENTACAO = [...TIPOS_MOVIMENTACAO_XP, 'MISSAO'] as const;
export type TipoMovimentacaoXp = (typeof TIPOS_MOVIMENTACAO)[number];

/**
 * Efeito de uma movimentação no XP quando não informado: resgates e estornos
 * (RECOMPENSA) só mexem em moedas; ganhos e ajustes mexem nos dois, na mesma
 * quantidade. O gatilho `acumular_xp` aplica a mesma regra no banco.
 */
export function efeitoXpPadrao(tipo: TipoMovimentacaoXp, quantidade: number) {
  return tipo === 'RECOMPENSA' ? 0 : quantidade;
}

/**
 * Limites de um PucStop, iguais na API e nas CHECKs da migration. Raio: abaixo
 * de 10 m o GPS do celular não distingue dentro de fora; acima de 200 m o
 * totem cobriria boa parte do campus. XP: teto contra erro de digitação.
 */
export const NOME_PUCSTOP_MAX = 120;
export const RAIO_PUCSTOP = { min: 10, max: 200 } as const;
export const XP_PUCSTOP = { min: 1, max: 1000 } as const;

const g = `"${SCHEMA_GAMIFICACAO}"`;

/** Schema de `usuarios` (DB_SCHEMA; padrão `feed`), já entre aspas. */
export function schemaUsuarios(dataSource: DataSource): string {
  const options = dataSource.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const ID_USUARIO = /^[1-9][0-9]{0,9}$/;

/**
 * `usuarios.id` do JWT, ou `null` sem linha correspondente. O `sub` é a
 * chave; o e-mail do token precisa ser o mesmo da linha. A conferência barra
 * o coordenador mockado, que assina com um id da base demo (`sub` "3") que
 * pode coincidir com outro aluno do banco.
 */
export async function usuarioDoTokenOuNulo(
  dataSource: DataSource,
  token: AccessTokenPayload,
): Promise<number | null> {
  const sub = String(token?.sub ?? '');
  const id = ID_USUARIO.test(sub) ? Number(sub) : NaN;
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) return null;
  const [linha] = (await dataSource.query(
    `SELECT "id", "email" FROM ${schemaUsuarios(dataSource)}."usuarios" WHERE "id" = $1`,
    [id],
  )) as Array<{ id: number; email: string }>;
  return linha &&
    linha.email.toLowerCase() === String(token.email ?? '').toLowerCase()
    ? linha.id
    : null;
}

/** Como [usuarioDoTokenOuNulo], mas exige aluno cadastrado (403). */
export async function usuarioDoToken(
  dataSource: DataSource,
  token: AccessTokenPayload,
): Promise<number> {
  const id = await usuarioDoTokenOuNulo(dataSource, token);
  if (id === null) {
    throw new ForbiddenException(
      'XP disponível apenas para alunos cadastrados.',
    );
  }
  return id;
}

export interface NovaMovimentacaoXp {
  usuarioId: number;
  /** Moedas: positivo credita, negativo debita (resgate). Nunca zero. */
  quantidade: number;
  /**
   * Efeito no XP acumulado; padrão pela regra do tipo ([efeitoXpPadrao]).
   * Resgate e estorno: 0 (só moedas).
   */
  xp?: number;
  /** Ciclo (semestre) do ganho; entra nos tetos por ciclo. */
  ciclo?: string | null;
  tipo: TipoMovimentacaoXp;
  referenciaTipo: string | null;
  referenciaId: string | null;
  descricao: string;
  /** Mesma chave = mesmo evento: o UNIQUE do ledger impede crédito duplo. */
  chaveIdempotencia: string;
}

export interface MovimentacaoRegistrada {
  movimentacaoId: string;
  /** Saldo de moedas depois da movimentação. */
  saldo: number;
  /** XP acumulado depois da movimentação. */
  xpAcumulado: number;
  criadoEm: Date;
}

/** Ajuste administrativo fora do limite individual (±200). */
export class AjusteForaDoLimiteError extends Error {}

export class SaldoInsuficienteError extends Error {}

/**
 * Cria (se preciso) e trava a carteira do usuário até o fim da transação;
 * devolve o saldo. Toda operação de XP do usuário passa por esta linha, então
 * duas requisições simultâneas do mesmo usuário são serializadas aqui: a
 * segunda só lê o estado depois do commit da primeira.
 */
export async function travarCarteira(
  qr: QueryRunner,
  usuarioId: number,
): Promise<number> {
  if (!qr.isTransactionActive) {
    throw new Error('Operação de XP exige transação aberta.');
  }
  await qr.query(
    `INSERT INTO ${g}."xp_carteiras" ("usuario_id") VALUES ($1) ON CONFLICT ("usuario_id") DO NOTHING`,
    [usuarioId],
  );
  const [carteira] = (await qr.query(
    `SELECT "saldo" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1 FOR UPDATE`,
    [usuarioId],
  )) as Array<{ saldo: number }>;
  return carteira.saldo;
}

/**
 * Registra uma movimentação e atualiza o saldo materializado na transação
 * do chamador (que precisa já ter aberto uma).
 *
 * A linha da carteira é travada (`FOR UPDATE`) antes de ler o saldo: duas
 * movimentações do mesmo usuário nunca leem o mesmo saldo. O ledger é a
 * fonte de verdade; `saldo` é sempre `sum(quantidade)` (conferido nos testes).
 */
export async function registrarMovimentacao(
  qr: QueryRunner,
  m: NovaMovimentacaoXp,
): Promise<MovimentacaoRegistrada> {
  if (!Number.isSafeInteger(m.quantidade) || m.quantidade === 0) {
    throw new Error('Quantidade de XP inválida.');
  }
  const xp = m.xp ?? efeitoXpPadrao(m.tipo, m.quantidade);
  if (!Number.isSafeInteger(xp)) throw new Error('XP inválido.');
  if (m.tipo === 'RECOMPENSA' && xp !== 0) {
    throw new Error('Resgate e estorno não mexem no XP.');
  }
  if (
    m.tipo === 'AJUSTE_ADMIN' &&
    (Math.abs(m.quantidade) > LIMITES.ajusteAdmin ||
      Math.abs(xp) > LIMITES.ajusteAdmin)
  ) {
    throw new AjusteForaDoLimiteError(
      `Ajuste administrativo limitado a ${LIMITES.ajusteAdmin} pontos.`,
    );
  }
  const saldo = (await travarCarteira(qr, m.usuarioId)) + m.quantidade;
  if (saldo < 0) throw new SaldoInsuficienteError('Moedas insuficientes.');
  const [mov] = (await qr.query(
    `INSERT INTO ${g}."xp_movimentacoes" ` +
      `("usuario_id", "quantidade", "xp_quantidade", "ciclo", "tipo", "referencia_tipo", "referencia_id", "descricao", "chave_idempotencia", "saldo_apos") ` +
      `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING "id", "criado_em"`,
    [
      m.usuarioId,
      m.quantidade,
      xp,
      m.ciclo ?? null,
      m.tipo,
      m.referenciaTipo,
      m.referenciaId,
      m.descricao,
      m.chaveIdempotencia,
      saldo,
    ],
  )) as Array<{ id: string; criado_em: Date }>;
  // O XP acumulado é mantido pelo gatilho `acumular_xp` (vale também para
  // versões antigas do backend); o CHECK impede que fique negativo.
  const [carteira] = (await qr.query(
    `UPDATE ${g}."xp_carteiras" SET "saldo" = $2, "atualizado_em" = now() WHERE "usuario_id" = $1 RETURNING "xp_acumulado"`,
    [m.usuarioId, saldo],
  )) as
    [Array<{ xp_acumulado: number }>, number] | Array<{ xp_acumulado: number }>;
  const linha = Array.isArray(carteira) ? carteira[0] : carteira;
  return {
    movimentacaoId: String(mov.id),
    saldo,
    xpAcumulado: (linha as { xp_acumulado: number }).xp_acumulado,
    criadoEm: mov.criado_em,
  };
}

/** Violação de UNIQUE do PostgreSQL (corrida entre duas transações). */
export function ehViolacaoUnica(erro: unknown, constraint?: string): boolean {
  const e = (erro as { driverError?: unknown })?.driverError ?? erro;
  const { code, constraint: nome } = (e ?? {}) as {
    code?: string;
    constraint?: string;
  };
  return code === '23505' && (!constraint || nome === constraint);
}
