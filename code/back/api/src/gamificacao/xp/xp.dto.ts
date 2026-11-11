import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { TipoMovimentacaoXp } from '../gamificacao.js';

export const LIMITE_MOVIMENTACOES_PADRAO = 20;
export const LIMITE_MOVIMENTACOES_MAXIMO = 100;

/** `GET /me/xp`. */
export interface XpResumoDto {
  /** Saldo atual (= soma das movimentações). */
  saldo: number;
  /** Última movimentação; nulo para quem nunca ganhou XP. */
  atualizadoEm: string | null;
}

/** Item de `GET /me/xp/movimentacoes` (mais recente primeiro). */
export interface MovimentacaoXpDto {
  id: string;
  quantidade: number;
  tipo: TipoMovimentacaoXp;
  referencia: { tipo: string; id: string } | null;
  descricao: string;
  saldoApos: number;
  criadoEm: string;
}

/** Paginação por cursor: `antes` = `id` da última movimentação já recebida. */
export class MovimentacoesXpQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_MOVIMENTACOES_MAXIMO)
  limite?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  antes?: number;
}
