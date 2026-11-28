import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

export class RegrasXp1795300000000 implements MigrationInterface {
  name = 'RegrasXp1795300000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE ${g}."regras_xp" (
        "id" SERIAL PRIMARY KEY,
        "acao" varchar(40) NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "versao_atual" integer NOT NULL DEFAULT 1,
        "criado_por" varchar(120),
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_regras_xp_acao" UNIQUE ("acao")
      );

      CREATE TABLE ${g}."regras_xp_versoes" (
        "id" SERIAL PRIMARY KEY,
        "regra_id" integer NOT NULL,
        "versao" integer NOT NULL,
        "valor_xp" integer NOT NULL,
        "elegibilidade" varchar(20) NOT NULL,
        "limite_repeticoes" integer,
        "combinavel_com" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "criado_por" varchar(120),
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_regras_xp_versoes_valor" CHECK ("valor_xp" > 0),
        CONSTRAINT "ck_regras_xp_versoes_limite" CHECK ("limite_repeticoes" IS NULL OR "limite_repeticoes" > 0),
        CONSTRAINT "fk_regras_xp_versoes_regra" FOREIGN KEY ("regra_id")
          REFERENCES ${g}."regras_xp"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_regras_xp_versao" UNIQUE ("regra_id", "versao")
      );
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    const [{ usadas }] = (await qr.query(
      `SELECT EXISTS (SELECT 1 FROM ${g}."regras_xp") AS usadas`,
    )) as Array<{ usadas: boolean }>;
    if (usadas && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error('Rollback recusado: regras de XP seriam descartadas.');
    }
    await qr.query(`
      DROP TABLE ${g}."regras_xp_versoes";
      DROP TABLE ${g}."regras_xp";
    `);
  }
}
