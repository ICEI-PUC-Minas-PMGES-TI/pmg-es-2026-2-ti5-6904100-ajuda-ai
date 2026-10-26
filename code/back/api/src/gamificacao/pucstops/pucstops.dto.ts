import { IsDefined, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Corpo de `POST /mapa/pucstops/:id/claim`: só a leitura de GPS. XP, raio,
 * distância e usuário nunca vêm do cliente. A coordenada serve só para a
 * geofence: não é gravada nem registrada em log.
 */
export class ColetarPucStopDto {
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  /** Raio de incerteza do GPS (m), como o aparelho informa. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(10_000)
  accuracy?: number;
}

/** `GET /mapa/pucstops` e `GET /mapa/pucstops/:id` (públicos). */
export interface PucStopDto {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  /** Raio da geofence (m), validado no servidor. */
  raioMetros: number;
  xp: number;
}

/** 201 de `POST /mapa/pucstops/:id/claim`. */
export interface ColetaPucStopDto {
  pucstopId: string;
  xpGanho: number;
  xpTotal: number;
  claimedAt: string;
  distanciaMetros: number;
}

/** Item de `GET /me/pucstops`: o que o usuário já coletou. */
export interface MinhaColetaDto {
  pucstopId: string;
  xp: number;
  claimedAt: string;
}

/** `motivo` das respostas de regra de negócio (409/422), estável para o app. */
export type MotivoRecusaColeta =
  'ja-coletado' | 'inativo' | 'fora-do-alcance' | 'precisao-insuficiente';
