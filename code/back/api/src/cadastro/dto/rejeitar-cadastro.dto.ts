import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RejeitarCadastroDto {
  /** Motivo exibido ao aluno (obrigatório). */
  @IsString()
  @IsNotEmpty({ message: 'Justificativa de rejeição obrigatória.' })
  @MinLength(3, { message: 'Justificativa de rejeição obrigatória.' })
  @MaxLength(1000)
  motivo!: string;
}
