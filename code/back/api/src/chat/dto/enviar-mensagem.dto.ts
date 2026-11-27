import { IsString, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class EnviarMensagemDto {
  @IsString()
  @MaxLength(4000)
  texto!: string;
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
