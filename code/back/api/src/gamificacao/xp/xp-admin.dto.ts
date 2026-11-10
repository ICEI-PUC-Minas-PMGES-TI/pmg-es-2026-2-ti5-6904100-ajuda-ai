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
import { MOTIVO_AJUSTE_XP, QUANTIDADE_AJUSTE_XP_MAX } from './ajustes-xp.js';
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
 * debita (nunca deixa o saldo negativo). A tela gera a chave uma vez por
 * ajuste: repetir o envio com a mesma chave devolve o ajuste já feito.
 */
export class AjustarXpDto {
  @IsDefined()
  @IsInt()
  @NotEquals(0, { message: 'quantidade não pode ser zero' })
  @Min(-QUANTIDADE_AJUSTE_XP_MAX)
  @Max(QUANTIDADE_AJUSTE_XP_MAX)
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

export interface ParticipanteXpDto extends XpResumoDto {
  usuario: { id: number; nome: string; email: string };
}

export interface AjusteXpDto {
  id: string;
  quantidade: number;
  motivo: string;
  responsavel: { id: number | null; email: string | null };
  saldoApos: number;
  criadoEm: string;
}

export interface ExtratoXpAdminDto extends ParticipanteXpDto {
  movimentacoes: MovimentacaoXpDto[];
  ajustes: AjusteXpDto[];
}
