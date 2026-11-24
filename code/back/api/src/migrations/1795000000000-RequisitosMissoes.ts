import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';
import {
  QUANTIDADE_MISSAO_MAX,
  REQUISITOS_MISSAO,
} from '../gamificacao/missoes/missoes.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export class RequisitosMissoes1795000000000 implements MigrationInterface {
  name = 'RequisitosMissoes1795000000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const u = schemaUsuarios(qr);
    const requisitos = REQUISITOS_MISSAO.map((r) => `'${r}'`).join(', ');

    await qr.query(
      `ALTER TABLE ${g}."missoes" ` +
        `ADD COLUMN "requisito" character varying(30), ` +
        `ADD COLUMN "quantidade" integer NOT NULL DEFAULT 1, ` +
        `ADD COLUMN "alvo_id" uuid, ` +
        `ADD COLUMN "codigo" character varying(20), ` +
        `ADD CONSTRAINT "ck_missoes_requisito" CHECK ("requisito" IS NULL OR "requisito" IN (${requisitos})), ` +
        `ADD CONSTRAINT "ck_missoes_quantidade" CHECK ("quantidade" BETWEEN 1 AND ${QUANTIDADE_MISSAO_MAX}), ` +
        `ADD CONSTRAINT "ck_missoes_requisito_alvo" CHECK (` +
        `("requisito" = 'EVENTO' AND "alvo_id" IS NOT NULL AND "quantidade" = 1 AND "tipo" = 'UNICA') ` +
        `OR ("requisito" = 'PUCSTOPS' AND "tipo" = 'UNICA' AND ("alvo_id" IS NULL OR "quantidade" = 1)) ` +
        `OR ("requisito" IS DISTINCT FROM 'EVENTO' AND "requisito" IS DISTINCT FROM 'PUCSTOPS' AND "alvo_id" IS NULL)), ` +
        `ADD CONSTRAINT "ck_missoes_requisito_codigo" CHECK (` +
        `("requisito" IN ('CODIGO', 'EVENTO') AND "codigo" IS NOT NULL AND "codigo" ~ '^[A-Z0-9-]{4,20}$' AND "quantidade" = 1) ` +
        `OR (("requisito" IS NULL OR "requisito" NOT IN ('CODIGO', 'EVENTO')) AND "codigo" IS NULL))`,
    );
    await qr.query(
      `UPDATE ${g}."missoes" SET "ativa" = false, "atualizado_em" = now() WHERE "requisito" IS NULL AND "ativa"`,
    );

    await qr.query(
      `ALTER TABLE ${g}."missoes_conclusoes" ADD COLUMN "evidencia" jsonb`,
    );

    await qr.query(
      `CREATE TABLE ${g}."missoes_tentativas_codigo" (` +
        `"id" bigserial NOT NULL, ` +
        `"missao_id" uuid NOT NULL, ` +
        `"usuario_id" integer NOT NULL, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_missoes_tentativas_codigo" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "fk_missoes_tentativas_missao" FOREIGN KEY ("missao_id") REFERENCES ${g}."missoes"("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "fk_missoes_tentativas_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE CASCADE)`,
    );
    await qr.query(
      `CREATE INDEX "idx_missoes_tentativas_codigo" ON ${g}."missoes_tentativas_codigo" ("usuario_id", "missao_id", "criado_em")`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(`DROP TABLE ${g}."missoes_tentativas_codigo"`);
    await qr.query(
      `ALTER TABLE ${g}."missoes_conclusoes" DROP COLUMN "evidencia"`,
    );
    await qr.query(
      `ALTER TABLE ${g}."missoes" ` +
        `DROP CONSTRAINT "ck_missoes_requisito_codigo", ` +
        `DROP CONSTRAINT "ck_missoes_requisito_alvo", ` +
        `DROP CONSTRAINT "ck_missoes_quantidade", ` +
        `DROP CONSTRAINT "ck_missoes_requisito", ` +
        `DROP COLUMN "codigo", DROP COLUMN "alvo_id", DROP COLUMN "quantidade", DROP COLUMN "requisito"`,
    );
  }
}
