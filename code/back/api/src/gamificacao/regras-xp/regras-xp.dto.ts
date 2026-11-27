import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ELEGIBILIDADES_XP, type ElegibilidadeXp } from './regras-xp.entity.js';

export class AtualizarRegraXpDto {
  @IsInt()
  @Min(1)
  valorXp!: number;

  @IsIn(ELEGIBILIDADES_XP)
  elegibilidade!: ElegibilidadeXp;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  limiteRepeticoes?: number | null;

  @ValidateIf((_, valor) => valor !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Matches(/\S/, { each: true })
  combinavelCom?: string[];
}

export class CriarRegraXpDto extends AtualizarRegraXpDto {
  @IsString()
  @MaxLength(40)
  @Matches(/\S/)
  acao!: string;
}

export class StatusRegraXpDto {
  @IsBoolean()
  ativo!: boolean;
}
