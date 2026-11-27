/**
 * Criação idempotente do schema do banco (`DB_SCHEMA`, padrão `feed`).
 *
 * O TypeORM cria a tabela `<schema>.migrations` ANTES de executar qualquer
 * migration; num banco novo (ex.: projeto Supabase de produção) o schema ainda
 * não existe e `migration:run` falha com `schema "feed" does not exist`. Uma
 * migration não resolve isso: por isso o passo roda antes, em
 * `npm run migration:run` (script `preparar-schema`).
 *
 * Fica fora de `src/migrations/` de propósito: o TypeORM trata todo `export`
 * de função dos arquivos dessa pasta como se fosse uma migration.
 */

/** Só identificadores simples (letras, números e `_`), sem aspas nem espaços. */
export function nomeSchemaSeguro(nome: string | undefined): string {
  const valor = (nome ?? 'feed').trim();
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(valor)) {
    throw new Error(
      `DB_SCHEMA inválido: "${valor}". Use letras, números e "_" (máx. 63), começando por letra ou "_".`,
    );
  }
  return valor;
}

export type ExecutarSql = (
  sql: string,
  parametros?: unknown[],
) => Promise<{ rowCount?: number | null; rows?: unknown[] }>;

/**
 * Cria o schema só se ele não existir. Devolve `true` quando criou e `false`
 * quando já existia (nesse caso nada é escrito no banco).
 */
export async function garantirSchema(
  executar: ExecutarSql,
  nome: string | undefined,
): Promise<boolean> {
  const schema = nomeSchemaSeguro(nome);
  const existente = await executar(
    'SELECT 1 FROM information_schema.schemata WHERE schema_name = $1',
    [schema],
  );
  if ((existente.rows?.length ?? existente.rowCount ?? 0) > 0) return false;
  await executar(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  return true;
}
