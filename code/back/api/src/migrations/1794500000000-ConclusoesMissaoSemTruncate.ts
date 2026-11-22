import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

const TRIGGER = 'tg_missoes_conclusoes_sem_truncate';

/**
 * `missoes_conclusoes` é só de inserção, mas `CriaMissoes` criou apenas o
 * gatilho por linha (UPDATE/DELETE). Este completa a proteção contra
 * `TRUNCATE`, como em `resgates` e no ledger.
 */
export class ConclusoesMissaoSemTruncate1794500000000 implements MigrationInterface {
  name = 'ConclusoesMissaoSemTruncate1794500000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(
      `CREATE TRIGGER "${TRIGGER}" BEFORE TRUNCATE ON ${g}."missoes_conclusoes" ` +
        `FOR EACH STATEMENT EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(`DROP TRIGGER "${TRIGGER}" ON ${g}."missoes_conclusoes"`);
  }
}
