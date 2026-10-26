import type { DataSource, QueryRunner } from 'typeorm';
import { SCHEMA_MAPA, SRID, schemaPostgis } from '../postgis.js';
import type { SnapshotMapa } from './snapshot.js';

export interface Contagens {
  predios: number;
  salas: number;
  areas: number;
  nos: number;
  arestas: number;
}

export interface ResultadoImportacao {
  situacao: 'importada' | 'ja-importada';
  versaoId: string;
  codigo: string;
  status: string;
  contagens: Contagens;
}

export class ImportacaoRecusadaError extends Error {}

const m = `"${SCHEMA_MAPA}"`;

/**
 * Importa uma versão do mapa numa única transação. Idempotente por `codigo`:
 *
 * - código novo: cria a versão (`pronta`) e todos os registros;
 * - código já importado com o mesmo `hash_dados`: não escreve nada, só
 *   confere as contagens no banco (e ativa, se pedido);
 * - código já importado com outro hash: recusa. Versão é imutável; dados
 *   novos exigem outro código.
 *
 * `ativar` torna esta a única versão `ativa` (a anterior vira `arquivada`).
 * Nenhum dado de versão já importada é alterado ou apagado.
 */
export async function importarSnapshot(
  dataSource: DataSource,
  snapshot: SnapshotMapa,
  opcoes: { ativar?: boolean } = {},
): Promise<ResultadoImportacao> {
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const resultado = await importarNaTransacao(qr, snapshot, opcoes);
    await qr.commitTransaction();
    return resultado;
  } catch (erro) {
    await qr.rollbackTransaction();
    throw erro;
  } finally {
    await qr.release();
  }
}

async function importarNaTransacao(
  qr: QueryRunner,
  s: SnapshotMapa,
  opcoes: { ativar?: boolean },
): Promise<ResultadoImportacao> {
  const g = await schemaPostgis((sql, p) => qr.query(sql, p));
  const esperado: Contagens = {
    predios: s.predios.length,
    salas: s.salas.length,
    areas: s.areas.length,
    nos: s.nos.length,
    arestas: s.arestas.length,
  };
  // Serializa importações concorrentes (leituras continuam livres).
  await qr.query(`LOCK TABLE ${m}."versoes" IN SHARE ROW EXCLUSIVE MODE`);

  const [existente] = (await qr.query(
    `SELECT "id", "hash_dados", "status" FROM ${m}."versoes" WHERE "codigo" = $1`,
    [s.codigo],
  )) as Array<{ id: string; hash_dados: string; status: string }>;

  let versaoId: string;
  let situacao: ResultadoImportacao['situacao'];
  if (existente) {
    if (existente.hash_dados !== s.hashDados) {
      throw new ImportacaoRecusadaError(
        `Versão ${s.codigo} já importada com outro conteúdo (hash ${existente.hash_dados}). ` +
          'Versões são imutáveis: gere o snapshot com outro código.',
      );
    }
    versaoId = existente.id;
    situacao = 'ja-importada';
    const atual = await contar(qr, versaoId);
    const divergentes = (
      Object.keys(esperado) as Array<keyof Contagens>
    ).filter((k) => atual[k] !== esperado[k]);
    if (divergentes.length) {
      throw new ImportacaoRecusadaError(
        `Versão ${s.codigo} existe com o mesmo hash, mas o banco diverge em ${divergentes.join(', ')}. ` +
          'Nada foi alterado; investigue antes de reimportar.',
      );
    }
  } else {
    [{ id: versaoId }] = (await qr.query(
      `INSERT INTO ${m}."versoes" ("id", "codigo", "status", "origem", "hash_dados", "versao_assets", "metadados") ` +
        `VALUES (gen_random_uuid(), $1, 'pronta', $2, $3, $4, $5) RETURNING "id"`,
      [
        s.codigo,
        s.origem,
        s.hashDados,
        s.versaoAssets,
        { contagens: esperado },
      ],
    )) as Array<{ id: string }>;
    await inserir(qr, g, versaoId, s);
    situacao = 'importada';
    const atual = await contar(qr, versaoId);
    for (const k of Object.keys(esperado) as Array<keyof Contagens>) {
      if (atual[k] !== esperado[k]) {
        throw new Error(
          `Contagem de ${k} divergiu após inserir (${atual[k]} ≠ ${esperado[k]}).`,
        );
      }
    }
  }

  if (opcoes.ativar) {
    await qr.query(
      `UPDATE ${m}."versoes" SET "status" = 'arquivada' WHERE "status" = 'ativa' AND "id" <> $1`,
      [versaoId],
    );
    await qr.query(
      `UPDATE ${m}."versoes" SET "status" = 'ativa', "ativada_em" = COALESCE("ativada_em", now()) ` +
        `WHERE "id" = $1 AND "status" <> 'ativa'`,
      [versaoId],
    );
  }
  const [{ status }] = (await qr.query(
    `SELECT "status" FROM ${m}."versoes" WHERE "id" = $1`,
    [versaoId],
  )) as Array<{ status: string }>;
  return { situacao, versaoId, codigo: s.codigo, status, contagens: esperado };
}

async function inserir(
  qr: QueryRunner,
  g: string,
  versaoId: string,
  s: SnapshotMapa,
): Promise<void> {
  const geom = (coluna: string) =>
    `${g}.ST_SetSRID(${g}.ST_GeomFromGeoJSON(x."${coluna}"::text), ${SRID})`;
  const geomOpcional = (coluna: string) =>
    `CASE WHEN x."${coluna}" IS NULL OR x."${coluna}" = 'null'::jsonb THEN NULL ELSE ${geom(coluna)} END`;

  await qr.query(
    `INSERT INTO ${m}."predios" ("versao_id", "id", "id_origem", "osm_id", "codigo", "nome", "tipo", ` +
      `"altura", "altura_base", "entradas", "localizacao", "poligono") ` +
      `SELECT $1, x."id", x."idOrigem", x."osmId", x."codigo", x."nome", x."tipo", x."altura", ` +
      `x."alturaBase", x."entradas", ${geom('localizacao')}, ${geomOpcional('poligono')} ` +
      `FROM jsonb_to_recordset($2::jsonb) AS x("id" text, "idOrigem" uuid, "osmId" text, "codigo" text, ` +
      `"nome" text, "tipo" text, "altura" float8, "alturaBase" float8, "entradas" jsonb, ` +
      `"localizacao" jsonb, "poligono" jsonb)`,
    [versaoId, JSON.stringify(s.predios)],
  );
  if (s.salas.length) {
    await qr.query(
      `INSERT INTO ${m}."salas" ("versao_id", "id", "predio_id", "nome", "andar", "capacidade", "tipo", "localizacao") ` +
        `SELECT $1, x."id", x."predioId", x."nome", x."andar", x."capacidade", x."tipo", ${geom('localizacao')} ` +
        `FROM jsonb_to_recordset($2::jsonb) AS x("id" uuid, "predioId" text, "nome" text, "andar" int, ` +
        `"capacidade" int, "tipo" text, "localizacao" jsonb)`,
      [versaoId, JSON.stringify(s.salas)],
    );
  }
  await qr.query(
    `INSERT INTO ${m}."areas" ("versao_id", "id", "nome", "tipo", "entradas", "localizacao", "poligono") ` +
      `SELECT $1, x."id", x."nome", x."tipo", x."entradas", ${geom('localizacao')}, ${geomOpcional('poligono')} ` +
      `FROM jsonb_to_recordset($2::jsonb) AS x("id" uuid, "nome" text, "tipo" text, "entradas" jsonb, ` +
      `"localizacao" jsonb, "poligono" jsonb)`,
    [versaoId, JSON.stringify(s.areas)],
  );
  await qr.query(
    `INSERT INTO ${m}."nos_grafo" ("versao_id", "id", "predio_id", "sala_id", "nivel", "camada", "localizacao") ` +
      `SELECT $1, x."id", x."predioId", x."salaId", x."nivel", x."camada", ${geom('localizacao')} ` +
      `FROM jsonb_to_recordset($2::jsonb) AS x("id" uuid, "predioId" text, "salaId" uuid, ` +
      `"nivel" numeric, "camada" int, "localizacao" jsonb)`,
    [versaoId, JSON.stringify(s.nos)],
  );
  await qr.query(
    `INSERT INTO ${m}."arestas_grafo" ("versao_id", "id", "no_origem_id", "no_destino_id", "distancia_m", ` +
      `"tempo_caminhada_s", "acessivel", "gerada", "camada", "geometria") ` +
      `SELECT $1, x."id", x."origem", x."destino", x."distanciaM", x."tempoCaminhadaS", x."acessivel", ` +
      `x."gerada", x."camada", ${geomOpcional('geometria')} ` +
      `FROM jsonb_to_recordset($2::jsonb) AS x("id" uuid, "origem" uuid, "destino" uuid, ` +
      `"distanciaM" float8, "tempoCaminhadaS" int, "acessivel" boolean, "gerada" boolean, ` +
      `"camada" int, "geometria" jsonb)`,
    [versaoId, JSON.stringify(s.arestas)],
  );
}

async function contar(qr: QueryRunner, versaoId: string): Promise<Contagens> {
  const [linha] = (await qr.query(
    `SELECT ` +
      `(SELECT count(*)::int FROM ${m}."predios" WHERE "versao_id" = $1) AS predios, ` +
      `(SELECT count(*)::int FROM ${m}."salas" WHERE "versao_id" = $1) AS salas, ` +
      `(SELECT count(*)::int FROM ${m}."areas" WHERE "versao_id" = $1) AS areas, ` +
      `(SELECT count(*)::int FROM ${m}."nos_grafo" WHERE "versao_id" = $1) AS nos, ` +
      `(SELECT count(*)::int FROM ${m}."arestas_grafo" WHERE "versao_id" = $1) AS arestas`,
    [versaoId],
  )) as Contagens[];
  return linha;
}

export interface RelatorioMapa {
  versoes: number;
  ativas: number;
  contagensAtiva: Contagens | null;
  geometriasInvalidas: number;
  sridIncorreto: number;
  arestasPenduradas: number;
  nosForaDoPredioReferenciado: number;
}

/** Verificação somente leitura do schema `mapa` (todas as versões). */
export async function relatorioMapa(
  dataSource: DataSource,
): Promise<RelatorioMapa> {
  const g = await schemaPostgis((sql, p) => dataSource.query(sql, p));
  const um = async (sql: string): Promise<number> => {
    const [linha] = (await dataSource.query(sql)) as Array<{ n: number }>;
    return linha.n;
  };
  const geometrias: Array<[string, string]> = [
    ['predios', 'localizacao'],
    ['predios', 'poligono'],
    ['salas', 'localizacao'],
    ['areas', 'localizacao'],
    ['areas', 'poligono'],
    ['nos_grafo', 'localizacao'],
    ['arestas_grafo', 'geometria'],
  ];
  let invalidas = 0;
  let srid = 0;
  for (const [tabela, coluna] of geometrias) {
    invalidas += await um(
      `SELECT count(*)::int AS n FROM ${m}."${tabela}" WHERE "${coluna}" IS NOT NULL AND NOT ${g}.ST_IsValid("${coluna}")`,
    );
    srid += await um(
      `SELECT count(*)::int AS n FROM ${m}."${tabela}" WHERE "${coluna}" IS NOT NULL AND ${g}.ST_SRID("${coluna}") <> ${SRID}`,
    );
  }
  const [ativa] = (await dataSource.query(
    `SELECT "id" FROM ${m}."versoes" WHERE "status" = 'ativa'`,
  )) as Array<{ id: string }>;
  const qr = dataSource.createQueryRunner();
  try {
    return {
      versoes: await um(`SELECT count(*)::int AS n FROM ${m}."versoes"`),
      ativas: await um(
        `SELECT count(*)::int AS n FROM ${m}."versoes" WHERE "status" = 'ativa'`,
      ),
      contagensAtiva: ativa ? await contar(qr, ativa.id) : null,
      geometriasInvalidas: invalidas,
      sridIncorreto: srid,
      arestasPenduradas: await um(
        `SELECT count(*)::int AS n FROM ${m}."arestas_grafo" e WHERE NOT EXISTS ` +
          `(SELECT 1 FROM ${m}."nos_grafo" o WHERE o."versao_id" = e."versao_id" AND o."id" = e."no_origem_id") ` +
          `OR NOT EXISTS (SELECT 1 FROM ${m}."nos_grafo" d WHERE d."versao_id" = e."versao_id" AND d."id" = e."no_destino_id")`,
      ),
      nosForaDoPredioReferenciado: await um(
        `SELECT count(*)::int AS n FROM ${m}."nos_grafo" n WHERE n."predio_id" IS NOT NULL AND NOT EXISTS ` +
          `(SELECT 1 FROM ${m}."predios" p WHERE p."versao_id" = n."versao_id" AND p."id" = n."predio_id")`,
      ),
    };
  } finally {
    await qr.release();
  }
}
