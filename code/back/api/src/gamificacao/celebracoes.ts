import { Logger } from '@nestjs/common';
import { NIVEIS, nivelDe } from './economia.js';
import { SCHEMA_GAMIFICACAO } from './gamificacao.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const logger = new Logger('CelebracoesNivel');

type Executor = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Conquista de nível ainda não celebrada (`GET /me/xp` → `celebracao`).
 * Uma subida de vários níveis de uma vez vira UMA celebração, do nível final.
 */
export interface CelebracaoNivelDto {
  /** Último nível já celebrado. */
  de: number;
  /** Nível conquistado (o atual). */
  para: number;
  nome: string;
  /** Quantos níveis foram conquistados desde a última celebração (≥ 1). */
  niveisAvancados: number;
}

/** Tabela ainda não criada (migration CelebracoesNivel pendente). */
function tabelaAusente(erro: unknown): boolean {
  const e = (erro as { driverError?: unknown })?.driverError ?? erro;
  return (e as { code?: string })?.code === '42P01';
}

/** Coluna ainda não criada (migration ReivindicacaoCelebracoesNivel pendente). */
function colunaAusente(erro: unknown): boolean {
  const e = (erro as { driverError?: unknown })?.driverError ?? erro;
  return (e as { code?: string })?.code === '42703';
}

/**
 * Último nível celebrado; sem linha = 1. `null` se a tabela não existe
 * (backend novo em banco antigo): sem celebração, nada quebra.
 */
export async function nivelCelebrado(
  executor: Executor,
  usuarioId: number,
): Promise<number | null> {
  try {
    const [linha] = (await executor.query(
      `SELECT "nivel_celebrado" FROM ${g}."celebracoes_nivel" WHERE "usuario_id" = $1`,
      [usuarioId],
    )) as Array<{ nivel_celebrado: number }>;
    return linha?.nivel_celebrado ?? 1;
  } catch (erro) {
    if (!tabelaAusente(erro)) throw erro;
    logger.warn(
      'Tabela gamificacao.celebracoes_nivel ausente: rode a migration CelebracoesNivel.',
    );
    return null;
  }
}

/** Celebração pendente para o nível atual, ou `null`. Função pura. */
export function celebracaoPara(
  nivelAtual: number,
  celebrado: number | null,
): CelebracaoNivelDto | null {
  if (celebrado === null || nivelAtual <= celebrado) return null;
  const nivel = NIVEIS.find((n) => n.numero === nivelAtual);
  if (!nivel) return null;
  return {
    de: celebrado,
    para: nivelAtual,
    nome: nivel.nome,
    niveisAvancados: nivelAtual - celebrado,
  };
}

export class CelebracaoIndisponivelError extends Error {}

/** Quanto tempo a vez de exibir fica reservada a um aparelho (segundos). */
export const RESERVA_CELEBRACAO_SEGUNDOS = 120;

/**
 * Reivindica, de forma atômica, a vez de exibir a celebração. Um único
 * `INSERT … ON CONFLICT DO UPDATE … WHERE` decide: só ganha quem encontra a
 * conquista ainda não confirmada E sem reserva vigente de OUTRO aparelho. O
 * mesmo aparelho pode renovar a própria reserva. A reserva expira em
 * {@link RESERVA_CELEBRACAO_SEGUNDOS}, então um app fechado antes de exibir
 * não perde a conquista (ela volta a ser reivindicável); a confirmação a
 * encerra de vez. Nunca toca em XP nem moedas e nunca autoriza acima do nível real.
 */
export async function reivindicarCelebracao(
  executor: Executor,
  usuarioId: number,
  nivelPedido: number,
  dispositivo: string,
): Promise<{ autorizado: boolean }> {
  const [carteira] = (await executor.query(
    `SELECT "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
    [usuarioId],
  )) as Array<{ xp_acumulado: number }>;
  const real = nivelDe(carteira?.xp_acumulado ?? 0).numero;
  const alvo = Math.floor(nivelPedido);
  // Sem conquista real a celebrar (nível pedido além do real ou o 1): nada a reivindicar.
  if (alvo < 2 || alvo > real) return { autorizado: false };
  const t = `${g}."celebracoes_nivel"`;
  try {
    const linhas = (await executor.query(
      `INSERT INTO ${t} ("usuario_id", "nivel_celebrado", "reivindicado_por", "reivindicado_ate") ` +
        `VALUES ($1, 1, $2, now() + make_interval(secs => $4)) ` +
        `ON CONFLICT ("usuario_id") DO UPDATE SET ` +
        `"reivindicado_por" = EXCLUDED."reivindicado_por", ` +
        `"reivindicado_ate" = EXCLUDED."reivindicado_ate" ` +
        `WHERE ${t}."nivel_celebrado" < $3 ` +
        `AND (${t}."reivindicado_ate" IS NULL OR ${t}."reivindicado_ate" <= now() ` +
        `OR ${t}."reivindicado_por" = EXCLUDED."reivindicado_por") ` +
        `RETURNING "usuario_id"`,
      [usuarioId, dispositivo, alvo, RESERVA_CELEBRACAO_SEGUNDOS],
    )) as Array<{ usuario_id: number }>;
    return { autorizado: linhas.length > 0 };
  } catch (erro) {
    if (!tabelaAusente(erro) && !colunaAusente(erro)) throw erro;
    throw new CelebracaoIndisponivelError(
      'Celebração de nível indisponível (migration pendente).',
    );
  }
}

/**
 * Confirma que a conquista foi exibida. Idempotente e monotônico: grava
 * `GREATEST(atual, min(pedido, nível real))`. Pedir um nível acima do real
 * não adianta nada; pedir de novo não muda nada. Não toca em XP nem moedas.
 */
export async function confirmarCelebracao(
  executor: Executor,
  usuarioId: number,
  nivelPedido: number,
): Promise<{ nivelCelebrado: number }> {
  const [carteira] = (await executor.query(
    `SELECT "xp_acumulado" FROM ${g}."xp_carteiras" WHERE "usuario_id" = $1`,
    [usuarioId],
  )) as Array<{ xp_acumulado: number }>;
  const real = nivelDe(carteira?.xp_acumulado ?? 0).numero;
  const alvo = Math.max(1, Math.min(Math.floor(nivelPedido), real));
  try {
    const [linha] = (await executor.query(
      `INSERT INTO ${g}."celebracoes_nivel" ("usuario_id", "nivel_celebrado") VALUES ($1, $2) ` +
        `ON CONFLICT ("usuario_id") DO UPDATE SET ` +
        `"nivel_celebrado" = GREATEST(${g}."celebracoes_nivel"."nivel_celebrado", EXCLUDED."nivel_celebrado"), ` +
        `"atualizado_em" = CASE WHEN EXCLUDED."nivel_celebrado" > ${g}."celebracoes_nivel"."nivel_celebrado" ` +
        `THEN now() ELSE ${g}."celebracoes_nivel"."atualizado_em" END ` +
        `RETURNING "nivel_celebrado"`,
      [usuarioId, alvo],
    )) as Array<{ nivel_celebrado: number }>;
    return { nivelCelebrado: linha.nivel_celebrado };
  } catch (erro) {
    if (!tabelaAusente(erro)) throw erro;
    throw new CelebracaoIndisponivelError(
      'Celebração de nível indisponível (migration pendente).',
    );
  }
}
