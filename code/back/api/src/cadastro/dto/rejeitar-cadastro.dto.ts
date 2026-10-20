import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejeitarCadastroDto {
  /** Motivo exibido ao aluno. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
