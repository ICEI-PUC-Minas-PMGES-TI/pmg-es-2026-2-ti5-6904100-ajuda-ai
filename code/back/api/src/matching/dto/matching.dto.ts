import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import {
  CRITERIOS_CADASTRO,
  type CampoCadastroMatching,
} from '../criterios-cadastro.js';

export class CriterioMatchingDto {
  @IsOptional()
  @IsBoolean()
  obrigatorio?: boolean;
  @ValidateIf((c) => c.campoCadastro !== undefined)
  @IsIn(CRITERIOS_CADASTRO.map((c) => c.campo))
  campoCadastro?: CampoCadastroMatching;

  @ValidateIf(
    (c) => c.campoCadastro === undefined || c.criterioPadrinhoId !== undefined,
  )
  @IsInt()
  @Min(1)
  criterioPadrinhoId?: number;

  @ValidateIf(
    (c) =>
      c.campoCadastro === undefined || c.criterioApadrinhadoId !== undefined,
  )
  @IsInt()
  @Min(1)
  criterioApadrinhadoId?: number;

  @IsIn([
    'intersecao',
    'igualdade',
    'diferenca',
    'preferencia_genero',
    'vivencia_compartilhada',
  ])
  operacao!:
    | 'intersecao'
    | 'igualdade'
    | 'diferenca'
    | 'preferencia_genero'
    | 'vivencia_compartilhada';

  @IsInt()
  @Min(1)
  @Max(100)
  peso!: number;
}

export class SalvarConfiguracaoMatchingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  versaoBase?: number;
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

export class ExecutarMatchingDto extends ProgramaMatchingDto {
  @IsOptional()
  @IsUUID()
  operacaoId?: string;
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

export class ReconsiderarParDto {
  @IsString()
  @MaxLength(1000)
  justificativa!: string;
}

export class TransferirApadrinhadoDto {
  @IsInt()
  @Min(1)
  padrinhoDestinoId!: number;
  @IsString()
  @MaxLength(1000)
  motivo!: string;
  @IsUUID()
  operacaoId!: string;
}
