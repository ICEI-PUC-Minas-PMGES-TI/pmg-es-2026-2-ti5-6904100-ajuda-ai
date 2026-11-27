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
  programa: string;
  revisao: string;
  /** Participante do ciclo atual ou coordenação; os apps escondem o feed se false. */
  podeLer: boolean;
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
  /** A coordenação curtiu este comentário (selo, DP-01). */
  curtidoPelaCoordenacao: boolean;
}
export class CurtidaDto {
  @IsIn([1, -1]) delta: number;
}
/** Quem curtiu, do mais recente para o mais antigo. */
export interface CurtidorDto {
  autor: AutorComentarioDto;
  curtidoEm: Date;
  /** Curtida da coordenação (selo). */
  coordenacao: boolean;
}
