import type { MigrationInterface, QueryRunner } from 'typeorm';

function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export class ChatTempoRealImagens1793900000000 implements MigrationInterface {
  name = 'ChatTempoRealImagens1793900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaDe(queryRunner);
    const schemaNome =
      (queryRunner.connection.options as { schema?: string }).schema ?? 'feed';
    const colunas = (await queryRunner.query(
      `SELECT table_name, column_name FROM information_schema.columns ` +
        `WHERE table_schema = $1 AND ((table_name = 'mensagens_chat' AND column_name = 'imagem_chave') ` +
        `OR (table_name = 'chat_outbox'))`,
      [schemaNome],
    )) as Array<{ table_name: string; column_name: string }>;
    const imagemExiste = colunas.some(
      (coluna) =>
        coluna.table_name === 'mensagens_chat' &&
        coluna.column_name === 'imagem_chave',
    );
    const colunasOutbox = colunas
      .filter((coluna) => coluna.table_name === 'chat_outbox')
      .map((coluna) => coluna.column_name);
    const esperadasOutbox = ['id', 'evento', 'publicado_em', 'criado_em'];
    const outboxExiste = colunasOutbox.length > 0;
    if (imagemExiste && outboxExiste) {
      const ausentes = esperadasOutbox.filter(
        (coluna) => !colunasOutbox.includes(coluna),
      );
      if (ausentes.length)
        throw new Error(
          `ChatTempoRealImagens recusada: colunas ausentes em chat_outbox: ${ausentes.join(', ')}.`,
        );
      return;
    }
    if (imagemExiste || outboxExiste)
      throw new Error(
        'ChatTempoRealImagens recusada: estado parcial (imagem_chave ou chat_outbox já existe).',
      );
    await queryRunner.query(
      `ALTER TABLE ${schema}."mensagens_chat" ` +
        `ADD COLUMN "imagem_chave" varchar(1024)`,
    );
    await queryRunner.query(`
      CREATE TABLE ${schema}."chat_outbox" (
        "id" uuid NOT NULL,
        "evento" jsonb NOT NULL,
        "publicado_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_chat_outbox" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_chat_outbox_pendente" ON ${schema}."chat_outbox" ("criado_em") WHERE "publicado_em" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaDe(queryRunner);
    const [{ pendentes, imagens }] = (await queryRunner.query(
      `SELECT ` +
        `(SELECT count(*) FROM ${schema}."chat_outbox" WHERE "publicado_em" IS NULL)::int AS pendentes, ` +
        `(SELECT count(*) FROM ${schema}."mensagens_chat" WHERE "imagem_chave" IS NOT NULL)::int AS imagens`,
    )) as Array<{ pendentes: number; imagens: number }>;
    if (pendentes || imagens)
      throw new Error(
        `Rollback recusado: ${pendentes} evento(s) de mensagem aguardam entrega e ${imagens} mensagem(ns) possuem imagem.`,
      );
    await queryRunner.query(`DROP TABLE ${schema}."chat_outbox"`);
    await queryRunner.query(
      `ALTER TABLE ${schema}."mensagens_chat" DROP COLUMN "imagem_chave"`,
    );
  }
}
