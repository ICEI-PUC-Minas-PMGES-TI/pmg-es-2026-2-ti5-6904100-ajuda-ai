import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

export class RegrasXpPorPrograma1795900000000 implements MigrationInterface {
  name = 'RegrasXpPorPrograma1795900000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE ${g}."regras_xp" ADD COLUMN "programa" varchar(20);
      ALTER TABLE ${g}."regras_xp" DROP CONSTRAINT "uq_regras_xp_acao";
      CREATE UNIQUE INDEX "uq_regras_xp_acao_programa"
        ON ${g}."regras_xp" ("acao", COALESCE("programa", ''));
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    const [{ usadas }] = (await qr.query(
      `SELECT EXISTS (SELECT 1 FROM ${g}."regras_xp" WHERE "programa" IS NOT NULL) AS usadas`,
    )) as Array<{ usadas: boolean }>;
    if (usadas && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        'Rollback recusado: regras de XP de ciclos específicos seriam descartadas.',
      );
    }
    await qr.query(`
      DELETE FROM ${g}."regras_xp_versoes" v USING ${g}."regras_xp" r
        WHERE v."regra_id" = r."id" AND r."programa" IS NOT NULL;
      DELETE FROM ${g}."regras_xp" WHERE "programa" IS NOT NULL;
      DROP INDEX ${g}."uq_regras_xp_acao_programa";
      ALTER TABLE ${g}."regras_xp" ADD CONSTRAINT "uq_regras_xp_acao" UNIQUE ("acao");
      ALTER TABLE ${g}."regras_xp" DROP COLUMN "programa";
    `);
  }
}
