import type { MigrationInterface, QueryRunner } from 'typeorm';

function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

async function removerConstraintsDeOrigem(
  queryRunner: QueryRunner,
  tabela: string,
) {
  const s = schemaDe(queryRunner);
  const constraints = (await queryRunner.query(
    `SELECT conname FROM pg_constraint ` +
      `WHERE conrelid = $1::regclass AND contype = 'c' ` +
      `AND pg_get_constraintdef(oid) ILIKE '%origem%'`,
    [`${s}."${tabela}"`],
  )) as Array<{ conname: string }>;
  for (const { conname } of constraints) {
    await queryRunner.query(
      `ALTER TABLE ${s}."${tabela}" DROP CONSTRAINT "${conname.replaceAll('"', '""')}"`,
    );
  }
}

export class MatchingManualVinculoOrigem1792800000000
  implements MigrationInterface
{
  name = 'MatchingManualVinculoOrigem1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    await removerConstraintsDeOrigem(queryRunner, 'matching_vinculos');
    await queryRunner.query(
      `ALTER TABLE ${s}."matching_vinculos" ` +
        `ADD CONSTRAINT "ck_matching_vinculo_origem" ` +
        `CHECK ("origem" IN ('matching', 'legado', 'manual'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ manuais }] = (await queryRunner.query(
      `SELECT count(*)::int AS manuais FROM ${s}."matching_vinculos" ` +
        `WHERE "origem" = 'manual'`,
    )) as Array<{ manuais: number }>;
    if (manuais > 0) {
      throw new Error(
        `Rollback recusado: ${manuais} vínculo(s) manual(is) usam a origem que seria removida.`,
      );
    }
    await removerConstraintsDeOrigem(queryRunner, 'matching_vinculos');
    await queryRunner.query(
      `ALTER TABLE ${s}."matching_vinculos" ` +
        `ADD CONSTRAINT "ck_matching_vinculo_origem" ` +
        `CHECK ("origem" IN ('matching', 'legado'))`,
    );
  }
}
