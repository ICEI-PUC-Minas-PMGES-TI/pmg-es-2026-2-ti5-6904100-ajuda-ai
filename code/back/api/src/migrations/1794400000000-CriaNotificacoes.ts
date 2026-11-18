import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CHAVE_NOTIFICACAO_MAX,
  LINK_NOTIFICACAO_MAX,
  MENSAGEM_NOTIFICACAO_MAX,
  TIPOS_NOTIFICACAO,
  TITULO_NOTIFICACAO_MAX,
} from '../notificacoes/notificacoes.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export class CriaNotificacoes1794400000000 implements MigrationInterface {
  name = 'CriaNotificacoes1794400000000';

  async up(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr);
    const tipos = TIPOS_NOTIFICACAO.map((t) => `'${t}'`).join(', ');
    await qr.query(
      `CREATE TABLE ${u}."notificacoes" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"usuario_id" integer NOT NULL, ` +
        `"tipo" character varying(30) NOT NULL, ` +
        `"titulo" character varying(${TITULO_NOTIFICACAO_MAX}) NOT NULL, ` +
        `"mensagem" character varying(${MENSAGEM_NOTIFICACAO_MAX}) NOT NULL, ` +
        `"link" character varying(${LINK_NOTIFICACAO_MAX}), ` +
        `"chave" character varying(${CHAVE_NOTIFICACAO_MAX}) NOT NULL, ` +
        `"lida_em" TIMESTAMP WITH TIME ZONE, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_notificacoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_notificacoes_usuario_chave" UNIQUE ("usuario_id", "chave"), ` +
        `CONSTRAINT "fk_notificacoes_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "ck_notificacoes_tipo" CHECK ("tipo" IN (${tipos})))`,
    );
    await qr.query(
      `CREATE INDEX "idx_notificacoes_usuario_lida" ON ${u}."notificacoes" ("usuario_id", "lida_em")`,
    );
    await qr.query(
      `CREATE INDEX "idx_notificacoes_usuario_criado" ON ${u}."notificacoes" ("usuario_id", "criado_em" DESC)`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE ${schemaUsuarios(qr)}."notificacoes"`);
  }
}
