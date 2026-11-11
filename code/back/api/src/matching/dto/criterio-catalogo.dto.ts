import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AlternativaCriterioDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  id?: string;

  @IsString()
  @MaxLength(80)
  rotulo!: string;
}

export class SalvarCriterioCatalogoDto {
  @IsString()
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descricao?: string;

  @IsString()
  @MaxLength(200)
  enunciadoPadrao!: string;

  @IsIn(['sim_nao', 'escolha_unica', 'multipla_escolha'])
  tipo!: 'sim_nao' | 'escolha_unica' | 'multipla_escolha';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AlternativaCriterioDto)
  alternativas?: AlternativaCriterioDto[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class AtualizarCriterioCatalogoDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descricao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  enunciadoPadrao?: string;

  @IsOptional()
  @IsIn(['sim_nao', 'escolha_unica', 'multipla_escolha'])
  tipo?: 'sim_nao' | 'escolha_unica' | 'multipla_escolha';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AlternativaCriterioDto)
  alternativas?: AlternativaCriterioDto[];

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Item da configuração de matching do programa (catálogo estruturado). */
export class CriterioMatchingProgramaDto {
  @IsInt()
  @Min(1)
  criterioPadrinhoId!: number;

  @IsInt()
  @Min(1)
  criterioApadrinhadoId!: number;

  @IsIn(['igualdade', 'intersecao', 'diferenca'])
  operacao!: 'igualdade' | 'intersecao' | 'diferenca';

  @IsInt()
  @Min(1)
  peso!: number;
}
