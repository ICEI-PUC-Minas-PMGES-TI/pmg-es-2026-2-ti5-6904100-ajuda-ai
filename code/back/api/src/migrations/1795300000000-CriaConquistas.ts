import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CRITERIOS_CONQUISTA,
  DEFINICAO_CRITERIOS,
  DESCRICAO_CONQUISTA_MAX,
  IMAGEM_CONQUISTA_MAX,
  NOME_CONQUISTA_MAX,
  PUBLICOS_CONQUISTA,
} from '../gamificacao/conquistas/conquistas.js';
import { LIMITES } from '../gamificacao/economia.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const lista = (valores: readonly string[]) =>
  valores.map((v) => `'${v}'`).join(', ');

/**
 * Conquistas (F32), no schema `gamificacao`:
 *
 * - `conquistas`: definições da coordenação. Estado igual ao das missões
 *   (`ativa` + `publicada_em`). `programa_codigo` nulo vale para todos os
 *   ciclos; com valor, referencia `programas` (RESTRICT). CHECK da meta por
 *   critério e do XP (0 a `LIMITES.porConquista`).
 * - `conquistas_desbloqueios`: só de inserção (UPDATE, DELETE e TRUNCATE
 *   barrados), UNIQUE (conquista, usuário, contexto): o mesmo aluno nunca
 *   desbloqueia duas vezes no mesmo semestre (ou na carreira, `GERAL`).
 *   Guarda a meta e o XP da época: arquivar ou editar a definição não muda
 *   o que o aluno já obteve.
 * - Ledger: tipo `CONQUISTA` no CHECK de `xp_movimentacoes`.
 */
export class CriaConquistas1795300000000 implements MigrationInterface {
  name = 'CriaConquistas1795300000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const u = schemaUsuarios(qr);
    const metas = CRITERIOS_CONQUISTA.map((c) => {
      const d = DEFINICAO_CRITERIOS[c];
      return `("criterio" = '${c}' AND "meta" BETWEEN ${d.metaMin} AND ${d.metaMax})`;
    }).join(' OR ');

    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" DROP CONSTRAINT "ck_xp_movimentacoes_tipo", ` +
        `ADD CONSTRAINT "ck_xp_movimentacoes_tipo" ` +
        `CHECK ("tipo" IN ('PUCSTOP_CLAIM', 'RECOMPENSA', 'AJUSTE_ADMIN', 'MISSAO', 'CONQUISTA'))`,
    );

    await qr.query(
      `CREATE TABLE ${g}."conquistas" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"nome" character varying(${NOME_CONQUISTA_MAX}) NOT NULL, ` +
        `"descricao" character varying(${DESCRICAO_CONQUISTA_MAX}) NOT NULL, ` +
        `"imagem_url" character varying(${IMAGEM_CONQUISTA_MAX}), ` +
        `"criterio" character varying(30) NOT NULL, ` +
        `"meta" integer NOT NULL, ` +
        `"publico" character varying(15) NOT NULL DEFAULT 'TODOS', ` +
        `"programa_codigo" character varying(20), ` +
        `"xp" integer NOT NULL DEFAULT 0, ` +
        `"ativa" boolean NOT NULL DEFAULT false, ` +
        `"publicada_em" TIMESTAMP WITH TIME ZONE, ` +
        `"criado_por" integer, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_conquistas" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "fk_conquistas_programa" FOREIGN KEY ("programa_codigo") REFERENCES ${u}."programas"("codigo") ON DELETE RESTRICT ON UPDATE RESTRICT, ` +
        `CONSTRAINT "fk_conquistas_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE SET NULL, ` +
        `CONSTRAINT "ck_conquistas_nome" CHECK (btrim("nome") <> ''), ` +
        `CONSTRAINT "ck_conquistas_descricao" CHECK (btrim("descricao") <> ''), ` +
        `CONSTRAINT "ck_conquistas_imagem" CHECK ("imagem_url" IS NULL OR "imagem_url" LIKE 'https://%'), ` +
        `CONSTRAINT "ck_conquistas_criterio" CHECK ("criterio" IN (${lista(CRITERIOS_CONQUISTA)})), ` +
        `CONSTRAINT "ck_conquistas_meta" CHECK (${metas}), ` +
        `CONSTRAINT "ck_conquistas_publico" CHECK ("publico" IN (${lista(PUBLICOS_CONQUISTA)})), ` +
        `CONSTRAINT "ck_conquistas_publico_criterio" CHECK (NOT ("publico" = 'APADRINHADOS' AND "criterio" = 'FEED_PUBLICACOES')), ` +
        `CONSTRAINT "ck_conquistas_xp" CHECK ("xp" >= 0 AND "xp" <= ${LIMITES.porConquista}), ` +
        `CONSTRAINT "ck_conquistas_publicada" CHECK (NOT "ativa" OR "publicada_em" IS NOT NULL))`,
    );
    await qr.query(
      `CREATE INDEX "idx_conquistas_ativa" ON ${g}."conquistas" ("ativa", "programa_codigo")`,
    );

    await qr.query(
      `CREATE TABLE ${g}."conquistas_desbloqueios" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"conquista_id" uuid NOT NULL, ` +
        `"usuario_id" integer NOT NULL, ` +
        `"contexto" character varying(20) NOT NULL, ` +
        `"meta" integer NOT NULL, ` +
        `"progresso" integer NOT NULL, ` +
        `"xp_configurado" integer NOT NULL, ` +
        `"xp_creditado" integer NOT NULL, ` +
        `"movimentacao_id" bigint, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_conquistas_desbloqueios" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_conquistas_desbloqueios_contexto" UNIQUE ("conquista_id", "usuario_id", "contexto"), ` +
        `CONSTRAINT "uq_conquistas_desbloqueios_movimentacao" UNIQUE ("movimentacao_id"), ` +
        `CONSTRAINT "fk_conquistas_desbloqueios_conquista" FOREIGN KEY ("conquista_id") REFERENCES ${g}."conquistas"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_conquistas_desbloqueios_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_conquistas_desbloqueios_movimentacao" FOREIGN KEY ("movimentacao_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
        // Só desbloqueia com a meta cumprida (progresso real da época).
        `CONSTRAINT "ck_conquistas_desbloqueios_meta" CHECK ("meta" >= 1 AND "progresso" >= "meta"), ` +
        `CONSTRAINT "ck_conquistas_desbloqueios_xp" CHECK ("xp_creditado" >= 0 AND "xp_creditado" <= "xp_configurado"), ` +
        `CONSTRAINT "ck_conquistas_desbloqueios_movimentacao" CHECK (("xp_creditado" = 0) = ("movimentacao_id" IS NULL)))`,
    );
    await qr.query(
      `CREATE INDEX "idx_conquistas_desbloqueios_usuario" ON ${g}."conquistas_desbloqueios" ("usuario_id", "criado_em")`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_conquistas_desbloqueios_somente_insercao" BEFORE UPDATE OR DELETE ON ${g}."conquistas_desbloqueios" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_conquistas_desbloqueios_sem_truncate" BEFORE TRUNCATE ON ${g}."conquistas_desbloqueios" ` +
        `FOR EACH STATEMENT EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const [{ desbloqueios, creditos }] = (await qr.query(
      `SELECT (SELECT count(*) FROM ${g}."conquistas_desbloqueios")::int AS desbloqueios, ` +
        `(SELECT count(*) FROM ${g}."xp_movimentacoes" WHERE "tipo" = 'CONQUISTA')::int AS creditos`,
    )) as Array<{ desbloqueios: number; creditos: number }>;
    if (Number(desbloqueios) > 0 || Number(creditos) > 0) {
      throw new Error(
        'Rollback recusado: já existem conquistas desbloqueadas ou XP de conquista no extrato.',
      );
    }
    await qr.query(`DROP TABLE ${g}."conquistas_desbloqueios"`);
    await qr.query(`DROP TABLE ${g}."conquistas"`);
    await qr.query(
      `ALTER TABLE ${g}."xp_movimentacoes" DROP CONSTRAINT "ck_xp_movimentacoes_tipo", ` +
        `ADD CONSTRAINT "ck_xp_movimentacoes_tipo" ` +
        `CHECK ("tipo" IN ('PUCSTOP_CLAIM', 'RECOMPENSA', 'AJUSTE_ADMIN', 'MISSAO'))`,
    );
  }
}
