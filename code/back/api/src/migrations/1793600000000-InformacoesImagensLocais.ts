import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conteúdo editorial ligado à chave estável do prédio, não ao UUID da versão
 * importada do mapa. Assim uma nova versão do campus não perde descrição nem
 * imagens dos locais já conhecidos.
 */
export class InformacoesImagensLocais1793600000000 implements MigrationInterface {
  name = 'InformacoesImagensLocais1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "mapa"."local_informacoes" (` +
        `"local_id" character varying(160) PRIMARY KEY, ` +
        `"descricao" text NOT NULL DEFAULT '', ` +
        `"atualizado_por" integer, ` +
        `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
        `"atualizado_em" timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "ck_local_info_descricao" CHECK (char_length("descricao") <= 10000)` +
        `)`,
    );
    await queryRunner.query(
      `CREATE TABLE "mapa"."local_imagens" (` +
        `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `"local_id" character varying(160) NOT NULL, ` +
        `"arquivo" character varying(1024) NOT NULL UNIQUE, ` +
        `"tipo_conteudo" character varying(40) NOT NULL, ` +
        `"tamanho_bytes" integer NOT NULL, ` +
        `"ordem" integer NOT NULL DEFAULT 0, ` +
        `"criado_por" integer, ` +
        `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "fk_local_imagens_info" FOREIGN KEY ("local_id") REFERENCES "mapa"."local_informacoes"("local_id") ON DELETE CASCADE, ` +
        `CONSTRAINT "ck_local_imagem_tipo" CHECK ("tipo_conteudo" IN ('image/png','image/jpeg','image/webp')), ` +
        `CONSTRAINT "ck_local_imagem_tamanho" CHECK ("tamanho_bytes" > 0 AND "tamanho_bytes" <= 10485760), ` +
        `CONSTRAINT "ck_local_imagem_ordem" CHECK ("ordem" >= 0)` +
        `)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_local_imagens_local_ordem" ON "mapa"."local_imagens" ("local_id", "ordem", "criado_em")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [{ total }] = (await queryRunner.query(
      `SELECT (SELECT count(*)::int FROM "mapa"."local_informacoes" ` +
        `WHERE "descricao" <> '') + (SELECT count(*)::int FROM "mapa"."local_imagens") AS total`,
    )) as Array<{ total: number }>;
    if (total > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${total} descrição(ões)/imagem(ns) de locais seriam apagadas ` +
          '(os arquivos continuariam no Object Storage). Faça backup e rode com ' +
          'MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await queryRunner.query(`DROP TABLE "mapa"."local_imagens"`);
    await queryRunner.query(`DROP TABLE "mapa"."local_informacoes"`);
  }
}
