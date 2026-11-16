import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BL-50 — XP acumulado separado das moedas, totens por ciclo e recompensas
 * limitadas. Evolui o ledger existente; nenhuma movimentação é apagada ou
 * reescrita.
 *
 * 1. `xp_movimentacoes` ganha `xp_quantidade` (efeito no XP) e `ciclo`. Linhas
 *    antigas ficam NULL e valem pela regra do tipo: RECOMPENSA (resgate e
 *    estorno) não mexe no XP; PUCSTOP_CLAIM, AJUSTE_ADMIN e MISSAO mexem no XP
 *    na mesma quantidade das moedas. O tipo MISSAO entra no CHECK.
 * 2. `xp_carteiras` ganha `xp_acumulado`, reconstruído do ledger (não copia o
 *    saldo: resgates não reduzem XP). `saldo` passa a ser o saldo de moedas.
 *    Um gatilho mantém `xp_acumulado` a cada INSERT no ledger, inclusive vindo
 *    de versões antigas do backend (que não conhecem a coluna).
 * 3. `pucstop_coletas` ganha `ciclo` (semestre da coleta) e `xp_configurado`
 *    (valor do totem na hora); `xp` passa a ser o efetivamente creditado
 *    (pode ser 0 quando o teto do ciclo já foi atingido — aí sem movimentação).
 *    A coleta única vira uma por usuário, totem e ciclo.
 * 4. `pucstops.xp` só aceita 10, 20, 30, 40 ou 50 (padrão 30). Valores fora
 *    disso são normalizados para a opção mais próxima (meio arredonda para
 *    cima), limitada a 10–50. Coletas já feitas não mudam.
 *
 * Linhas antigas são classificadas no semestre da própria data, no fuso de
 * Brasília. Revisar antes de executar no banco compartilhado.
 */
export class GamificacaoNiveisMoedasCiclos1794000000000 implements MigrationInterface {
  name = 'GamificacaoNiveisMoedasCiclos1794000000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = '"gamificacao"';
    const m = '"mapa"';
    const ciclo = (col: string) =>
      `(to_char(${col} AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '/' || ` +
      `CASE WHEN extract(month FROM ${col} AT TIME ZONE 'America/Sao_Paulo') <= 6 THEN '1' ELSE '2' END)`;

    // 1. Ledger: efeito no XP e ciclo (novas colunas; nenhuma linha alterada).
    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" ADD COLUMN "xp_quantidade" integer, ADD COLUMN "ciclo" varchar(20)`,
    );
    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" DROP CONSTRAINT "ck_xp_movimentacoes_tipo"`,
    );
    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" ADD CONSTRAINT "ck_xp_movimentacoes_tipo" ` +
        `CHECK ("tipo" IN ('PUCSTOP_CLAIM', 'RECOMPENSA', 'AJUSTE_ADMIN', 'MISSAO'))`,
    );
    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" ADD CONSTRAINT "ck_xp_movimentacoes_xp_recompensa" ` +
        `CHECK ("tipo" <> 'RECOMPENSA' OR COALESCE("xp_quantidade", 0) = 0)`,
    );

    // 2. XP acumulado reconstruído do histórico.
    const efeitoXp = `COALESCE(mv."xp_quantidade", CASE WHEN mv."tipo" = 'RECOMPENSA' THEN 0 ELSE mv."quantidade" END)`;
    const [negativo] = (await qr.query(
      `SELECT mv."usuario_id", sum(${efeitoXp})::int AS xp FROM ${g}."xp_movimentacoes" mv ` +
        `GROUP BY 1 HAVING sum(${efeitoXp}) < 0 LIMIT 1`,
    )) as Array<{ usuario_id: number; xp: number }>;
    if (negativo) {
      throw new Error(
        `Histórico inconsistente: usuário ${negativo.usuario_id} ficaria com XP ${negativo.xp}. ` +
          'Nada foi alterado; revise o ledger antes de migrar.',
      );
    }
    await qr.query(
      `ALTER TABLE ${g}."xp_carteiras" ADD COLUMN "xp_acumulado" integer NOT NULL DEFAULT 0, ` +
        `ADD CONSTRAINT "ck_xp_carteiras_xp_acumulado" CHECK ("xp_acumulado" >= 0)`,
    );
    await qr.query(
      `UPDATE ${g}."xp_carteiras" c SET "xp_acumulado" = s.xp FROM (` +
        `SELECT mv."usuario_id", sum(${efeitoXp})::int AS xp FROM ${g}."xp_movimentacoes" mv GROUP BY 1` +
        `) s WHERE s."usuario_id" = c."usuario_id"`,
    );
    // Mantém o XP a cada movimentação, venha de qualquer versão do backend.
    await qr.query(
      `CREATE FUNCTION ${g}."acumular_xp"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ ` +
        `DECLARE delta integer := COALESCE(NEW."xp_quantidade", CASE WHEN NEW."tipo" = 'RECOMPENSA' THEN 0 ELSE NEW."quantidade" END); ` +
        // UPDATE antes do INSERT: num INSERT ... ON CONFLICT o CHECK valeria
        // para a linha proposta e barraria um ajuste negativo legítimo.
        `BEGIN IF delta <> 0 THEN ` +
        `UPDATE "gamificacao"."xp_carteiras" SET "xp_acumulado" = "xp_acumulado" + delta WHERE "usuario_id" = NEW."usuario_id"; ` +
        `IF NOT FOUND THEN INSERT INTO "gamificacao"."xp_carteiras" ("usuario_id", "xp_acumulado") VALUES (NEW."usuario_id", delta); END IF; ` +
        `END IF; RETURN NEW; END $$`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_xp_movimentacoes_acumular_xp" AFTER INSERT ON ${g}."xp_movimentacoes" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${g}."acumular_xp"()`,
    );

    // 3. Coletas por ciclo. A tabela é só-inserção; o gatilho é suspenso só
    // nesta transação para preencher as colunas novas das linhas antigas.
    await qr.query(
      `ALTER TABLE ${g}."pucstop_coletas" ADD COLUMN "ciclo" varchar(20), ADD COLUMN "xp_configurado" integer`,
    );
    await qr.query(
      `ALTER TABLE ${g}."pucstop_coletas" DISABLE TRIGGER "tg_pucstop_coletas_somente_insercao"`,
    );
    await qr.query(
      `UPDATE ${g}."pucstop_coletas" SET "ciclo" = ${ciclo('"coletado_em"')}, "xp_configurado" = "xp"`,
    );
    await qr.query(
      `ALTER TABLE ${g}."pucstop_coletas" ENABLE TRIGGER "tg_pucstop_coletas_somente_insercao"`,
    );
    // DEFAULT do semestre corrente: versões antigas do backend continuam
    // inserindo coletas sem informar o ciclo.
    await qr.query(
      `ALTER TABLE ${g}."pucstop_coletas" ALTER COLUMN "ciclo" SET DEFAULT ${ciclo('now()')}, ` +
        `ALTER COLUMN "ciclo" SET NOT NULL, ALTER COLUMN "movimentacao_id" DROP NOT NULL`,
    );
    await qr.query(
      `ALTER TABLE ${g}."pucstop_coletas" DROP CONSTRAINT "ck_pucstop_coletas_xp", ` +
        `ADD CONSTRAINT "ck_pucstop_coletas_xp" CHECK ("xp" >= 0), ` +
        `ADD CONSTRAINT "ck_pucstop_coletas_xp_movimentacao" CHECK (("xp" = 0) = ("movimentacao_id" IS NULL)), ` +
        `ADD CONSTRAINT "ck_pucstop_coletas_xp_configurado" CHECK ("xp_configurado" IS NULL OR "xp" <= "xp_configurado"), ` +
        `DROP CONSTRAINT "uq_pucstop_coletas_usuario_pucstop", ` +
        `ADD CONSTRAINT "uq_pucstop_coletas_usuario_pucstop_ciclo" UNIQUE ("usuario_id", "pucstop_id", "ciclo")`,
    );
    await qr.query(
      `CREATE INDEX "idx_pucstop_coletas_usuario_ciclo" ON ${g}."pucstop_coletas" ("usuario_id", "ciclo")`,
    );

    // 4. Recompensa dos totens: só as opções permitidas.
    await qr.query(
      `UPDATE ${m}."pucstops" SET "xp" = LEAST(50, GREATEST(10, (round("xp" / 10.0) * 10)::int)), "atualizado_em" = now() ` +
        `WHERE "xp" NOT IN (10, 20, 30, 40, 50)`,
    );
    await qr.query(
      `ALTER TABLE ${m}."pucstops" DROP CONSTRAINT "ck_pucstops_xp", ` +
        `ADD CONSTRAINT "ck_pucstops_xp" CHECK ("xp" IN (10, 20, 30, 40, 50)), ` +
        `ALTER COLUMN "xp" SET DEFAULT 30`,
    );
  }

  /**
   * Volta o esquema. Recusa se já houver coletas repetidas em ciclos
   * diferentes ou coletas sem crédito (o esquema antigo não as representa).
   * Os valores normalizados dos totens não voltam.
   */
  async down(qr: QueryRunner): Promise<void> {
    const g = '"gamificacao"';
    const m = '"mapa"';
    const [{ total }] = (await qr.query(
      `SELECT (SELECT count(*) FROM (SELECT 1 FROM ${g}."pucstop_coletas" GROUP BY "usuario_id", "pucstop_id" HAVING count(*) > 1) r) + ` +
        `(SELECT count(*) FROM ${g}."pucstop_coletas" WHERE "movimentacao_id" IS NULL) + ` +
        `(SELECT count(*) FROM ${g}."xp_movimentacoes" WHERE "tipo" = 'MISSAO') AS total`,
    )) as Array<{ total: string }>;
    if (Number(total) > 0)
      throw new Error(
        'Rollback recusado: já existem coletas por ciclo, coletas sem crédito ou missões.',
      );
    await qr.query(
      `ALTER TABLE ${m}."pucstops" ALTER COLUMN "xp" DROP DEFAULT, DROP CONSTRAINT "ck_pucstops_xp", ` +
        `ADD CONSTRAINT "ck_pucstops_xp" CHECK ("xp" >= 1 AND "xp" <= 1000)`,
    );
    await qr.query(`DROP INDEX ${g}."idx_pucstop_coletas_usuario_ciclo"`);
    await qr.query(
      `ALTER TABLE ${g}."pucstop_coletas" DROP CONSTRAINT "uq_pucstop_coletas_usuario_pucstop_ciclo", ` +
        `ADD CONSTRAINT "uq_pucstop_coletas_usuario_pucstop" UNIQUE ("usuario_id", "pucstop_id"), ` +
        `DROP CONSTRAINT "ck_pucstop_coletas_xp_configurado", DROP CONSTRAINT "ck_pucstop_coletas_xp_movimentacao", ` +
        `DROP CONSTRAINT "ck_pucstop_coletas_xp", ADD CONSTRAINT "ck_pucstop_coletas_xp" CHECK ("xp" > 0), ` +
        `ALTER COLUMN "movimentacao_id" SET NOT NULL, DROP COLUMN "xp_configurado", DROP COLUMN "ciclo"`,
    );
    await qr.query(
      `DROP TRIGGER "tg_xp_movimentacoes_acumular_xp" ON ${g}."xp_movimentacoes"`,
    );
    await qr.query(`DROP FUNCTION ${g}."acumular_xp"()`);
    await qr.query(
      `ALTER TABLE ${g}."xp_carteiras" DROP CONSTRAINT "ck_xp_carteiras_xp_acumulado", DROP COLUMN "xp_acumulado"`,
    );
    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" DROP CONSTRAINT "ck_xp_movimentacoes_xp_recompensa", ` +
        `DROP CONSTRAINT "ck_xp_movimentacoes_tipo", ` +
        `ADD CONSTRAINT "ck_xp_movimentacoes_tipo" CHECK ("tipo" IN ('PUCSTOP_CLAIM', 'RECOMPENSA', 'AJUSTE_ADMIN')), ` +
        `DROP COLUMN "ciclo", DROP COLUMN "xp_quantidade"`,
    );
  }
}
