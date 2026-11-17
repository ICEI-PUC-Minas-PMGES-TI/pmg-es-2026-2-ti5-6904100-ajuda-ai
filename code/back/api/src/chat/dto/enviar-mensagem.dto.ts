import { IsString, MaxLength } from 'class-validator';

export class EnviarMensagemDto {
  @IsString()
  @MaxLength(4000)
  texto!: string;
}
