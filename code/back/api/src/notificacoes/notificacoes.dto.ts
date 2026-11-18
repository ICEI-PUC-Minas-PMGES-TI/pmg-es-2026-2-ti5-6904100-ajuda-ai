import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { LIMITE_NOTIFICACOES } from './notificacoes.js';

export class ListarNotificacoesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_NOTIFICACOES.max)
  limite?: number;
}
