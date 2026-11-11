import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { exigirNoCampus, semMapaAtivo } from '../mapa/campus-limite.js';
import { SCHEMA_MAPA, SRID } from '../mapa/postgis.js';

const m = `"${SCHEMA_MAPA}"`;
const VERSAO_ATIVA = `(SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa')`;
const NUMERO = { allowNaN: false, allowInfinity: false } as const;

type Consulta = (sql: string, parametros?: unknown[]) => Promise<unknown>;

/**
 * Onde fica um evento/restaurante, na escrita: exatamente uma forma —
 * `predioId` (ex. `P16`), `areaId` (UUID) ou `latitude` + `longitude`
 * (clique no mapa da coordenação).
 */
export class LocalEntradaDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{1,64}$/, { message: 'predioId inválido.' })
  predioId?: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber(NUMERO)
  @Min(-180)
  @Max(180)
  longitude?: number;
}

/** Local resolvido na versão ativa (leitura). Posição nula: prédio/área sumiu do mapa ativo. */
export interface LocalDto {
  tipo: 'predio' | 'area' | 'ponto';
  /** `predioId` ou `areaId`; nulo para ponto. */
  id: string | null;
  nome: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Como traçar rota até ele (`POST /mapa/rotas`): prédio pelo `id`; área e
   * ponto pela coordenada. `null` quando não há posição.
   */
  rota: { id: string } | { latitude: number; longitude: number } | null;
}

export interface LocalGravado {
  predioId: string | null;
  areaId: string | null;
  longitude: number | null;
  latitude: number | null;
}

export const SEM_LOCAL: LocalGravado = {
  predioId: null,
  areaId: null,
  longitude: null,
  latitude: null,
};

/**
 * Confere o local na versão ativa: prédio/área precisam existir nela; ponto
 * precisa cair dentro do campus. 422 `local-inexistente`/`fora-do-campus`,
 * 503 sem versão ativa, 400 forma inválida.
 */
export async function validarLocal(
  consultar: Consulta,
  geo: string,
  local: LocalEntradaDto,
): Promise<LocalGravado> {
  const temPredio = local.predioId !== undefined;
  const temArea = local.areaId !== undefined;
  const temPonto =
    local.latitude !== undefined || local.longitude !== undefined;
  if (Number(temPredio) + Number(temArea) + Number(temPonto) !== 1) {
    throw new BadRequestException(
      'local: informe predioId OU areaId OU latitude e longitude.',
    );
  }
  if (temPonto) {
    if (local.latitude === undefined || local.longitude === undefined) {
      throw new BadRequestException('local: latitude e longitude vão juntas.');
    }
    await exigirNoCampus(consultar, geo, local.latitude, local.longitude);
    return {
      ...SEM_LOCAL,
      latitude: local.latitude,
      longitude: local.longitude,
    };
  }
  const [linha] = (await consultar(
    `SELECT (SELECT count(*)::int FROM ${m}."versoes" WHERE "status" = 'ativa') AS ativas, ` +
      (temPredio
        ? `EXISTS (SELECT 1 FROM ${m}."predios" WHERE "versao_id" = ${VERSAO_ATIVA} AND "id" = $1) AS existe`
        : `EXISTS (SELECT 1 FROM ${m}."areas" WHERE "versao_id" = ${VERSAO_ATIVA} AND "id" = $1::uuid) AS existe`),
    [temPredio ? local.predioId : local.areaId],
  )) as Array<{ ativas: number; existe: boolean }>;
  if (!linha?.ativas) throw semMapaAtivo();
  if (!linha.existe) {
    throw new UnprocessableEntityException({
      statusCode: 422,
      motivo: 'local-inexistente',
      message: temPredio
        ? 'Prédio não encontrado no mapa ativo.'
        : 'Área não encontrada no mapa ativo.',
    });
  }
  return temPredio
    ? { ...SEM_LOCAL, predioId: local.predioId! }
    : { ...SEM_LOCAL, areaId: local.areaId! };
}

/** Parâmetros SQL de um local gravado: predio_id, area_id, lon, lat (nesta ordem). */
export function parametrosLocal(l: LocalGravado): unknown[] {
  return [l.predioId, l.areaId, l.longitude, l.latitude];
}

/** Expressão do ponto a partir dos parâmetros de [parametrosLocal] ($lon, $lat). */
export function pontoDeParametros(
  geo: string,
  lon: number,
  lat: number,
): string {
  return (
    `CASE WHEN $${lon}::float8 IS NULL THEN NULL ` +
    `ELSE ${geo}.ST_SetSRID(${geo}.ST_MakePoint($${lon}::float8, $${lat}::float8), ${SRID}) END`
  );
}

/** JOINs que resolvem o local de `alias` na versão ativa. */
export function joinsLocal(alias: string): string {
  return (
    `LEFT JOIN ${m}."predios" lp ON lp."versao_id" = ${VERSAO_ATIVA} AND lp."id" = ${alias}."predio_id" ` +
    `LEFT JOIN ${m}."areas" la ON la."versao_id" = ${VERSAO_ATIVA} AND la."id" = ${alias}."area_id"`
  );
}

/**
 * Colunas `local_*` de `alias` (com [joinsLocal]). Centro do prédio = bbox do
 * polígono (igual a `GET /mapa/predios` e ao app); área = seu ponto.
 */
export function colunasLocal(geo: string, alias: string): string {
  const latPredio = `CASE WHEN lp."poligono" IS NULL THEN ${geo}.ST_Y(lp."localizacao") ELSE (${geo}.ST_YMin(lp."poligono") + ${geo}.ST_YMax(lp."poligono")) / 2 END`;
  const lonPredio = `CASE WHEN lp."poligono" IS NULL THEN ${geo}.ST_X(lp."localizacao") ELSE (${geo}.ST_XMin(lp."poligono") + ${geo}.ST_XMax(lp."poligono")) / 2 END`;
  return (
    `CASE WHEN ${alias}."predio_id" IS NOT NULL THEN 'predio' WHEN ${alias}."area_id" IS NOT NULL THEN 'area' ` +
    `WHEN ${alias}."localizacao" IS NOT NULL THEN 'ponto' END AS local_tipo, ` +
    `coalesce(${alias}."predio_id", ${alias}."area_id"::text) AS local_id, ` +
    `coalesce(lp."nome", la."nome") AS local_nome, ` +
    `CASE WHEN ${alias}."predio_id" IS NOT NULL THEN ${latPredio} WHEN ${alias}."area_id" IS NOT NULL THEN ${geo}.ST_Y(la."localizacao") ` +
    `ELSE ${geo}.ST_Y(${alias}."localizacao") END AS local_latitude, ` +
    `CASE WHEN ${alias}."predio_id" IS NOT NULL THEN ${lonPredio} WHEN ${alias}."area_id" IS NOT NULL THEN ${geo}.ST_X(la."localizacao") ` +
    `ELSE ${geo}.ST_X(${alias}."localizacao") END AS local_longitude`
  );
}

export interface ColunasLocal {
  local_tipo: LocalDto['tipo'] | null;
  local_id: string | null;
  local_nome: string | null;
  local_latitude: number | null;
  local_longitude: number | null;
}

export function localDaLinha(l: ColunasLocal): LocalDto | null {
  if (!l.local_tipo) return null;
  const temPosicao = l.local_latitude !== null && l.local_longitude !== null;
  return {
    tipo: l.local_tipo,
    id: l.local_id,
    nome: l.local_nome,
    latitude: l.local_latitude,
    longitude: l.local_longitude,
    rota: !temPosicao
      ? null
      : l.local_tipo === 'predio'
        ? { id: l.local_id! }
        : { latitude: l.local_latitude!, longitude: l.local_longitude! },
  };
}
