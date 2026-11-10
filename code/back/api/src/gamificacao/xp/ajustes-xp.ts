/**
 * Ajustes manuais de XP pela coordenação (F26): limites compartilhados pela
 * API, pela migration (CHECKs) e pelos testes.
 */

/** Justificativa obrigatória do ajuste. */
export const MOTIVO_AJUSTE_XP = { min: 3, max: 300 } as const;

/** Teto por ajuste contra erro de digitação (para mais ou para menos). */
export const QUANTIDADE_AJUSTE_XP_MAX = 100_000;

/** Chave do ledger para um ajuste: repetir a mesma chave não lança de novo. */
export const chaveAjusteXp = (chave: string) => `ajuste:${chave}`;
