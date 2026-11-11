import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DESCRICAO_MAX, TITULO_EVENTO } from '../campus.js';
import { LocalEntradaDto, type LocalDto } from '../local.js';

/**
 * Data/hora ISO 8601 **com fuso** (`Z` ou `-03:00`). Sem fuso o significado
 * dependeria do relógio do servidor.
 */
export const DATA_HORA_COM_FUSO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const COM_FUSO = {
  message: 'use data/hora ISO 8601 com fuso, ex. 2026-10-20T19:00:00-03:00',
};
const NAO_VAZIO = /\S/;

/** `POST /coordenacao/eventos`. Local opcional (evento sem lugar fixo). */
export class CriarEventoDto {
  @IsDefined()
  @IsString()
  @MaxLength(TITULO_EVENTO.max)
  @Matches(NAO_VAZIO, { message: 'titulo não pode ser vazio' })
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRICAO_MAX)
  descricao?: string;

  @IsDefined()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  inicio!: string;

  @IsDefined()
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  fim!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalEntradaDto)
  local?: LocalEntradaDto;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** `PATCH /coordenacao/eventos/:id`: subconjunto; `local: null` remove o local. */
export class AtualizarEventoDto {
  @ValidateIf((o: AtualizarEventoDto) => o.titulo !== undefined)
  @IsString()
  @MaxLength(TITULO_EVENTO.max)
  @Matches(NAO_VAZIO, { message: 'titulo não pode ser vazio' })
  titulo?: string;

  @ValidateIf((o: AtualizarEventoDto) => o.descricao !== undefined)
  @IsString()
  @MaxLength(DESCRICAO_MAX)
  descricao?: string;

  @ValidateIf((o: AtualizarEventoDto) => o.inicio !== undefined)
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  inicio?: string;

  @ValidateIf((o: AtualizarEventoDto) => o.fim !== undefined)
  @IsString()
  @Matches(DATA_HORA_COM_FUSO, COM_FUSO)
  @IsISO8601({ strict: true })
  fim?: string;

  @ValidateIf((o: AtualizarEventoDto) => o.local !== null)
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalEntradaDto)
  local?: LocalEntradaDto | null;
}

export type SituacaoEvento = 'em-breve' | 'acontecendo' | 'encerrado';

/** `GET /mapa/eventos` e `GET /mapa/eventos/:id` (públicos). */
export interface EventoDto {
  id: string;
  titulo: string;
  descricao: string;
  inicio: string;
  fim: string;
  situacao: SituacaoEvento;
  local: LocalDto | null;
}

/** Visão da coordenação (inclui inativos e encerrados). */
export interface EventoAdminDto extends EventoDto {
  ativo: boolean;
  criadoPor: number | null;
  criadoEm: string;
  atualizadoEm: string;
}
