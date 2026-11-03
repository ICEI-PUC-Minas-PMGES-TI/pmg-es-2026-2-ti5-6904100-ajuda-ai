import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';
import {
  CONDICOES_RETIRADA_MAX,
  CUSTO_XP_RECOMPENSA,
  DESCRICAO_RECOMPENSA_MAX,
  ESTOQUE_MAX,
  IMAGEM_URL_MAX,
  LIMITE_POR_ALUNO,
  MOTIVO_ESTOQUE,
  PUBLICOS_RECOMPENSA,
  STATUS_RECOMPENSA,
  TIPOS_AJUSTE_ESTOQUE,
} from '../gamificacao/recompensas/recompensas.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const lista = (valores: readonly string[]) =>
  valores.map((v) => `'${v}'`).join(', ');

export const TABELAS_LOJINHA = [
  'recompensas',
  'recompensa_versoes',
  'recompensa_estoque_ajustes',
  'resgates',
] as const;

export class LojinhaRecompensas1792900000000 implements MigrationInterface {
  name = 'LojinhaRecompensas1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const u = schemaUsuarios(queryRunner);
    const r = `${g}."recompensas"`;
    const q = (sql: string) => queryRunner.query(sql);

    await q(`ALTER TABLE ${r} RENAME COLUMN "criada_em" TO "criado_em"`);
    await q(
      `ALTER TABLE ${r} RENAME COLUMN "atualizada_em" TO "atualizado_em"`,
    );
    await q(
      `ALTER TABLE ${r} ` +
        `ADD "imagem_url" character varying(${IMAGEM_URL_MAX}), ` +
        `ADD "estoque_ilimitado" boolean, ` +
        `ADD "estoque_total" integer, ` +
        `ADD "estoque_comprometido" integer NOT NULL DEFAULT 0, ` +
        `ADD "limite_por_aluno" integer, ` +
        `ADD "publico" character varying(16) NOT NULL DEFAULT 'todos', ` +
        `ADD "programa_codigo" character varying(20), ` +
        `ADD "disponivel_de" TIMESTAMP WITH TIME ZONE, ` +
        `ADD "disponivel_ate" TIMESTAMP WITH TIME ZONE, ` +
        `ADD "status" character varying(16) NOT NULL DEFAULT 'rascunho', ` +
        `ADD "versao" integer NOT NULL DEFAULT 1, ` +
        `ADD "criado_por" integer, ` +
        `ADD "criado_por_email" character varying(254), ` +
        `ADD "publicado_em" TIMESTAMP WITH TIME ZONE, ` +
        `ADD "arquivado_em" TIMESTAMP WITH TIME ZONE`,
    );
    await q(
      `UPDATE ${r} x SET ` +
        `"estoque_comprometido" = c.n, ` +
        `"estoque_ilimitado" = x."estoque" IS NULL, ` +
        `"estoque_total" = CASE WHEN x."estoque" IS NULL THEN NULL ELSE x."estoque" + c.n END, ` +
        `"status" = CASE WHEN x."publicada" THEN 'publicada' ELSE 'rascunho' END, ` +
        `"publicado_em" = CASE WHEN x."publicada" THEN x."atualizado_em" END ` +
        `FROM (SELECT y."id", (SELECT count(*)::int FROM ${g}."resgates" s WHERE s."recompensa_id" = y."id") AS n ` +
        `FROM ${r} y) c WHERE c."id" = x."id"`,
    );
    await q(
      `ALTER TABLE ${r} ALTER "estoque_ilimitado" SET NOT NULL, ` +
        `DROP CONSTRAINT "ck_recompensa_estoque", DROP COLUMN "estoque", DROP COLUMN "publicada", ` +
        `ALTER "descricao" TYPE character varying(${DESCRICAO_RECOMPENSA_MAX}), ` +
        `ALTER "condicoes_retirada" TYPE character varying(${CONDICOES_RETIRADA_MAX}), ` +
        `ADD CONSTRAINT "fk_recompensas_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `ADD CONSTRAINT "ck_recompensas_condicoes" CHECK (btrim("condicoes_retirada") <> ''), ` +
        `ADD CONSTRAINT "ck_recompensas_imagem" CHECK ("imagem_url" IS NULL OR "imagem_url" ~* '^https://'), ` +
        `ADD CONSTRAINT "ck_recompensas_comprometido" CHECK ("estoque_comprometido" >= 0), ` +
        `ADD CONSTRAINT "ck_recompensas_estoque" CHECK (` +
        `("estoque_ilimitado" AND "estoque_total" IS NULL) OR ` +
        `(NOT "estoque_ilimitado" AND "estoque_total" IS NOT NULL AND "estoque_total" >= "estoque_comprometido")), ` +
        `ADD CONSTRAINT "ck_recompensas_limite" CHECK ("limite_por_aluno" IS NULL OR ("limite_por_aluno" >= ${LIMITE_POR_ALUNO.min} AND "limite_por_aluno" <= ${LIMITE_POR_ALUNO.max})), ` +
        `ADD CONSTRAINT "ck_recompensas_publico" CHECK ("publico" IN (${lista(PUBLICOS_RECOMPENSA)})), ` +
        `ADD CONSTRAINT "ck_recompensas_status" CHECK ("status" IN (${lista(STATUS_RECOMPENSA)})), ` +
        `ADD CONSTRAINT "ck_recompensas_vigencia" CHECK ("disponivel_de" IS NULL OR "disponivel_ate" IS NULL OR "disponivel_de" < "disponivel_ate"), ` +
        `ADD CONSTRAINT "ck_recompensas_versao" CHECK ("versao" >= 1), ` +
        `ADD CONSTRAINT "ck_recompensas_arquivada" CHECK (("status" = 'arquivada') = ("arquivado_em" IS NOT NULL))`,
    );
    await q(`CREATE INDEX "idx_recompensas_status" ON ${r} ("status", "nome")`);

    await q(
      `CREATE TABLE ${g}."recompensa_versoes" (` +
        `"id" bigint GENERATED ALWAYS AS IDENTITY, ` +
        `"recompensa_id" uuid NOT NULL, ` +
        `"versao" integer NOT NULL, ` +
        `"nome" character varying(120) NOT NULL, ` +
        `"descricao" character varying(${DESCRICAO_RECOMPENSA_MAX}) NOT NULL, ` +
        `"imagem_url" character varying(${IMAGEM_URL_MAX}), ` +
        `"custo_xp" integer NOT NULL, ` +
        `"condicoes_retirada" character varying(${CONDICOES_RETIRADA_MAX}) NOT NULL, ` +
        `"criado_por" integer, ` +
        `"criado_por_email" character varying(254), ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_recompensa_versoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_recompensa_versoes" UNIQUE ("recompensa_id", "versao"), ` +
        `CONSTRAINT "fk_recompensa_versoes_recompensa" FOREIGN KEY ("recompensa_id") REFERENCES ${r}("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "fk_recompensa_versoes_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_recompensa_versoes_custo" CHECK ("custo_xp" > 0))`,
    );
    await q(
      `INSERT INTO ${g}."recompensa_versoes" ("recompensa_id", "versao", "nome", "descricao", "imagem_url", "custo_xp", "condicoes_retirada", "criado_por_email", "criado_em") ` +
        `SELECT "id", 1, "nome", "descricao", NULL, "custo_xp", "condicoes_retirada", 'migracao', "criado_em" FROM ${r}`,
    );

    await q(
      `CREATE TABLE ${g}."recompensa_estoque_ajustes" (` +
        `"id" bigint GENERATED ALWAYS AS IDENTITY, ` +
        `"recompensa_id" uuid NOT NULL, ` +
        `"tipo" character varying(16) NOT NULL, ` +
        `"quantidade" integer, ` +
        `"estoque_antes" integer, ` +
        `"estoque_depois" integer, ` +
        `"comprometido" integer NOT NULL, ` +
        `"motivo" character varying(${MOTIVO_ESTOQUE.max}) NOT NULL, ` +
        `"responsavel_id" integer, ` +
        `"responsavel_email" character varying(254), ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_recompensa_estoque_ajustes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "fk_recompensa_estoque_ajustes_recompensa" FOREIGN KEY ("recompensa_id") REFERENCES ${r}("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "fk_recompensa_estoque_ajustes_responsavel" FOREIGN KEY ("responsavel_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_tipo" CHECK ("tipo" IN (${lista(TIPOS_AJUSTE_ESTOQUE)})), ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_motivo" CHECK (char_length(btrim("motivo")) >= ${MOTIVO_ESTOQUE.min}), ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_responsavel" CHECK ("responsavel_id" IS NOT NULL OR "responsavel_email" IS NOT NULL), ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_depois" CHECK ("estoque_depois" IS NULL OR "estoque_depois" >= "comprometido"))`,
    );
    await q(
      `INSERT INTO ${g}."recompensa_estoque_ajustes" ("recompensa_id", "tipo", "quantidade", "estoque_antes", "estoque_depois", "comprometido", "motivo", "responsavel_email") ` +
        `SELECT "id", CASE WHEN "estoque_ilimitado" THEN 'ilimitado' ELSE 'inicial' END, "estoque_total", NULL, "estoque_total", ` +
        `"estoque_comprometido", 'Conversão do catálogo inicial', 'migracao' FROM ${r}`,
    );
    for (const tabela of ['recompensa_versoes', 'recompensa_estoque_ajustes']) {
      await q(
        `CREATE INDEX "idx_${tabela}_recompensa" ON ${g}."${tabela}" ("recompensa_id", "id" DESC)`,
      );
      await q(
        `CREATE TRIGGER "tg_${tabela}_somente_insercao" BEFORE UPDATE ON ${g}."${tabela}" ` +
          `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
      );
    }

    await q(
      `ALTER TABLE ${g}."resgates" ADD "versao" integer NOT NULL DEFAULT 1, ` +
        `ADD CONSTRAINT "fk_resgate_versao" FOREIGN KEY ("recompensa_id", "versao") ` +
        `REFERENCES ${g}."recompensa_versoes"("recompensa_id", "versao") ON DELETE RESTRICT`,
    );
    await q(`ALTER TABLE ${g}."resgates" ALTER "versao" DROP DEFAULT`);
    await q(
      `CREATE INDEX "idx_resgates_recompensa" ON ${g}."resgates" ("recompensa_id", "usuario_id")`,
    );
    await q(
      `ALTER TABLE ${r} ADD CONSTRAINT "ck_recompensas_custo_max" CHECK ("custo_xp" <= ${CUSTO_XP_RECOMPENSA.max}) NOT VALID, ` +
        `ADD CONSTRAINT "ck_recompensas_estoque_max" CHECK ("estoque_total" IS NULL OR "estoque_total" <= ${ESTOQUE_MAX}) NOT VALID`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const r = `${g}."recompensas"`;
    const q = (sql: string) => queryRunner.query(sql);
    const [{ perdas }] = (await q(
      `SELECT (SELECT count(*)::int FROM ${g}."recompensa_versoes" WHERE "versao" > 1) + ` +
        `(SELECT count(*)::int FROM ${g}."recompensa_estoque_ajustes" WHERE "tipo" NOT IN ('inicial', 'ilimitado')) + ` +
        `(SELECT count(*)::int FROM ${r} WHERE "status" IN ('inativa', 'arquivada')) AS perdas`,
    )) as Array<{ perdas: number }>;
    if (perdas > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${perdas} registro(s) de versões, ajustes de estoque ou status da lojinha seriam descartados. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await q(`DROP INDEX ${g}."idx_resgates_recompensa"`);
    await q(
      `ALTER TABLE ${g}."resgates" DROP CONSTRAINT "fk_resgate_versao", DROP COLUMN "versao"`,
    );
    await q(`DROP TABLE ${g}."recompensa_estoque_ajustes"`);
    await q(`DROP TABLE ${g}."recompensa_versoes"`);
    await q(`DROP INDEX ${g}."idx_recompensas_status"`);
    await q(
      `ALTER TABLE ${r} ADD "estoque" integer, ADD "publicada" boolean NOT NULL DEFAULT false`,
    );
    await q(
      `UPDATE ${r} SET "publicada" = "status" = 'publicada', ` +
        `"estoque" = CASE WHEN "estoque_ilimitado" THEN NULL ELSE "estoque_total" - "estoque_comprometido" END`,
    );
    await q(
      `ALTER TABLE ${r} ` +
        [
          'ck_recompensas_custo_max',
          'ck_recompensas_estoque_max',
          'fk_recompensas_criado_por',
          'ck_recompensas_condicoes',
          'ck_recompensas_imagem',
          'ck_recompensas_comprometido',
          'ck_recompensas_estoque',
          'ck_recompensas_limite',
          'ck_recompensas_publico',
          'ck_recompensas_status',
          'ck_recompensas_vigencia',
          'ck_recompensas_versao',
          'ck_recompensas_arquivada',
        ]
          .map((c) => `DROP CONSTRAINT "${c}"`)
          .join(', ') +
        ', ' +
        [
          'imagem_url',
          'estoque_ilimitado',
          'estoque_total',
          'estoque_comprometido',
          'limite_por_aluno',
          'publico',
          'programa_codigo',
          'disponivel_de',
          'disponivel_ate',
          'status',
          'versao',
          'criado_por',
          'criado_por_email',
          'publicado_em',
          'arquivado_em',
        ]
          .map((c) => `DROP COLUMN "${c}"`)
          .join(', ') +
        `, ALTER "descricao" TYPE text, ALTER "condicoes_retirada" TYPE text, ` +
        `ADD CONSTRAINT "ck_recompensa_estoque" CHECK ("estoque" IS NULL OR "estoque" >= 0)`,
    );
    await q(`ALTER TABLE ${r} RENAME COLUMN "criado_em" TO "criada_em"`);
    await q(
      `ALTER TABLE ${r} RENAME COLUMN "atualizado_em" TO "atualizada_em"`,
    );
  }
}
