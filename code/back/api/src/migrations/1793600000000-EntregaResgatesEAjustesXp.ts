import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  DESFECHOS_RESGATE,
  MOTIVO_CANCELAMENTO,
} from '../gamificacao/resgates/resgates.js';
import { MOTIVO_AJUSTE_XP } from '../gamificacao/xp/ajustes-xp.js';

const g = '"gamificacao"';
const lista = (valores: readonly string[]) =>
  valores.map((v) => `'${v}'`).join(', ');

/**
 * F29 e F26, só inserção (como o ledger e os resgates):
 *
 * - `resgate_desfechos`: entrega ou cancelamento de um resgate. No máximo um
 *   por resgate (UNIQUE), então não há dupla entrega nem duplo estorno. O
 *   cancelamento aponta a movimentação de estorno (também UNIQUE). Sem linha,
 *   o resgate está aguardando entrega.
 * - `xp_ajustes`: ajuste manual de XP pela coordenação, com motivo e
 *   responsável, ligado à movimentação `AJUSTE_ADMIN` do ledger.
 */
export class EntregaResgatesEAjustesXp1793600000000 implements MigrationInterface {
  name = 'EntregaResgatesEAjustesXp1793600000000';

  async up(qr: QueryRunner): Promise<void> {
    const schema =
      (qr.connection.options as { schema?: string }).schema ?? 'feed';
    const u = `"${schema.replaceAll('"', '""')}"`;

    await qr.query(
      `CREATE TABLE ${g}."resgate_desfechos" (` +
        `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `"resgate_id" uuid NOT NULL, ` +
        `"tipo" character varying(16) NOT NULL, ` +
        `"motivo" text, ` +
        `"movimentacao_estorno_id" bigint, ` +
        `"responsavel_id" integer, ` +
        `"responsavel_email" character varying(254), ` +
        `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "uq_resgate_desfechos_resgate" UNIQUE ("resgate_id"), ` +
        `CONSTRAINT "uq_resgate_desfechos_estorno" UNIQUE ("movimentacao_estorno_id"), ` +
        `CONSTRAINT "fk_resgate_desfechos_resgate" FOREIGN KEY ("resgate_id") REFERENCES ${g}."resgates"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_resgate_desfechos_estorno" FOREIGN KEY ("movimentacao_estorno_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_resgate_desfechos_responsavel" FOREIGN KEY ("responsavel_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_resgate_desfechos_tipo" CHECK ("tipo" IN (${lista(DESFECHOS_RESGATE)})), ` +
        // Cancelar exige motivo e estorno; entregar não tem nenhum dos dois.
        `CONSTRAINT "ck_resgate_desfechos_cancelamento" CHECK (("tipo" = 'cancelado') = ("motivo" IS NOT NULL AND "movimentacao_estorno_id" IS NOT NULL)), ` +
        `CONSTRAINT "ck_resgate_desfechos_entrega" CHECK ("tipo" = 'cancelado' OR ("motivo" IS NULL AND "movimentacao_estorno_id" IS NULL)), ` +
        `CONSTRAINT "ck_resgate_desfechos_motivo" CHECK ("motivo" IS NULL OR char_length(btrim("motivo")) BETWEEN ${MOTIVO_CANCELAMENTO.min} AND ${MOTIVO_CANCELAMENTO.max}), ` +
        `CONSTRAINT "ck_resgate_desfechos_responsavel" CHECK ("responsavel_id" IS NOT NULL OR "responsavel_email" IS NOT NULL))`,
    );

    await qr.query(
      `CREATE TABLE ${g}."xp_ajustes" (` +
        `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `"usuario_id" integer NOT NULL, ` +
        `"movimentacao_id" bigint NOT NULL, ` +
        `"quantidade" integer NOT NULL, ` +
        `"motivo" text NOT NULL, ` +
        `"chave_idempotencia" uuid NOT NULL, ` +
        `"responsavel_id" integer, ` +
        `"responsavel_email" character varying(254), ` +
        `"criado_em" timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "uq_xp_ajustes_movimentacao" UNIQUE ("movimentacao_id"), ` +
        `CONSTRAINT "uq_xp_ajustes_chave" UNIQUE ("chave_idempotencia"), ` +
        `CONSTRAINT "fk_xp_ajustes_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_xp_ajustes_movimentacao" FOREIGN KEY ("movimentacao_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_xp_ajustes_responsavel" FOREIGN KEY ("responsavel_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_xp_ajustes_quantidade" CHECK ("quantidade" <> 0), ` +
        `CONSTRAINT "ck_xp_ajustes_motivo" CHECK (char_length(btrim("motivo")) BETWEEN ${MOTIVO_AJUSTE_XP.min} AND ${MOTIVO_AJUSTE_XP.max}), ` +
        `CONSTRAINT "ck_xp_ajustes_responsavel" CHECK ("responsavel_id" IS NOT NULL OR "responsavel_email" IS NOT NULL))`,
    );
    await qr.query(
      `CREATE INDEX "idx_xp_ajustes_usuario" ON ${g}."xp_ajustes" ("usuario_id", "criado_em" DESC)`,
    );

    for (const tabela of ['resgate_desfechos', 'xp_ajustes']) {
      await qr.query(
        `CREATE TRIGGER "tg_${tabela}_somente_insercao" BEFORE UPDATE OR DELETE ON ${g}."${tabela}" ` +
          `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
      );
      await qr.query(
        `CREATE TRIGGER "tg_${tabela}_sem_truncate" BEFORE TRUNCATE ON ${g}."${tabela}" ` +
          `FOR EACH STATEMENT EXECUTE FUNCTION ${g}."somente_insercao"()`,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const [linha] = (await qr.query(
      `SELECT (SELECT count(*)::int FROM ${g}."resgate_desfechos") + ` +
        `(SELECT count(*)::int FROM ${g}."xp_ajustes") AS total`,
    )) as Array<{ total: number }>;
    if (linha.total > 0) {
      throw new Error(
        `Rollback recusado: ${linha.total} entrega(s), cancelamento(s) ou ajuste(s) de XP seriam descartados.`,
      );
    }
    await qr.query(`DROP TABLE ${g}."xp_ajustes"`);
    await qr.query(`DROP TABLE ${g}."resgate_desfechos"`);
  }
}
