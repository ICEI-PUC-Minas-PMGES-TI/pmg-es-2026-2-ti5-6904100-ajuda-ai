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
