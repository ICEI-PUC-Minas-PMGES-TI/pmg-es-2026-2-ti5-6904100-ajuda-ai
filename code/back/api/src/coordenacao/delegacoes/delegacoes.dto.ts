import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  FUNCIONALIDADES_DELEGAVEIS,
  type FuncionalidadeDelegavel,
} from './delegacoes.js';

export class ListarAlunosQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;
}

export class ConcederDelegacaoDto {
  @IsIn(FUNCIONALIDADES_DELEGAVEIS)
  funcionalidade!: FuncionalidadeDelegavel;
}
