import { IsDefined, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { NivelDto } from '../economia.js';

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
  /** XP efetivamente creditado (0 quando o teto do ciclo já estava cheio). */
  xpGanho: number;
  /** Moedas efetivamente creditadas (1:1 com o XP). */
  moedasGanhas: number;
  /** Recompensa configurada no totem na hora da coleta. */
  xpConfigurado: number;
  /** O teto do ciclo cortou (total ou parcialmente) a recompensa. */
  limiteAtingido: boolean;
  /** Compatibilidade: saldo de moedas depois da coleta (era o "XP total"). */
  xpTotal: number;
  /** Saldo de moedas depois da coleta. */
  moedas: number;
  xpAcumulado: number;
  nivel: NivelDto;
  subiuDeNivel: boolean;
  /** Ciclo (semestre) em que a coleta vale. */
  ciclo: string;
  claimedAt: string;
  distanciaMetros: number;
}

/** Item de `GET /me/pucstops`: o que o usuário coletou NESTE ciclo. */
export interface MinhaColetaDto {
  pucstopId: string;
  /** XP efetivamente creditado (0 se o teto já estava cheio). */
  xp: number;
  ciclo: string;
  claimedAt: string;
}

/** `motivo` das respostas de regra de negócio (409/422), estável para o app. */
export type MotivoRecusaColeta =
  'ja-coletado' | 'inativo' | 'fora-do-alcance' | 'precisao-insuficiente';
