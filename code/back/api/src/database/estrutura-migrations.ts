import type { QueryRunner } from 'typeorm';

/**
 * Conferência de estrutura para migrations que "adotam" um schema já criado
 * por uma versão anterior (renomeada) delas mesmas.
 *
 * Achar um nome (tabela, constraint) não prova que a estrutura está
 * completa. Aqui a estrutura ESPERADA é criada de verdade, com a mesma DDL
 * da migration, num schema temporário, e comparada item a item com a
 * existente pelo catálogo do PostgreSQL: colunas (tipo, nulidade, default),
 * constraints (tipo e definição: PK, UNIQUE, FK com ações, CHECK), índices e
 * gatilhos. Qualquer diferença vira erro antes de registrar a migration.
 *
 * Fica fora de `src/migrations/` de propósito: o CLI do TypeORM carrega
 * `dist/migrations/*.js` e instancia toda função exportada como migration
 * (`migrationClass is not a constructor`). Lá só entram classes de migration.
 */

const aspas = (nome: string) => `"${nome.replaceAll('"', '""')}"`;

/** Descrição canônica de uma tabela, com o schema trocado por `<schema>`. */
async function descrever(
  qr: QueryRunner,
  schema: string,
  tabela: string,
): Promise<string[]> {
  const alvo = `${aspas(schema)}.${aspas(tabela)}`;
  const linhas = (await qr.query(
    `SELECT 'coluna ' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ` +
      `CASE WHEN a.attnotnull THEN ' not null' ELSE '' END || ` +
      `COALESCE(' default ' || pg_get_expr(d.adbin, d.adrelid), '') AS item ` +
      `FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum ` +
      `WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ` +
      `UNION ALL ` +
      `SELECT 'constraint ' || c.conname || ' ' || c.contype::text || ' ' || pg_get_constraintdef(c.oid) || ` +
      `CASE WHEN c.convalidated THEN '' ELSE ' not valid' END ` +
      `FROM pg_constraint c WHERE c.conrelid = $1::regclass ` +
      `UNION ALL ` +
      `SELECT 'indice ' || i.relname || ' ' || pg_get_indexdef(i.oid) ` +
      `FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid WHERE x.indrelid = $1::regclass ` +
      `UNION ALL ` +
      `SELECT 'gatilho ' || t.tgname || ' ' || pg_get_triggerdef(t.oid) || ` +
      `CASE WHEN t.tgenabled = 'D' THEN ' desabilitado' ELSE '' END ` +
      `FROM pg_trigger t WHERE t.tgrelid = $1::regclass AND NOT t.tgisinternal`,
    [alvo],
  )) as Array<{ item: string }>;
  // pg_get_indexdef/pg_get_triggerdef qualificam a tabela com o schema.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixo = new RegExp(
    `\\bON (ONLY )?(?:${esc(aspas(schema))}|${esc(schema)})\\.`,
    'g',
  );
  return linhas
    .map((l) =>
      l.item.replace(
        prefixo,
        (_m, only?: string) => `ON ${only ?? ''}<schema>.`,
      ),
    )
    .sort();
}

/**
 * Cria `criar(schemaTemporario)` dentro de um SAVEPOINT, compara cada tabela
 * com a existente em `schemaReal` e desfaz tudo o que foi criado. Devolve as
 * diferenças (vazio = estrutura idêntica).
 */
export async function diferencasDeEstrutura(
  qr: QueryRunner,
  schemaReal: string,
  tabelas: readonly string[],
  criar: (schema: string) => Promise<void>,
): Promise<string[]> {
  const temporario = `_confere_${Date.now().toString(36)}`;
  const savepoint = aspas(`sp${temporario}`);
  // Sem transação aberta (migrationsTransactionMode 'none'), abre uma só
  // para poder desfazer o schema temporário.
  const propria = !qr.isTransactionActive;
  if (propria) await qr.startTransaction();
  await qr.query(`SAVEPOINT ${savepoint}`);
  try {
    await qr.query(`CREATE SCHEMA ${aspas(temporario)}`);
    await criar(temporario);
    const diferencas: string[] = [];
    for (const tabela of tabelas) {
      const esperado = await descrever(qr, temporario, tabela);
      const atual = await descrever(qr, schemaReal, tabela);
      for (const item of esperado.filter((i) => !atual.includes(i))) {
        diferencas.push(`${tabela}: falta ${item}`);
      }
      for (const item of atual.filter((i) => !esperado.includes(i))) {
        diferencas.push(`${tabela}: sobra ${item}`);
      }
    }
    return diferencas;
  } finally {
    await qr.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await qr.query(`RELEASE SAVEPOINT ${savepoint}`);
    if (propria) await qr.commitTransaction();
  }
}

/** Tabelas de `tabelas` que existem em `schema`. */
export async function tabelasExistentes(
  qr: QueryRunner,
  schema: string,
  tabelas: readonly string[],
): Promise<string[]> {
  const linhas = (await qr.query(
    `SELECT table_name AS nome FROM information_schema.tables ` +
      `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [schema, [...tabelas]],
  )) as Array<{ nome: string }>;
  return linhas.map((l) => l.nome).sort();
}

/** A migration com este nome está registrada na tabela de migrations? */
export async function migrationRegistrada(
  qr: QueryRunner,
  nome: string,
): Promise<boolean> {
  const opcoes = qr.connection.options as {
    schema?: string;
    migrationsTableName?: string;
  };
  const schema = opcoes.schema ?? 'public';
  const tabela = opcoes.migrationsTableName ?? 'migrations';
  const [existe] = (await qr.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, tabela],
  )) as unknown[];
  if (!existe) return false;
  const [linha] = (await qr.query(
    `SELECT 1 FROM ${aspas(schema)}.${aspas(tabela)} WHERE "name" = $1`,
    [nome],
  )) as unknown[];
  return Boolean(linha);
}

/**
 * Marca gravada no COMMENT de um objeto criado por uma migration. O `down`
 * só remove o que tem a marca dele (ou, em bancos anteriores à marca, o que
 * não foi adotado de uma versão antiga).
 */
export const marcaCriadoPor = (migration: string) =>
  `ajuda-ai: criado por ${migration}`;
