import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import type { CelebracaoNivelDto } from '../celebracoes.js';
import type { NivelDto } from '../economia.js';
import type { TipoMovimentacaoXp } from '../gamificacao.js';

export const LIMITE_MOVIMENTACOES_PADRAO = 20;
export const LIMITE_MOVIMENTACOES_MAXIMO = 100;

/** `GET /me/xp`: progresso, moedas e tetos do ciclo (fonte única). */
export interface XpResumoDto {
  /**
   * Compatibilidade: saldo de MOEDAS (consumível na lojinha). Antes do BL-50
   * era "o XP"; clientes antigos continuam lendo este campo.
   */
  saldo: number;
  /** Saldo de moedas (igual a `saldo`). */
  moedas: number;
  /** Experiência acumulada: nunca cai com resgates; define o nível. */
  xpAcumulado: number;
  nivel: NivelDto;
  /** Ciclo (semestre) dos tetos abaixo. */
  ciclo: string;
  limites: {
    totens: { ganho: number; limite: number };
    ciclo: { ganho: number; limite: number };
  };
  /** Última movimentação; nulo para quem nunca ganhou XP. */
  atualizadoEm: string | null;
  /**
   * Conquista de nível ainda não celebrada (animação de "novo nível").
   * Some depois de `POST /me/xp/celebracoes`; nunca volta para o mesmo nível.
   */
  celebracao: CelebracaoNivelDto | null;
}

/** Corpo de `POST /me/xp/celebracoes`: o nível cuja animação foi exibida. */
export class ConfirmarCelebracaoDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(1000)
  nivel!: number;
}

/** Corpo de `POST /me/xp/celebracoes/reivindicar`. */
export class ReivindicarCelebracaoDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(1000)
  nivel!: number;

  /** Identifica o aparelho/aba que quer exibir a animação (gerado pelo cliente). */
  @IsString()
  @Length(8, 64)
  dispositivo!: string;
}

/** Item de `GET /gamificacao/niveis`. */
export interface NivelTabelaDto {
  numero: number;
  nome: string;
  xpMinimo: number;
}

/** Item de `GET /me/xp/movimentacoes` (mais recente primeiro). */
export interface MovimentacaoXpDto {
  id: string;
  /** Efeito nas moedas (positivo ganha, negativo gasta). */
  quantidade: number;
  /** Efeito no XP acumulado (0 em resgates e estornos). */
  xp: number;
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
