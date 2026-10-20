/**
 * Onde o PostGIS está instalado varia por ambiente: no Supabase as extensões
 * ficam no schema `extensions`; a imagem local `postgis/postgis` instala em
 * `public` ao criar um volume novo. Migrations e importador qualificam tipos
 * e funções com o schema real, sem depender do `search_path`.
 */
export const SCHEMA_MAPA = 'mapa';
export const SCHEMA_EXTENSOES = 'extensions';
export const SRID = 4326;

type Consulta = (sql: string, parametros?: unknown[]) => Promise<unknown>;

/** Schema (já entre aspas) de uma extensão instalada, ou `null`. */
export async function schemaDaExtensao(
  consultar: Consulta,
  extensao: string,
): Promise<string | null> {
  const linhas = (await consultar(
    `SELECT n.nspname AS schema FROM pg_extension e ` +
      `JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = $1`,
    [extensao],
  )) as Array<{ schema: string }>;
  const schema = linhas[0]?.schema;
  return schema ? `"${schema.replaceAll('"', '""')}"` : null;
}

/** Como [schemaDaExtensao], mas falha se o PostGIS não estiver instalado. */
export async function schemaPostgis(consultar: Consulta): Promise<string> {
  const schema = await schemaDaExtensao(consultar, 'postgis');
  if (!schema) {
    throw new Error(
      'PostGIS não está instalado neste banco. Rode as migrations (HabilitaPostgisESchemaMapa).',
    );
  }
  return schema;
}
