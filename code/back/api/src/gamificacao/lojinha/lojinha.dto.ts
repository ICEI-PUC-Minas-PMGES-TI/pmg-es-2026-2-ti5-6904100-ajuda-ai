import { IsInt, IsUUID, Min } from 'class-validator';

export class ResgatarDto {
  /** O app reutiliza a mesma chave quando repete a mesma tentativa. */
  @IsUUID('4') chaveIdempotencia!: string;
  /** Versão da recompensa que o aluno viu na tela de revisão. */
  @IsInt() @Min(1) versao!: number;
  /** Custo que o aluno confirmou; o débito só acontece se ainda for este. */
  @IsInt() @Min(0) custoXp!: number;
}
