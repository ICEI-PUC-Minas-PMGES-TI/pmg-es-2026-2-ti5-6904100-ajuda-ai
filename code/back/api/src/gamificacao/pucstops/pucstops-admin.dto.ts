import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NOME_PUCSTOP_MAX, RAIO_PUCSTOP, XP_PUCSTOP } from '../gamificacao.js';
import type { RegiaoCampusDto } from '../../mapa/campus-limite.js';

const NUMERO = { allowNaN: false, allowInfinity: false } as const;
/** Pelo menos um caractere visível (nome só de espaços é recusado). */
const NAO_VAZIO = /\S/;

/**
 * Corpo de `POST /coordenacao/pucstops`. A posição vem do clique no mapa da
 * coordenação; o servidor confere se cai dentro do campus (não confia no
 * front). Id, autor e datas nunca vêm do cliente.
 */
export class CriarPucStopDto {
  @IsDefined()
  @IsString()
  @MaxLength(NOME_PUCSTOP_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome!: string;

  @IsDefined()
  @IsNumber(NUMERO)
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsDefined()
  @IsNumber(NUMERO)
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsDefined()
  @IsInt()
  @Min(XP_PUCSTOP.min)
  @Max(XP_PUCSTOP.max)
  xp!: number;

  @IsDefined()
  @IsNumber(NUMERO)
  @Min(RAIO_PUCSTOP.min)
  @Max(RAIO_PUCSTOP.max)
  raioMetros!: number;

  /** Padrão: ativo (aparece no mapa dos alunos assim que salvo). */
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * Corpo de `PATCH /coordenacao/pucstops/:id`: qualquer subconjunto; latitude
 * e longitude andam juntas. Ativar/desativar tem ação própria.
 */
export class AtualizarPucStopDto {
  @IsOptional()
  @IsString()
  @MaxLength(NOME_PUCSTOP_MAX)
  @Matches(NAO_VAZIO, { message: 'nome não pode ser vazio' })
  nome?: string;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(XP_PUCSTOP.min)
  @Max(XP_PUCSTOP.max)
  xp?: number;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(RAIO_PUCSTOP.min)
  @Max(RAIO_PUCSTOP.max)
  raioMetros?: number;
}

/** Item de `GET /coordenacao/pucstops` (ativos e inativos). */
export interface PucStopAdminDto {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raioMetros: number;
  xp: number;
  ativo: boolean;
  /** `usuarios.id` de quem criou; nulo quando não está em `usuarios`. */
  criadoPor: number | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Coletas já feitas (histórico preservado em qualquer edição). */
  coletas: number;
}

/** `GET /coordenacao/pucstops/campus`: onde o servidor aceita um PucStop. */
export type CampusPucStopsDto = RegiaoCampusDto;
