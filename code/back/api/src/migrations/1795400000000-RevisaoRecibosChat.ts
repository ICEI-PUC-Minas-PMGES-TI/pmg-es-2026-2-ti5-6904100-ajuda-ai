import type { MigrationInterface, QueryRunner } from 'typeorm';
export class RevisaoRecibosChat1795400000000 implements MigrationInterface {
  name = 'RevisaoRecibosChat1795400000000';
  async up(qr: QueryRunner) {
    const s = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(
      `ALTER TABLE ${s}.chat_destinatarios ADD COLUMN revisao INTEGER NOT NULL DEFAULT 0`,
    );
    await qr.query(
      `CREATE INDEX idx_chat_destinatario_revisao ON ${s}.chat_destinatarios(chat_id, revisao)`,
    );
  }
  async down(qr: QueryRunner) {
    const s = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(`DROP INDEX ${s}.idx_chat_destinatario_revisao`);
    await qr.query(`ALTER TABLE ${s}.chat_destinatarios DROP COLUMN revisao`);
  }
}
