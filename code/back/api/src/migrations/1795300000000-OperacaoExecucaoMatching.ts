import type { MigrationInterface, QueryRunner } from 'typeorm';
export class OperacaoExecucaoMatching1795300000000 implements MigrationInterface {
  name = 'OperacaoExecucaoMatching1795300000000';
  async up(qr: QueryRunner) {
    const s = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(
      `ALTER TABLE ${s}.matching_execucoes ADD COLUMN operacao_id UUID`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX uq_matching_execucao_operacao ON ${s}.matching_execucoes(programa_id, operacao_id) WHERE operacao_id IS NOT NULL`,
    );
  }
  async down(qr: QueryRunner) {
    const s = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(`DROP INDEX ${s}.uq_matching_execucao_operacao`);
    await qr.query(
      `ALTER TABLE ${s}.matching_execucoes DROP COLUMN operacao_id`,
    );
  }
}
