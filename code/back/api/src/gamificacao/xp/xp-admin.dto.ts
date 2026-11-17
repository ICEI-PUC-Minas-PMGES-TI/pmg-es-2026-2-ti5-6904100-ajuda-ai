import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';
import { type NivelDto, LIMITES } from '../economia.js';
import { MOTIVO_AJUSTE_XP } from './ajustes-xp.js';
import type { MovimentacaoXpDto, XpResumoDto } from './xp.dto.js';
import { LIMITE_MOVIMENTACOES_MAXIMO } from './xp.dto.js';

const NAO_VAZIO = /\S/;

/** `GET /coordenacao/xp`: busca por nome ou e-mail. */
export class ListarXpQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}

/** `GET /coordenacao/xp/:usuarioId`: paginação do extrato, como em `/me/xp`. */
export class ExtratoXpQuery {
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

/**
 * `POST /coordenacao/xp/:usuarioId/ajustes`. Positivo credita, negativo
 * debita XP e moedas na mesma quantidade (±200, `LIMITES.ajusteAdmin`),
 * sem deixar nenhum dos dois negativo. A tela gera a chave uma vez por
 * ajuste: repetir o envio com a mesma chave devolve o ajuste já feito.
 */
export class AjustarXpDto {
  @IsDefined()
  @IsInt()
  @NotEquals(0, { message: 'quantidade não pode ser zero' })
  @Min(-LIMITES.ajusteAdmin)
  @Max(LIMITES.ajusteAdmin)
  quantidade!: number;

  @IsDefined()
  @IsString()
  @MinLength(MOTIVO_AJUSTE_XP.min)
  @MaxLength(MOTIVO_AJUSTE_XP.max)
  @Matches(NAO_VAZIO, { message: 'motivo não pode ser vazio' })
  motivo!: string;

  @IsDefined()
  @IsUUID('4')
  chaveIdempotencia!: string;
}

/** Linha de `GET /coordenacao/xp`. */
export interface ParticipanteXpDto {
  usuario: { id: number; nome: string; email: string };
  /** Moedas para a lojinha (`saldo` em `/me/xp`). */
  moedas: number;
  /** XP da trajetória: não cai com resgates; define o nível. */
  xpAcumulado: number;
  nivel: NivelDto;
  atualizadoEm: string | null;
}

export interface AjusteXpDto {
  id: string;
  quantidade: number;
  motivo: string;
  responsavel: { id: number | null; email: string | null };
  saldoApos: number;
  criadoEm: string;
}

/** `GET /coordenacao/xp/:usuarioId`: o mesmo resumo de `/me/xp`, mais extrato e ajustes. */
export interface ExtratoXpAdminDto extends XpResumoDto {
  usuario: { id: number; nome: string; email: string };
  movimentacoes: MovimentacaoXpDto[];
  ajustes: AjusteXpDto[];
}
