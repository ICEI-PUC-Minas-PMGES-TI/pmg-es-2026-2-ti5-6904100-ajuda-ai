/**
 * Ajustes manuais de XP pela coordenação (F26): limites compartilhados pela
 * API, pela migration (CHECKs) e pelos testes. O teto por ajuste (±200) é
 * `LIMITES.ajusteAdmin`, em `../economia.ts`.
 */

/** Justificativa obrigatória do ajuste. */
export const MOTIVO_AJUSTE_XP = { min: 3, max: 300 } as const;

/** Chave do ledger para um ajuste: repetir a mesma chave não lança de novo. */
export const chaveAjusteXp = (chave: string) => `ajuste:${chave}`;
