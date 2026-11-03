import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CriterioMatchingDto {
  @IsInt()
  @Min(1)
  criterioPadrinhoId!: number;

  @IsInt()
  @Min(1)
  criterioApadrinhadoId!: number;

  @IsIn(['intersecao', 'igualdade', 'diferenca'])
  operacao!: 'intersecao' | 'igualdade' | 'diferenca';

  @IsInt()
  @Min(1)
  @Max(100)
  peso!: number;
}

export class SalvarConfiguracaoMatchingDto {
  @IsString()
  @MaxLength(20)
  programa!: string;

  @IsBoolean()
  liberado!: boolean;

  @IsInt()
  @Min(1)
  @Max(20)
  capacidadePorPadrinho!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  capacidadePorApadrinhado!: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CriterioMatchingDto)
  criterios!: CriterioMatchingDto[];
}

export class ProgramaMatchingDto {
  @IsString()
  @MaxLength(20)
  programa!: string;
}

export class LiberarMatchingDto extends ProgramaMatchingDto {
  @IsBoolean()
  liberado!: boolean;
}

export class RecusarSugestaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}
