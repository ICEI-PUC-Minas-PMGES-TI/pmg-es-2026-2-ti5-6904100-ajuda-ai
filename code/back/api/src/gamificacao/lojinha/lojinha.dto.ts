import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const texto = /\S/;

export class CriarRecompensaDto {
  @IsString() @MaxLength(120) @Matches(texto) nome!: string;
  @IsString() @MaxLength(2000) @Matches(texto) descricao!: string;
  @IsInt() @Min(1) @Max(2_147_483_647) custoXp!: number;
  /** Ausente ou null significa estoque ilimitado. */
  @IsOptional() @IsInt() @Min(0) estoque?: number | null;
  @IsString() @MaxLength(2000) @Matches(texto) condicoesRetirada!: string;
}

export class PublicarRecompensaDto {
  @IsBoolean() publicada!: boolean;
}

export class ResgatarDto {
  /** O app reutiliza a mesma chave quando repete a mesma tentativa. */
  @IsUUID('4') chaveIdempotencia!: string;
}
