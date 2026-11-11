import { IsString, MaxLength } from 'class-validator';

export const DESCRICAO_LOCAL_MAX = 10_000;
export const IMAGENS_LOCAL_MAX = 10;

export class AtualizarInformacoesLocalDto {
  @IsString()
  @MaxLength(DESCRICAO_LOCAL_MAX)
  descricao!: string;
}

export interface ImagemLocalDto {
  id: string;
  url: string;
  originalUrl: string;
  tipoConteudo: string;
  tamanhoBytes: number;
  ordem: number;
}

export interface ConteudoLocalDto {
  localId: string;
  descricao: string;
  imagens: ImagemLocalDto[];
  atualizadoEm: string | null;
}
