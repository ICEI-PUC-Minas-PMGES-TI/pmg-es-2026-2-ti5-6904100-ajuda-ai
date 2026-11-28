import type { MigrationInterface, QueryRunner } from 'typeorm';

function schemaDe(queryRunner: QueryRunner): string {
  const schema =
    (queryRunner.connection.options as { schema?: string }).schema ?? 'feed';
  return `"${schema.replaceAll('"', '""')}"`;
}

export class ChatMensagensImagem1795500000000 implements MigrationInterface {
  name = 'ChatMensagensImagem1795500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaDe(queryRunner);
    const schemaNome =
      (queryRunner.connection.options as { schema?: string }).schema ?? 'feed';
    const colunas = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns ` +
        `WHERE table_schema = $1 AND table_name = 'mensagens_chat'`,
      [schemaNome],
    )) as Array<{ column_name: string }>;
    if (colunas.some((coluna) => coluna.column_name === 'imagem_chave'))
      return;
    await queryRunner.query(
      `ALTER TABLE ${schema}."mensagens_chat" ` +
        `ADD COLUMN "imagem_chave" varchar(1024)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaDe(queryRunner);
    const schemaNome =
      (queryRunner.connection.options as { schema?: string }).schema ?? 'feed';
    const colunas = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns ` +
        `WHERE table_schema = $1 AND table_name = 'mensagens_chat'`,
      [schemaNome],
    )) as Array<{ column_name: string }>;
    if (!colunas.some((coluna) => coluna.column_name === 'imagem_chave'))
      return;
    const [{ imagens }] = (await queryRunner.query(
      `SELECT count(*)::int AS imagens FROM ${schema}."mensagens_chat" ` +
        `WHERE "imagem_chave" IS NOT NULL`,
    )) as Array<{ imagens: number }>;
    if (imagens)
      throw new Error(
        `Rollback recusado: ${imagens} mensagem(ns) possuem imagem.`,
      );
    await queryRunner.query(
      `ALTER TABLE ${schema}."mensagens_chat" DROP COLUMN "imagem_chave"`,
    );
  }
}
