import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { LIMITE_NOTIFICACOES } from './notificacoes.js';

export class ListarNotificacoesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_NOTIFICACOES.max)
  limite?: number;

  /** Id da última notificação já carregada: devolve as mais antigas que ela. */
  @IsOptional()
  @IsUUID()
  antes?: string;
}

/**
 * `PATCH /me/notificacoes/lidas`. `ateId` é a notificação mais recente que a
 * tela mostrava: só ela e as anteriores são marcadas, então um aviso criado
 * depois da última leitura continua não lido. Sem `ateId`, marca todas.
 */
export class MarcarTodasDto {
  @IsOptional()
  @IsUUID()
  ateId?: string;
}
