import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  Min,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class PublicacaoDto {
  @IsOptional() @IsString() @MaxLength(10000) texto?: string;
  @IsOptional() @IsString() @MaxLength(80) categoria?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  imagens?: string[];
}
export class ComentarioDto {
  @IsString() @MinLength(1) @MaxLength(2000) texto: string;
  @IsOptional() @IsInt() @Min(1) paiId?: number;
}
export interface AutorComentarioDto {
  id: string;
  nome: string;
  fotoUrl: string | null;
}
export interface FeedPermissoesDto {
  podePublicar: boolean;
  podeAdministrar: boolean;
  podeInteragir: boolean;
}
export interface ComentarioRespostaDto {
  id: number;
  texto: string;
  paiId: number | null;
  criadoEm: Date;
  autor: AutorComentarioDto;
  podeExcluir: boolean;
  curtidas: number;
  curtidoPorMim: boolean;
}
export class CurtidaDto {
  @IsIn([1, -1]) delta: number;
}
