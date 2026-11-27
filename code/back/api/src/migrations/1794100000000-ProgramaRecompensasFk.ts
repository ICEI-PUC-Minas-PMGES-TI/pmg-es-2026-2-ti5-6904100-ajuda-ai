import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';
import { marcaCriadoPor, migrationRegistrada } from '../database/estrutura-migrations.js';

const NOME = 'ProgramaRecompensasFk1794100000000';
/** Nome anterior, antes da renomeação para depois da Sprint-6. */
const LEGADA = 'ProgramaRecompensasFk1793700000000';
const FK = 'fk_recompensas_programa';
const INDICE = 'idx_recompensas_programa';
const g = `"${SCHEMA_GAMIFICACAO}"`;
const r = `${g}."recompensas"`;

interface EstadoFk {
  contype: string;
  alvoOk: boolean;
  confupdtype: string;
  confdeltype: string;
  confmatchtype: string;
  convalidated: boolean;
  colunas: string;
  referenciadas: string;
  comentario: string | null;
}

interface EstadoIndice {
  tabelaOk: boolean;
  unico: boolean;
  colunas: string;
  predicado: string | null;
  comentario: string | null;
}

/**
 * `recompensas.programa_codigo` passa a referenciar `programas.codigo`.
 * Excluir um programa com recompensas restritas a ele fica bloqueado
 * (RESTRICT → 409 em `ProgramasService`), em vez de deixar recompensas órfãs.
 *
 * Era `1793700000000`; renomeada para depois da Sprint-6 (timestamp repetido).
 * Num banco em que a versão antiga já rodou, a FK e o índice existem: o `up`
 * só os adota depois de conferir cada atributo (tabela, colunas, tabela
 * referenciada, ações ON UPDATE/DELETE, MATCH, validação; colunas, unicidade
 * e predicado do índice). Qualquer divergência aborta ANTES de alterar algo.
 * O que faltar (ex.: só o índice) é criado e marcado como desta migration.
 *
 * Recompensas órfãs (programa inexistente) impedem a FK: a migration recusa
 * e lista os códigos e as recompensas para correção manual, sem mudar nada.
 *
 * O `down` só remove o que esta migration criou: objeto com a marca dela
 * ou, em bancos anteriores à marca, objeto sem marca quando a versão antiga
 * nunca foi registrada. Estrutura adotada da versão antiga fica.
 */
export class ProgramaRecompensasFk1794100000000 implements MigrationInterface {
  name = NOME;

  async up(qr: QueryRunner): Promise<void> {
    const programas = `${schemaUsuarios(qr)}."programas"`;
    const fk = await estadoFk(qr, programas);
    const indice = await estadoIndice(qr);

    const problemas: string[] = [];
    if (fk) {
      if (fk.contype !== 'f')
        problemas.push(`${FK} existe, mas não é FOREIGN KEY`);
      if (!fk.alvoOk) problemas.push(`${FK} não referencia ${programas}`);
      if (fk.colunas !== 'programa_codigo' || fk.referenciadas !== 'codigo') {
        problemas.push(
          `${FK} liga (${fk.colunas}) a (${fk.referenciadas}), esperado (programa_codigo) a (codigo)`,
        );
      }
      if (fk.confupdtype !== 'c') problemas.push(`${FK} sem ON UPDATE CASCADE`);
      if (fk.confdeltype !== 'r')
        problemas.push(`${FK} sem ON DELETE RESTRICT`);
      if (fk.confmatchtype !== 's') problemas.push(`${FK} não é MATCH SIMPLE`);
      if (!fk.convalidated) problemas.push(`${FK} está NOT VALID`);
    }
    if (indice) {
      if (!indice.tabelaOk) problemas.push(`${INDICE} não é de ${r}`);
      if (indice.unico) problemas.push(`${INDICE} é UNIQUE`);
      if (indice.colunas !== 'programa_codigo') {
        problemas.push(
          `${INDICE} cobre (${indice.colunas}), esperado (programa_codigo)`,
        );
      }
      if (indice.predicado !== '(programa_codigo IS NOT NULL)') {
        problemas.push(
          `${INDICE} com predicado ${indice.predicado ?? 'ausente'}, esperado (programa_codigo IS NOT NULL)`,
        );
      }
    }
    if (problemas.length > 0) {
      throw new Error(
        `Estrutura existente de ${r} difere da esperada; nada foi alterado:\n- ${problemas.join('\n- ')}`,
      );
    }

    if (!fk) {
      const orfas = (await qr.query(
        `SELECT x."programa_codigo" AS codigo, count(*)::int AS total, ` +
          `string_agg(x."nome", ', ' ORDER BY x."nome") AS nomes FROM ${r} x ` +
          `WHERE x."programa_codigo" IS NOT NULL ` +
          `AND NOT EXISTS (SELECT 1 FROM ${programas} p WHERE p."codigo" = x."programa_codigo") ` +
          `GROUP BY x."programa_codigo" ORDER BY x."programa_codigo"`,
      )) as Array<{ codigo: string; total: number; nomes: string }>;
      if (orfas.length > 0) {
        throw new Error(
          'Recompensas ligadas a programas inexistentes; nada foi alterado:\n' +
            orfas
              .map(
                (o) => `- ${o.codigo}: ${o.total} recompensa(s) (${o.nomes})`,
              )
              .join('\n') +
            '\nCadastre o programa em Programas ou mude programa_codigo dessas recompensas ' +
            '(NULL as abre a todos os participantes) e rode a migration de novo.',
        );
      }
      await qr.query(
        `ALTER TABLE ${r} ADD CONSTRAINT "${FK}" ` +
          `FOREIGN KEY ("programa_codigo") REFERENCES ${programas}("codigo") ` +
          `ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
      await qr.query(
        `COMMENT ON CONSTRAINT "${FK}" ON ${r} IS '${marcaCriadoPor(NOME)}'`,
      );
    }
    if (!indice) {
      await qr.query(
        `CREATE INDEX "${INDICE}" ON ${r} ("programa_codigo") ` +
          `WHERE "programa_codigo" IS NOT NULL`,
      );
      await qr.query(
        `COMMENT ON INDEX ${g}."${INDICE}" IS '${marcaCriadoPor(NOME)}'`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const legadaRegistrada = await migrationRegistrada(qr, LEGADA);
    const desta = (comentario: string | null) =>
      comentario === marcaCriadoPor(NOME) ||
      (comentario === null && !legadaRegistrada);

    const indice = await estadoIndice(qr);
    if (indice && desta(indice.comentario)) {
      await qr.query(`DROP INDEX ${g}."${INDICE}"`);
    }
    const fk = await estadoFk(qr, `${schemaUsuarios(qr)}."programas"`);
    if (fk && desta(fk.comentario)) {
      await qr.query(`ALTER TABLE ${r} DROP CONSTRAINT "${FK}"`);
    }
  }
}

function schemaUsuarios(qr: QueryRunner): string {
  const schema =
    (qr.connection.options as { schema?: string }).schema ?? 'feed';
  return `"${schema.replaceAll('"', '""')}"`;
}

async function estadoFk(
  qr: QueryRunner,
  programas: string,
): Promise<EstadoFk | undefined> {
  const [linha] = (await qr.query(
    `SELECT c."contype", c."confrelid" = to_regclass($2) AS "alvoOk", ` +
      `c."confupdtype", c."confdeltype", c."confmatchtype", c."convalidated", ` +
      `(SELECT string_agg(a."attname"::text, ',' ORDER BY k.ord) FROM unnest(c."conkey") WITH ORDINALITY k(n, ord) ` +
      `JOIN pg_attribute a ON a."attrelid" = c."conrelid" AND a."attnum" = k.n) AS "colunas", ` +
      `(SELECT string_agg(a."attname"::text, ',' ORDER BY k.ord) FROM unnest(c."confkey") WITH ORDINALITY k(n, ord) ` +
      `JOIN pg_attribute a ON a."attrelid" = c."confrelid" AND a."attnum" = k.n) AS "referenciadas", ` +
      `obj_description(c."oid", 'pg_constraint') AS "comentario" ` +
      `FROM pg_constraint c WHERE c."conrelid" = to_regclass($1) AND c."conname" = $3`,
    [r, programas, FK],
  )) as EstadoFk[];
  return linha
    ? {
        ...linha,
        alvoOk: linha.alvoOk === true,
        colunas: linha.colunas ?? '',
        referenciadas: linha.referenciadas ?? '',
      }
    : undefined;
}

async function estadoIndice(
  qr: QueryRunner,
): Promise<EstadoIndice | undefined> {
  const [linha] = (await qr.query(
    `SELECT x."indrelid" = to_regclass($1) AS "tabelaOk", x."indisunique" AS "unico", ` +
      `(SELECT string_agg(a."attname"::text, ',' ORDER BY k.ord) FROM unnest(x."indkey"::int2[]) WITH ORDINALITY k(n, ord) ` +
      `JOIN pg_attribute a ON a."attrelid" = x."indrelid" AND a."attnum" = k.n) AS "colunas", ` +
      `pg_get_expr(x."indpred", x."indrelid") AS "predicado", ` +
      `obj_description(i."oid", 'pg_class') AS "comentario" ` +
      `FROM pg_class i JOIN pg_namespace n ON n."oid" = i."relnamespace" ` +
      `JOIN pg_index x ON x."indexrelid" = i."oid" ` +
      `WHERE n."nspname" = $2 AND i."relname" = $3`,
    [r, SCHEMA_GAMIFICACAO, INDICE],
  )) as EstadoIndice[];
  return linha
    ? {
        ...linha,
        tabelaOk: linha.tabelaOk === true,
        colunas: linha.colunas ?? '',
      }
    : undefined;
}
