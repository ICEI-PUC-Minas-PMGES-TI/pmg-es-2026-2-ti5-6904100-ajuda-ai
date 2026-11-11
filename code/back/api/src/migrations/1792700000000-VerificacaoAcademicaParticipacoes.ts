import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export const COLUNA_VERIFICACAO = 'verificacao';

/** `true` quando a coluna já existe (banco criado por `synchronize`). */
async function jaAplicada(queryRunner: QueryRunner): Promise<boolean> {
  const options = queryRunner.connection.options as { schema?: string };
  const existentes = (await queryRunner.query(
    `SELECT column_name FROM information_schema.columns ` +
      `WHERE table_schema = $1 AND table_name = 'participacoes' ` +
      `AND column_name = ANY($2::text[])`,
    [options.schema ?? 'feed', [COLUNA_VERIFICACAO]],
  )) as Array<{ column_name: string }>;
  return existentes.length > 0;
}

/**
 * Conferência acadêmica das candidaturas (F09): `participacoes.verificacao`
 * guarda o checklist conferido no sistema da faculdade, o resultado,
 * observações, responsável e data (com o histórico das anteriores). Fica fora
 * de `respostas` para não voltar ao aluno junto com o formulário.
 */
export class VerificacaoAcademicaParticipacoes1792700000000 implements MigrationInterface {
  name = 'VerificacaoAcademicaParticipacoes1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await jaAplicada(queryRunner)) return;
    const s = schemaDe(queryRunner);
    await queryRunner.query(
      `ALTER TABLE ${s}."participacoes" ADD "${COLUNA_VERIFICACAO}" jsonb`,
    );
  }

  /**
   * Rollback seguro: recusa-se a descartar conferências já registradas.
   * Para descartar mesmo assim, rode com MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ usados }] = (await queryRunner.query(
      `SELECT count(*)::int AS usados FROM ${s}."participacoes" ` +
        `WHERE "${COLUNA_VERIFICACAO}" IS NOT NULL`,
    )) as Array<{ usados: number }>;
    if (usados > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${usados} conferência(s) acadêmica(s) seriam descartadas. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await queryRunner.query(
      `ALTER TABLE ${s}."participacoes" DROP COLUMN "${COLUNA_VERIFICACAO}"`,
    );
  }
}
