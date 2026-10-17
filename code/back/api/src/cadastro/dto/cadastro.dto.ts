import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { RespostasCadastro } from '../../participacoes/entities/participacao.entity.js';
import {
  TIPOS_PARTICIPACAO,
  type TipoParticipacao,
} from '../../usuarios/entities/usuario.entity.js';
import { PERIODO_MAXIMO } from '../cadastro.service.js';

export class CadastroDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe seu nome completo.' })
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  programa?: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe seu curso.' })
  @MaxLength(120)
  curso!: string;

  @IsInt({ message: 'O período deve ser um número inteiro.' })
  @Min(1, { message: 'O período mínimo é 1.' })
  @Max(PERIODO_MAXIMO, { message: `O período máximo é ${PERIODO_MAXIMO}.` })
  periodo!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  turno?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  interesses?: string[];

  @IsIn(TIPOS_PARTICIPACAO, {
    message: 'tipoParticipacao deve ser "padrinho" ou "apadrinhado".',
  })
  tipoParticipacao!: TipoParticipacao;

  /** Respostas do formulário da modalidade; saneadas no serviço. */
  @IsOptional()
  @IsObject()
  respostas?: RespostasCadastro;
}
