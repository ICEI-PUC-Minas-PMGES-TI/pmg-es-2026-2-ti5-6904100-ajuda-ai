import { IsUUID } from 'class-validator';

export class ResgatarDto {
  /** O app reutiliza a mesma chave quando repete a mesma tentativa. */
  @IsUUID('4') chaveIdempotencia!: string;
}
