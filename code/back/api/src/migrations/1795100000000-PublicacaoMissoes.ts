import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

export class PublicacaoMissoes1795100000000 implements MigrationInterface {
  name = 'PublicacaoMissoes1795100000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(
      `ALTER TABLE ${g}."missoes" ADD COLUMN "publicada_em" TIMESTAMP WITH TIME ZONE`,
    );
    await qr.query(
      `UPDATE ${g}."missoes" SET "publicada_em" = "criado_em" WHERE "ativa"`,
    );
    await qr.query(
      `ALTER TABLE ${g}."missoes" ADD CONSTRAINT "ck_missoes_publicada" ` +
        `CHECK (NOT "ativa" OR "publicada_em" IS NOT NULL)`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(
      `ALTER TABLE ${g}."missoes" DROP CONSTRAINT "ck_missoes_publicada", DROP COLUMN "publicada_em"`,
    );
  }
}
