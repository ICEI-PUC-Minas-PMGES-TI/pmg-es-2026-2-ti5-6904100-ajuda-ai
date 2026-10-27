import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Catálogo mínimo e resgates; o ledger de XP continua sendo a fonte do saldo. */
export class LojinhaResgates1792800000000 implements MigrationInterface {
  name = 'LojinhaResgates1792800000000';

  async up(qr: QueryRunner): Promise<void> {
    const schema =
      (qr.connection.options as { schema?: string }).schema ?? 'feed';
    const u = `"${schema.replaceAll('"', '""')}"`;
    const g = '"gamificacao"';
    await qr.query(
      `CREATE TABLE ${g}."recompensas" (` +
        `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `"nome" varchar(120) NOT NULL, "descricao" text NOT NULL, ` +
        `"custo_xp" integer NOT NULL, "estoque" integer, ` +
        `"condicoes_retirada" text NOT NULL, "publicada" boolean NOT NULL DEFAULT false, ` +
        `"criada_em" timestamptz NOT NULL DEFAULT now(), ` +
        `"atualizada_em" timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "ck_recompensa_nome" CHECK (btrim("nome") <> ''), ` +
        `CONSTRAINT "ck_recompensa_descricao" CHECK (btrim("descricao") <> ''), ` +
        `CONSTRAINT "ck_recompensa_custo" CHECK ("custo_xp" > 0), ` +
        `CONSTRAINT "ck_recompensa_estoque" CHECK ("estoque" IS NULL OR "estoque" >= 0))`,
    );
    await qr.query(
      `CREATE TABLE ${g}."resgates" (` +
        `"id" uuid PRIMARY KEY, "usuario_id" integer NOT NULL, ` +
        `"recompensa_id" uuid NOT NULL, "movimentacao_id" bigint NOT NULL, ` +
        `"chave_idempotencia" uuid NOT NULL, "nome" varchar(120) NOT NULL, "descricao" text NOT NULL, ` +
        `"custo_xp" integer NOT NULL, "condicoes_retirada" text NOT NULL, ` +
        `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "fk_resgate_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_resgate_recompensa" FOREIGN KEY ("recompensa_id") REFERENCES ${g}."recompensas"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_resgate_movimentacao" FOREIGN KEY ("movimentacao_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "uq_resgate_movimentacao" UNIQUE ("movimentacao_id"), ` +
        `CONSTRAINT "uq_resgate_idempotencia" UNIQUE ("usuario_id", "chave_idempotencia"), ` +
        `CONSTRAINT "ck_resgate_custo" CHECK ("custo_xp" > 0))`,
    );
    await qr.query(
      `CREATE INDEX "idx_resgates_usuario" ON ${g}."resgates" ("usuario_id", "criado_em" DESC)`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_resgates_somente_insercao" BEFORE UPDATE OR DELETE ON ${g}."resgates" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_resgates_sem_truncate" BEFORE TRUNCATE ON ${g}."resgates" ` +
        `FOR EACH STATEMENT EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = '"gamificacao"';
    const [row] = (await qr.query(
      `SELECT count(*)::int AS total FROM ${g}."resgates"`,
    )) as Array<{ total: number }>;
    if (row.total > 0)
      throw new Error('Rollback recusado: há resgates registrados.');
    await qr.query(`DROP TABLE ${g}."resgates"`);
    await qr.query(`DROP TABLE ${g}."recompensas"`);
  }
}
