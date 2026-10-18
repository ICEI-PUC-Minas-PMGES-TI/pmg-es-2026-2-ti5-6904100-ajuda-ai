import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SCHEMA_MAPA, SRID } from './postgis.js';

const m = `"${SCHEMA_MAPA}"`;

/**
 * Tolerância além da envoltória do campus. Cobre calçadas e entradas na borda
 * dos prédios/caminhos mapeados, mas recusa um clique na rua ao lado ou um
 * ponto a quilômetros da PUC.
 */
export const MARGEM_CAMPUS_METROS = 30;

type Consulta = (sql: string, parametros?: unknown[]) => Promise<unknown>;

/** `GET .../campus`: onde o servidor aceita um ponto administrado. */
export interface RegiaoCampusDto {
  /** Envoltória da versão ativa do mapa + margem (GeoJSON, SRID 4326). */
  limite: { type: 'Polygon'; coordinates: number[][][] };
  margemMetros: number;
  bbox: { west: number; south: number; east: number; north: number };
  centro: { latitude: number; longitude: number };
}

/**
 * Envoltória convexa do campus na versão ativa do mapa: prédios, áreas e nós
 * do grafo de caminhos. NULL sem versão ativa. Conteúdo administrado
 * (PucStops, eventos, restaurantes) não pertence à versão; ela só define, no
 * momento da escrita, onde um ponto é aceito.
 */
export function envoltoriaCampus(geo: string): string {
  const ativa = `(SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa')`;
  return (
    `(SELECT ${geo}.ST_ConvexHull(${geo}.ST_Collect(x.g)) FROM (` +
    `SELECT coalesce(p."poligono", p."localizacao") AS g FROM ${m}."predios" p WHERE p."versao_id" = ${ativa} ` +
    `UNION ALL SELECT coalesce(a."poligono", a."localizacao") FROM ${m}."areas" a WHERE a."versao_id" = ${ativa} ` +
    `UNION ALL SELECT n."localizacao" FROM ${m}."nos_grafo" n WHERE n."versao_id" = ${ativa}` +
    `) x)`
  );
}

export function semMapaAtivo(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    'Mapa do campus sem versão ativa: não há como conferir a posição.',
  );
}

/** Região aceita, para o seletor do mapa mostrar o mesmo limite. 503 sem versão ativa. */
export async function regiaoCampus(
  consultar: Consulta,
  geo: string,
): Promise<RegiaoCampusDto> {
  const [linha] = (await consultar(
    `SELECT ${geo}.ST_AsGeoJSON(r, 6)::json AS limite, ` +
      `${geo}.ST_XMin(r) AS west, ${geo}.ST_YMin(r) AS south, ${geo}.ST_XMax(r) AS east, ${geo}.ST_YMax(r) AS north, ` +
      `${geo}.ST_Y(${geo}.ST_Centroid(r)) AS latitude, ${geo}.ST_X(${geo}.ST_Centroid(r)) AS longitude ` +
      `FROM (SELECT ${geo}.ST_Buffer(${envoltoriaCampus(geo)}::${geo}.geography, $1)::${geo}.geometry AS r) t WHERE r IS NOT NULL`,
    [MARGEM_CAMPUS_METROS],
  )) as Array<{
    limite: RegiaoCampusDto['limite'];
    west: number;
    south: number;
    east: number;
    north: number;
    latitude: number;
    longitude: number;
  }>;
  if (!linha) throw semMapaAtivo();
  return {
    limite: linha.limite,
    margemMetros: MARGEM_CAMPUS_METROS,
    bbox: {
      west: linha.west,
      south: linha.south,
      east: linha.east,
      north: linha.north,
    },
    centro: { latitude: linha.latitude, longitude: linha.longitude },
  };
}

/**
 * Recusa posição fora do campus da versão ativa (422 `fora-do-campus`) ou
 * quando não há mapa ativo para conferir (503). Distância geodésica.
 */
export async function exigirNoCampus(
  consultar: Consulta,
  geo: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const ponto = `${geo}.ST_SetSRID(${geo}.ST_MakePoint($1, $2), ${SRID})::${geo}.geography`;
  const [r] = (await consultar(
    `SELECT ${geo}.ST_DWithin(c::${geo}.geography, ${ponto}, $3) AS dentro, ` +
      `${geo}.ST_Distance(c::${geo}.geography, ${ponto}) AS distancia ` +
      `FROM (SELECT ${envoltoriaCampus(geo)} AS c) t`,
    [longitude, latitude, MARGEM_CAMPUS_METROS],
  )) as Array<{ dentro: boolean | null; distancia: number | null }>;
  if (r?.dentro === null || r?.dentro === undefined) throw semMapaAtivo();
  if (!r.dentro) {
    throw new UnprocessableEntityException({
      statusCode: 422,
      motivo: 'fora-do-campus',
      message: 'Escolha um ponto dentro do campus.',
      distanciaMetros: Math.round(r.distancia ?? 0),
    });
  }
}
