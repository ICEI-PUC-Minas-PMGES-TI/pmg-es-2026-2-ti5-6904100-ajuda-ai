import type { MigrationInterface, QueryRunner } from 'typeorm';
import { schemaUsuarios } from '../gamificacao/gamificacao.js';

export class HistoricoDosEncontros1795800000000 implements MigrationInterface {
  name = 'HistoricoDosEncontros1795800000000';

  async up(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr.connection);
    await qr.query(`
      CREATE TABLE ${u}."encontro_alteracoes" (
        "id" SERIAL NOT NULL,
        "encontro_id" uuid NOT NULL,
        "tipo" character varying(20) NOT NULL,
        "autor_id" integer NOT NULL,
        "anterior" jsonb NOT NULL,
        "novo" jsonb,
        "respostas_anteriores" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_encontro_alteracoes" PRIMARY KEY ("id"),
        CONSTRAINT "ck_encontro_alteracoes_tipo"
          CHECK ("tipo" IN ('remarcacao', 'edicao', 'cancelamento')),
        CONSTRAINT "ck_encontro_alteracoes_novo"
          CHECK (("tipo" = 'cancelamento') = ("novo" IS NULL)),
        CONSTRAINT "fk_encontro_alteracoes_encontro" FOREIGN KEY ("encontro_id")
          REFERENCES ${u}."encontros"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_encontro_alteracoes_autor" FOREIGN KEY ("autor_id")
          REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await qr.query(
      `CREATE INDEX "idx_encontro_alteracoes_encontro" ON ${u}."encontro_alteracoes" ("encontro_id", "criado_em")`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr.connection);
    const [{ usados }] = (await qr.query(
      `SELECT EXISTS (SELECT 1 FROM ${u}."encontro_alteracoes") AS usados`,
    )) as Array<{ usados: boolean }>;
    if (usados && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        'Rollback recusado: o histórico de alterações dos encontros seria descartado.',
      );
    }
    await qr.query(`DROP TABLE ${u}."encontro_alteracoes"`);
  }
}
