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
  NOME_RECOMPENSA_MAX,
  PUBLICOS_RECOMPENSA,
  STATUS_RECOMPENSA,
  TIPOS_AJUSTE_ESTOQUE,
} from '../gamificacao/recompensas/recompensas.js';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
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
] as const;

/**
 * Cadastro de recompensas da lojinha (F27), no schema `gamificacao`
 * (sem entidades: o `synchronize` local nunca cria nem altera estas tabelas).
 *
 * - `recompensas`: estado atual (status, público, vigência, contexto,
 *   estoque). Estoque limitado guarda o total disponibilizado; ilimitado é
 *   explícito (`estoque_ilimitado` e total nulo). `estoque_comprometido` são
 *   as unidades já presas a resgates (mantido pelo fluxo de resgate, F28/F29):
 *   o total nunca fica abaixo dele (CHECK).
 * - `recompensa_versoes`: foto de nome, descrição, imagem, custo e condições
 *   a cada mudança. O resgate guarda a versão vista pelo aluno, então editar
 *   preço ou descrição não muda resgates anteriores. Só INSERT.
 * - `recompensa_estoque_ajustes`: trilha de reposições e correções com
 *   responsável e motivo. Só INSERT.
 *
 * Versões e ajustes saem junto apenas na exclusão de uma recompensa sem
 * transações (CASCADE); as usadas são arquivadas, nunca apagadas.
 */
export class LojinhaRecompensas1792800000000 implements MigrationInterface {
  name = 'LojinhaRecompensas1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const u = schemaUsuarios(queryRunner);

    await queryRunner.query(
      `CREATE TABLE ${g}."recompensas" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"nome" character varying(${NOME_RECOMPENSA_MAX}) NOT NULL, ` +
        `"descricao" character varying(${DESCRICAO_RECOMPENSA_MAX}) NOT NULL DEFAULT '', ` +
        `"imagem_url" character varying(${IMAGEM_URL_MAX}), ` +
        `"custo_xp" integer NOT NULL, ` +
        `"condicoes_retirada" character varying(${CONDICOES_RETIRADA_MAX}) NOT NULL, ` +
        `"estoque_ilimitado" boolean NOT NULL, ` +
        `"estoque_total" integer, ` +
        `"estoque_comprometido" integer NOT NULL DEFAULT 0, ` +
        `"limite_por_aluno" integer, ` +
        `"publico" character varying(16) NOT NULL DEFAULT 'todos', ` +
        `"programa_codigo" character varying(20), ` +
        `"disponivel_de" TIMESTAMP WITH TIME ZONE, ` +
        `"disponivel_ate" TIMESTAMP WITH TIME ZONE, ` +
        `"status" character varying(16) NOT NULL DEFAULT 'rascunho', ` +
        `"versao" integer NOT NULL DEFAULT 1, ` +
        `"criado_por" integer, ` +
        `"criado_por_email" character varying(254), ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"publicado_em" TIMESTAMP WITH TIME ZONE, ` +
        `"arquivado_em" TIMESTAMP WITH TIME ZONE, ` +
        `CONSTRAINT "pk_recompensas" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "fk_recompensas_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_recompensas_nome" CHECK (btrim("nome") <> ''), ` +
        `CONSTRAINT "ck_recompensas_condicoes" CHECK (btrim("condicoes_retirada") <> ''), ` +
        `CONSTRAINT "ck_recompensas_imagem" CHECK ("imagem_url" IS NULL OR "imagem_url" ~* '^https://'), ` +
        `CONSTRAINT "ck_recompensas_custo" CHECK ("custo_xp" >= ${CUSTO_XP_RECOMPENSA.min} AND "custo_xp" <= ${CUSTO_XP_RECOMPENSA.max}), ` +
        `CONSTRAINT "ck_recompensas_comprometido" CHECK ("estoque_comprometido" >= 0), ` +
        // Ilimitado é explícito; limitado nunca fica abaixo do comprometido.
        `CONSTRAINT "ck_recompensas_estoque" CHECK (` +
        `("estoque_ilimitado" AND "estoque_total" IS NULL) OR ` +
        `(NOT "estoque_ilimitado" AND "estoque_total" IS NOT NULL AND "estoque_total" <= ${ESTOQUE_MAX} ` +
        `AND "estoque_total" >= "estoque_comprometido")), ` +
        `CONSTRAINT "ck_recompensas_limite" CHECK ("limite_por_aluno" IS NULL OR ("limite_por_aluno" >= ${LIMITE_POR_ALUNO.min} AND "limite_por_aluno" <= ${LIMITE_POR_ALUNO.max})), ` +
        `CONSTRAINT "ck_recompensas_publico" CHECK ("publico" IN (${lista(PUBLICOS_RECOMPENSA)})), ` +
        `CONSTRAINT "ck_recompensas_status" CHECK ("status" IN (${lista(STATUS_RECOMPENSA)})), ` +
        `CONSTRAINT "ck_recompensas_vigencia" CHECK ("disponivel_de" IS NULL OR "disponivel_ate" IS NULL OR "disponivel_de" < "disponivel_ate"), ` +
        `CONSTRAINT "ck_recompensas_versao" CHECK ("versao" >= 1), ` +
        `CONSTRAINT "ck_recompensas_arquivada" CHECK (("status" = 'arquivada') = ("arquivado_em" IS NOT NULL)))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_recompensas_status" ON ${g}."recompensas" ("status", "nome")`,
    );

    await queryRunner.query(
      `CREATE TABLE ${g}."recompensa_versoes" (` +
        `"id" bigint GENERATED ALWAYS AS IDENTITY, ` +
        `"recompensa_id" uuid NOT NULL, ` +
        `"versao" integer NOT NULL, ` +
        `"nome" character varying(${NOME_RECOMPENSA_MAX}) NOT NULL, ` +
        `"descricao" character varying(${DESCRICAO_RECOMPENSA_MAX}) NOT NULL, ` +
        `"imagem_url" character varying(${IMAGEM_URL_MAX}), ` +
        `"custo_xp" integer NOT NULL, ` +
        `"condicoes_retirada" character varying(${CONDICOES_RETIRADA_MAX}) NOT NULL, ` +
        `"criado_por" integer, ` +
        `"criado_por_email" character varying(254), ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_recompensa_versoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_recompensa_versoes" UNIQUE ("recompensa_id", "versao"), ` +
        `CONSTRAINT "fk_recompensa_versoes_recompensa" FOREIGN KEY ("recompensa_id") REFERENCES ${g}."recompensas"("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "fk_recompensa_versoes_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_recompensa_versoes_custo" CHECK ("custo_xp" >= ${CUSTO_XP_RECOMPENSA.min} AND "custo_xp" <= ${CUSTO_XP_RECOMPENSA.max}))`,
    );

    await queryRunner.query(
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
        `CONSTRAINT "fk_recompensa_estoque_ajustes_recompensa" FOREIGN KEY ("recompensa_id") REFERENCES ${g}."recompensas"("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "fk_recompensa_estoque_ajustes_responsavel" FOREIGN KEY ("responsavel_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_tipo" CHECK ("tipo" IN (${lista(TIPOS_AJUSTE_ESTOQUE)})), ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_motivo" CHECK (char_length(btrim("motivo")) >= ${MOTIVO_ESTOQUE.min}), ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_responsavel" CHECK ("responsavel_id" IS NOT NULL OR "responsavel_email" IS NOT NULL), ` +
        `CONSTRAINT "ck_recompensa_estoque_ajustes_depois" CHECK ("estoque_depois" IS NULL OR "estoque_depois" >= "comprometido"))`,
    );
    // Transações de uma recompensa = movimentações de XP que a referenciam.
    await queryRunner.query(
      `CREATE INDEX "idx_xp_movimentacoes_referencia" ON ${g}."xp_movimentacoes" ("referencia_tipo", "referencia_id") ` +
        `WHERE "referencia_tipo" IS NOT NULL`,
    );
    for (const tabela of ['recompensa_versoes', 'recompensa_estoque_ajustes']) {
      await queryRunner.query(
        `CREATE INDEX "idx_${tabela}_recompensa" ON ${g}."${tabela}" ("recompensa_id", "id" DESC)`,
      );
      // Histórico imutável: UPDATE recusado (DELETE só pela exclusão em cascata
      // de uma recompensa sem transações).
      await queryRunner.query(
        `CREATE TRIGGER "tg_${tabela}_somente_insercao" BEFORE UPDATE ON ${g}."${tabela}" ` +
          `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
      );
    }
  }

  /**
   * Recusa descartar recompensas cadastradas. Para descartar mesmo assim
   * (banco de teste): MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const [{ recompensas }] = (await queryRunner.query(
      `SELECT count(*)::int AS recompensas FROM ${g}."recompensas"`,
    )) as Array<{ recompensas: number }>;
    if (
      recompensas > 0 &&
      process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true'
    ) {
      throw new Error(
        `Rollback recusado: ${recompensas} recompensa(s) da lojinha seriam apagadas. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await queryRunner.query(
      `DROP INDEX ${g}."idx_xp_movimentacoes_referencia"`,
    );
    await queryRunner.query(`DROP TABLE ${g}."recompensa_estoque_ajustes"`);
    await queryRunner.query(`DROP TABLE ${g}."recompensa_versoes"`);
    await queryRunner.query(`DROP TABLE ${g}."recompensas"`);
  }
}
