import type { Polygon } from 'typeorm';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { EntradaMapa } from '../entities/predio.entity.js';

/**
 * Contratos públicos de leitura do mapa. O cliente nunca recebe entidade
 * TypeORM, UUID interno de versão, hash nem metadados de importação.
 * Coordenadas em WGS84 (SRID 4326). `id` de prédio é a chave estável do
 * campus (a mesma do footprint 2D e dos GLBs, ex.: `P01_R4751608`).
 */

export interface VersaoMapaDto {
  codigo: string;
  status: 'ativa';
  /** Versão dos GLBs no Azure `map-assets` coerente com estes dados. */
  versaoAssets: string | null;
  origem: {
    projeto: string;
    versao: number | null;
    atualizadaEm: string | null;
  };
  ativadaEm: string;
  contagens: { predios: number; areas: number; salas: number };
}

/** Item da listagem: só o necessário para lista/mapa, sem polígono. */
export interface PredioResumoDto {
  id: string;
  nome: string | null;
  codigo: string | null;
  /** Tipo de origem (ACADEMIC, GATE, ...); nulo quando a origem não tem. */
  categoria: string | null;
  altura: number | null;
  /** Centro do bbox do polígono (igual ao `center` do app) ou o ponto do prédio. */
  latitude: number;
  longitude: number;
}

export interface PredioDto extends PredioResumoDto {
  osmId: string | null;
  alturaBase: number | null;
  entradas: EntradaMapa[];
  /** GeoJSON; nulo para portões (só ponto na origem). */
  geometria: Polygon | null;
}

export interface AreaDto {
  id: string;
  nome: string;
  categoria: string;
  latitude: number;
  longitude: number;
  geometria: Polygon | null;
}

export interface SalaDto {
  id: string;
  predioId: string;
  nome: string;
  andar: number;
  categoria: string;
  latitude: number;
  longitude: number;
}

export type TipoLugar = 'predio' | 'area' | 'sala';

export interface ResultadoBuscaDto {
  id: string;
  tipo: TipoLugar;
  nome: string | null;
  codigo: string | null;
  categoria: string | null;
  latitude: number;
  longitude: number;
}

export const LIMITE_BUSCA_PADRAO = 8;
export const LIMITE_BUSCA_MAXIMO = 20;
export const TAMANHO_MAXIMO_BUSCA = 100;

export class BuscaMapaQuery {
  @IsOptional()
  @IsString()
  @MaxLength(TAMANHO_MAXIMO_BUSCA, {
    message: `A busca aceita até ${TAMANHO_MAXIMO_BUSCA} caracteres.`,
  })
  q?: string;

  /** 1..20 (padrão 8). Validado de novo no service após a conversão. */
  @IsOptional()
  @Matches(/^\d{1,2}$/, {
    message: `limit deve ser um inteiro entre 1 e ${LIMITE_BUSCA_MAXIMO}.`,
  })
  limit?: string;
}
