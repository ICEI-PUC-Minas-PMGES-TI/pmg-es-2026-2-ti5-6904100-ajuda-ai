import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Revisar antes de executar no banco compartilhado. Não executa automaticamente. */
export class ThreadsComentariosFeed1793400000000 implements MigrationInterface {
  name = 'ThreadsComentariosFeed1793400000000';
  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? 'feed';
    const s = `"${schema.replaceAll('"', '""')}"`;
    await runner.query(`ALTER TABLE ${s}.comentarios ADD COLUMN pai_id integer,
      ADD CONSTRAINT fk_comentario_pai FOREIGN KEY (pai_id) REFERENCES ${s}.comentarios(id) ON DELETE CASCADE,
      ADD CONSTRAINT ck_comentario_pai CHECK (pai_id IS NULL OR pai_id <> id)`);
    await runner.query(
      `CREATE INDEX idx_comentario_thread ON ${s}.comentarios(publicacao_id, pai_id)`,
    );
    await runner.query(`CREATE TABLE ${s}.curtidas_comentarios (
      id SERIAL PRIMARY KEY, comentario_id integer NOT NULL,
      usuario_id varchar(100) NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_curtida_comentario UNIQUE (comentario_id, usuario_id),
      CONSTRAINT fk_curtida_comentario FOREIGN KEY (comentario_id) REFERENCES ${s}.comentarios(id) ON DELETE CASCADE
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? 'feed';
    const s = `"${schema.replaceAll('"', '""')}"`;
    const [{ total }] = (await runner.query(`SELECT (
      (SELECT count(*) FROM ${s}.curtidas_comentarios) +
      (SELECT count(*) FROM ${s}.comentarios WHERE pai_id IS NOT NULL)
    )::int AS total`)) as { total: number }[];
    if (total)
      throw new Error(
        'Rollback recusado: existem respostas ou curtidas de comentários.',
      );
    await runner.query(`DROP TABLE ${s}.curtidas_comentarios`);
    await runner.query(`DROP INDEX ${s}.idx_comentario_thread`);
    await runner.query(`ALTER TABLE ${s}.comentarios DROP CONSTRAINT ck_comentario_pai,
      DROP CONSTRAINT fk_comentario_pai, DROP COLUMN pai_id`);
  }
}
