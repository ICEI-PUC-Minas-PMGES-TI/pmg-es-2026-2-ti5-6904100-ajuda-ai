import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const COLUNAS = ['versao', 'encerrado_em'];

/**
 * `true` quando as duas colunas já existem (banco criado por `synchronize`);
 * `false` quando nenhuma existe; erro em estado parcial.
 */
async function jaAplicada(queryRunner: QueryRunner): Promise<boolean> {
  const options = queryRunner.connection.options as { schema?: string };
  const existentes = (await queryRunner.query(
    `SELECT column_name FROM information_schema.columns ` +
      `WHERE table_schema = $1 AND table_name = 'formularios' ` +
      `AND column_name = ANY($2::text[])`,
    [options.schema ?? 'feed', COLUNAS],
  )) as Array<{ column_name: string }>;
  if (existentes.length === 0) return false;
  if (existentes.length === COLUNAS.length) return true;
  throw new Error(
    'VersoesEEncerramentoFormularios recusada: estado parcial ' +
      `(existe: ${existentes.map((c) => c.column_name).join(', ')}). Nada foi alterado.`,
  );
}

/**
 * Versões e encerramento dos formulários (F06):
 *
 * - `versao`: 0 = nunca publicado. Formulários já publicados passam a ser a
 *   versão 1, para que as respostas futuras tenham uma versão associada.
 * - `encerrado_em`: preenchido quando a coordenação encerra as novas
 *   respostas; as respostas já enviadas não são tocadas.
 */
export class VersoesEEncerramentoFormularios1792400000000 implements MigrationInterface {
  name = 'VersoesEEncerramentoFormularios1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await jaAplicada(queryRunner)) return;
    const s = schemaDe(queryRunner);
    await queryRunner.query(
      `ALTER TABLE ${s}."formularios" ` +
        `ADD "versao" integer NOT NULL DEFAULT 0, ` +
        `ADD "encerrado_em" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE ${s}."formularios" SET "versao" = 1 WHERE "publicado" = true`,
    );
  }

  /**
   * Rollback seguro: recusa-se a descartar versões/encerramentos já
   * registrados. Para descartar mesmo assim, rode com
   * MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ usados }] = (await queryRunner.query(
      `SELECT count(*)::int AS usados FROM ${s}."formularios" ` +
        `WHERE "encerrado_em" IS NOT NULL OR "versao" > 1`,
    )) as Array<{ usados: number }>;
    if (usados > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${usados} formulário(s) com versões ou encerramento seriam descartados. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await queryRunner.query(
      `ALTER TABLE ${s}."formularios" DROP COLUMN "encerrado_em", DROP COLUMN "versao"`,
    );
  }
}
