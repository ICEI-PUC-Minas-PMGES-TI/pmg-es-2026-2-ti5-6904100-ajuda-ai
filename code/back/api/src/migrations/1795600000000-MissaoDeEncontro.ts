import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;
const anteriores =
  "'PUCSTOPS', 'EVENTO', 'FEED_PUBLICACOES', 'FEED_COMENTARIOS', 'FEED_CURTIDAS', 'CHAT_MENSAGENS', 'CODIGO'";

export class MissaoDeEncontro1795600000000 implements MigrationInterface {
  name = 'MissaoDeEncontro1795600000000';

  async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE ${g}."missoes" ` +
        `DROP CONSTRAINT "ck_missoes_requisito", ` +
        `ADD CONSTRAINT "ck_missoes_requisito" ` +
        `CHECK ("requisito" IS NULL OR "requisito" IN (${anteriores}, 'ENCONTRO'))`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const [{ total }] = (await qr.query(
      `SELECT count(*)::int AS total FROM ${g}."missoes" WHERE "requisito" = 'ENCONTRO'`,
    )) as Array<{ total: number }>;
    if (total > 0) {
      throw new Error(
        'Rollback recusado: existem missões com requisito ENCONTRO.',
      );
    }
    await qr.query(
      `ALTER TABLE ${g}."missoes" ` +
        `DROP CONSTRAINT "ck_missoes_requisito", ` +
        `ADD CONSTRAINT "ck_missoes_requisito" ` +
        `CHECK ("requisito" IS NULL OR "requisito" IN (${anteriores}))`,
    );
  }
}
