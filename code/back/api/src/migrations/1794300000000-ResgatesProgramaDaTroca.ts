import type { MigrationInterface, QueryRunner } from 'typeorm';
import { sqlCicloDe } from '../gamificacao/economia.js';

const g = '"gamificacao"';

/**
 * F29: "resgates do programa" passa a ser uma regra estável, gravada na
 * troca, em vez de depender do catálogo atual (`recompensas.programa_codigo`,
 * que a coordenação pode editar e que é NULL nas recompensas abertas a todos).
 *
 * - `resgates.programa_codigo`: programa (ciclo) em que a troca foi feita.
 *   A lojinha grava na inserção: o programa da recompensa restrita ou, se a
 *   recompensa é aberta, o da participação ativa do aluno. Nunca muda depois.
 * - `resgates.programa_inferido`: `true` nos registros anteriores a esta
 *   regra, preenchidos aqui com a melhor evidência disponível. A tela mostra
 *   que o programa desses resgates foi inferido.
 *
 * Preenchimento dos legados, nesta ordem:
 * 1. recompensa hoje restrita a um programa: esse programa (o histórico de
 *    versões não guardava o programa; é a melhor evidência que existe);
 * 2. senão, a participação do aluno criada até a troca, preferindo a do
 *    semestre da troca, em um programa existente;
 * 3. senão, fica NULL ("sem programa identificado", filtro `semPrograma`).
 *
 * `resgates` é só-inserção: o gatilho é suspenso apenas nesta transação para
 * o preenchimento (mesmo procedimento da 1794000000000).
 *
 * FK `ON UPDATE/DELETE RESTRICT`: com o gatilho de só-inserção, um CASCADE
 * falharia de qualquer jeito; RESTRICT dá o erro certo (excluir programa com
 * resgates já vira 409 em `ProgramasService`).
 */
export class ResgatesProgramaDaTroca1794300000000 implements MigrationInterface {
  name = 'ResgatesProgramaDaTroca1794300000000';

  async up(qr: QueryRunner): Promise<void> {
    const schema =
      (qr.connection.options as { schema?: string }).schema ?? 'feed';
    const u = `"${schema.replaceAll('"', '""')}"`;

    await qr.query(
      `ALTER TABLE ${g}."resgates" ADD COLUMN "programa_codigo" varchar(20), ` +
        `ADD COLUMN "programa_inferido" boolean NOT NULL DEFAULT false`,
    );

    await qr.query(
      `ALTER TABLE ${g}."resgates" DISABLE TRIGGER "tg_resgates_somente_insercao"`,
    );
    await qr.query(
      `UPDATE ${g}."resgates" r SET "programa_codigo" = x."codigo", "programa_inferido" = true ` +
        `FROM (` +
        `SELECT s."id", COALESCE(c."programa_codigo", (` +
        `SELECT p."programa" FROM ${u}."participacoes" p ` +
        `JOIN ${u}."programas" pr ON pr."codigo" = p."programa" ` +
        `WHERE p."usuario_id" IN (s."usuario_id"::text, us."email") ` +
        `AND p."criado_em" <= s."criado_em" ` +
        `AND p."status" IN ('aprovado', 'em_andamento', 'concluido') ` +
        `ORDER BY (p."programa" = ${sqlCicloDe('s."criado_em"')}) DESC, p."criado_em" DESC, p."id" DESC LIMIT 1` +
        `)) AS "codigo" ` +
        `FROM ${g}."resgates" s ` +
        `JOIN ${g}."recompensas" c ON c."id" = s."recompensa_id" ` +
        `JOIN ${u}."usuarios" us ON us."id" = s."usuario_id"` +
        `) x WHERE x."id" = r."id" AND x."codigo" IS NOT NULL`,
    );
    await qr.query(
      `ALTER TABLE ${g}."resgates" ENABLE TRIGGER "tg_resgates_somente_insercao"`,
    );

    await qr.query(
      `ALTER TABLE ${g}."resgates" ADD CONSTRAINT "fk_resgates_programa" ` +
        `FOREIGN KEY ("programa_codigo") REFERENCES ${u}."programas"("codigo") ` +
        `ON UPDATE RESTRICT ON DELETE RESTRICT`,
    );
    // Só um registro preenchido pela migration pode ser "inferido".
    await qr.query(
      `ALTER TABLE ${g}."resgates" ADD CONSTRAINT "ck_resgates_programa_inferido" ` +
        `CHECK (NOT "programa_inferido" OR "programa_codigo" IS NOT NULL)`,
    );
    // Fila da coordenação: keyset (criado_em DESC, id DESC), com e sem programa.
    await qr.query(
      `CREATE INDEX "idx_resgates_fila" ON ${g}."resgates" ("criado_em" DESC, "id" DESC)`,
    );
    await qr.query(
      `CREATE INDEX "idx_resgates_programa_fila" ON ${g}."resgates" ("programa_codigo", "criado_em" DESC, "id" DESC)`,
    );
  }

  /**
   * Recusa se houver resgates com programa gravado na troca: descartar a
   * coluna perderia um dado que não pode ser reconstruído.
   */
  async down(qr: QueryRunner): Promise<void> {
    const [linha] = (await qr.query(
      `SELECT count(*)::int AS total FROM ${g}."resgates" ` +
        `WHERE "programa_codigo" IS NOT NULL AND NOT "programa_inferido"`,
    )) as Array<{ total: number }>;
    if (linha.total > 0) {
      throw new Error(
        `Rollback recusado: ${linha.total} resgate(s) têm o programa gravado na troca e o dado seria perdido.`,
      );
    }
    await qr.query(`DROP INDEX ${g}."idx_resgates_programa_fila"`);
    await qr.query(`DROP INDEX ${g}."idx_resgates_fila"`);
    await qr.query(
      `ALTER TABLE ${g}."resgates" DROP CONSTRAINT "ck_resgates_programa_inferido", ` +
        `DROP CONSTRAINT "fk_resgates_programa", ` +
        `DROP COLUMN "programa_inferido", DROP COLUMN "programa_codigo"`,
    );
  }
}
