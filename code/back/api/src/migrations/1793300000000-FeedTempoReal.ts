import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedTempoReal1793300000000 implements MigrationInterface {
  name = 'FeedTempoReal1793300000000';
  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? 'feed';
    const s = `"${schema.replaceAll('"', '""')}"`;
    await runner.query(`CREATE TABLE ${s}."feed_outbox" (
      "id" uuid PRIMARY KEY, "evento" jsonb NOT NULL,
      "publicado_em" timestamptz, "criado_em" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE INDEX "idx_feed_outbox_pendente" ON ${s}."feed_outbox" ("criado_em") WHERE "publicado_em" IS NULL`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? 'feed';
    const s = `"${schema.replaceAll('"', '""')}"`;
    const [{ total }] = (await runner.query(
      `SELECT count(*)::int AS total FROM ${s}."feed_outbox" WHERE "publicado_em" IS NULL`,
    )) as { total: number }[];
    if (total)
      throw new Error(
        'Rollback recusado: há eventos do feed aguardando entrega.',
      );
    await runner.query(`DROP TABLE ${s}."feed_outbox"`);
  }
}
