import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CONVIDADOS_MAX, DESCRICAO_ENCONTRO_MAX } from './encontros.js';

export class CriarEncontroDto {
  @IsUUID('4')
  pucstopId!: string;

  @IsISO8601({ strict: true })
  inicio!: string;

  @IsISO8601({ strict: true })
  fim!: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRICAO_ENCONTRO_MAX)
  descricao?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONVIDADOS_MAX)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  apadrinhadoIds!: number[];
}

export class EditarEncontroDto {
  @IsOptional()
  @IsUUID('4')
  pucstopId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  inicio?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  fim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DESCRICAO_ENCONTRO_MAX)
  descricao?: string | null;
}

export class ResponderConviteDto {
  @IsIn(['aceito', 'recusado'])
  resposta!: 'aceito' | 'recusado';
}

export class ListarEncontrosQuery {
  @IsOptional()
  @IsIn(['futuros', 'anteriores'])
  quando?: 'futuros' | 'anteriores';
}

export class ConfirmarPresencaDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10_000)
  accuracy?: number;
}
