import type { MigrationInterface, QueryRunner } from 'typeorm';
import { FUNCIONALIDADES_DELEGAVEIS } from '../coordenacao/delegacoes/delegacoes.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const lista = FUNCIONALIDADES_DELEGAVEIS.map((f) => `'${f}'`).join(', ');

export class CriaDelegacoes1795500000000 implements MigrationInterface {
  name = 'CriaDelegacoes1795500000000';

  async up(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr);
    await qr.query(`
      CREATE TABLE ${u}."delegacoes" (
        "id" SERIAL NOT NULL,
        "usuario_id" integer NOT NULL,
        "funcionalidade" character varying(20) NOT NULL,
        "concedido_por" character varying(120) NOT NULL,
        "concedido_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "revogado_por" character varying(120),
        "revogado_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_delegacoes" PRIMARY KEY ("id"),
        CONSTRAINT "ck_delegacoes_funcionalidade"
          CHECK ("funcionalidade" IN (${lista})),
        CONSTRAINT "ck_delegacoes_revogacao"
          CHECK (("revogado_em" IS NULL) = ("revogado_por" IS NULL)),
        CONSTRAINT "fk_delegacoes_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await qr.query(
      `CREATE UNIQUE INDEX "uq_delegacao_ativa" ON ${u}."delegacoes" ` +
        `("usuario_id", "funcionalidade") WHERE "revogado_em" IS NULL`,
    );
    await qr.query(
      `CREATE INDEX "idx_delegacoes_usuario" ON ${u}."delegacoes" ("usuario_id")`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr);
    const [{ total }] = (await qr.query(
      `SELECT count(*)::int AS total FROM ${u}."delegacoes"`,
    )) as Array<{ total: number }>;
    if (total > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        'Rollback recusado: o histórico de delegações seria descartado.',
      );
    }
    await qr.query(`DROP TABLE ${u}."delegacoes"`);
  }
}
