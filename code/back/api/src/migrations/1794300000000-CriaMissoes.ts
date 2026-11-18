import type { MigrationInterface, QueryRunner } from 'typeorm';
import { LIMITES } from '../gamificacao/economia.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';
import {
  DESCRICAO_MISSAO_MAX,
  TIPOS_MISSAO,
  TITULO_MISSAO_MAX,
} from '../gamificacao/missoes/missoes.js';

function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export class CriaMissoes1794300000000 implements MigrationInterface {
  name = 'CriaMissoes1794300000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const u = schemaUsuarios(qr);
    const tipos = TIPOS_MISSAO.map((t) => `'${t}'`).join(', ');

    await qr.query(
      `CREATE TABLE ${g}."missoes" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"titulo" character varying(${TITULO_MISSAO_MAX}) NOT NULL, ` +
        `"descricao" character varying(${DESCRICAO_MISSAO_MAX}) NOT NULL, ` +
        `"tipo" character varying(10) NOT NULL, ` +
        `"xp" integer NOT NULL, ` +
        `"ativa" boolean NOT NULL DEFAULT false, ` +
        `"inicio" TIMESTAMP WITH TIME ZONE, ` +
        `"fim" TIMESTAMP WITH TIME ZONE, ` +
        `"ciclo" character varying(20) NOT NULL, ` +
        `"criado_por" integer, ` +
        `"ativada_em" TIMESTAMP WITH TIME ZONE, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_missoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "fk_missoes_criado_por" FOREIGN KEY ("criado_por") REFERENCES ${u}."usuarios"("id") ON DELETE SET NULL, ` +
        `CONSTRAINT "ck_missoes_titulo" CHECK (btrim("titulo") <> ''), ` +
        `CONSTRAINT "ck_missoes_descricao" CHECK (btrim("descricao") <> ''), ` +
        `CONSTRAINT "ck_missoes_tipo" CHECK ("tipo" IN (${tipos})), ` +
        `CONSTRAINT "ck_missoes_xp" CHECK ("xp" >= 1 AND "xp" <= ${LIMITES.porMissao}), ` +
        `CONSTRAINT "ck_missoes_xp_semanal" CHECK ("tipo" <> 'SEMANAL' OR "xp" <= ${LIMITES.missoesSemanais}), ` +
        `CONSTRAINT "ck_missoes_periodo" CHECK ("inicio" IS NULL OR "fim" IS NULL OR "fim" > "inicio"))`,
    );
    await qr.query(
      `CREATE INDEX "idx_missoes_ciclo_ativa" ON ${g}."missoes" ("ciclo", "ativa")`,
    );

    await qr.query(
      `CREATE TABLE ${g}."missoes_conclusoes" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"missao_id" uuid NOT NULL, ` +
        `"usuario_id" integer NOT NULL, ` +
        `"ciclo" character varying(20) NOT NULL, ` +
        `"semana" date, ` +
        `"xp_configurado" integer NOT NULL, ` +
        `"xp_creditado" integer NOT NULL, ` +
        `"movimentacao_id" bigint, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_missoes_conclusoes" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "uq_missoes_conclusoes_movimentacao" UNIQUE ("movimentacao_id"), ` +
        `CONSTRAINT "fk_missoes_conclusoes_missao" FOREIGN KEY ("missao_id") REFERENCES ${g}."missoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_missoes_conclusoes_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "fk_missoes_conclusoes_movimentacao" FOREIGN KEY ("movimentacao_id") REFERENCES ${g}."xp_movimentacoes"("id") ON DELETE RESTRICT, ` +
        `CONSTRAINT "ck_missoes_conclusoes_xp" CHECK ("xp_creditado" >= 0 AND "xp_creditado" <= "xp_configurado"), ` +
        `CONSTRAINT "ck_missoes_conclusoes_movimentacao" CHECK (("xp_creditado" = 0) = ("movimentacao_id" IS NULL)))`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX "uq_missoes_conclusoes_unica" ON ${g}."missoes_conclusoes" ("missao_id", "usuario_id", "ciclo") WHERE "semana" IS NULL`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX "uq_missoes_conclusoes_semanal" ON ${g}."missoes_conclusoes" ("missao_id", "usuario_id", "semana") WHERE "semana" IS NOT NULL`,
    );
    await qr.query(
      `CREATE INDEX "idx_missoes_conclusoes_usuario" ON ${g}."missoes_conclusoes" ("usuario_id", "ciclo")`,
    );
    await qr.query(
      `CREATE TRIGGER "tg_missoes_conclusoes_somente_insercao" BEFORE UPDATE OR DELETE ON ${g}."missoes_conclusoes" ` +
        `FOR EACH ROW EXECUTE FUNCTION ${g}."somente_insercao"()`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const [{ total }] = (await qr.query(
      `SELECT count(*)::int AS total FROM ${g}."missoes_conclusoes"`,
    )) as Array<{ total: number }>;
    if (Number(total) > 0) {
      throw new Error('Rollback recusado: já existem conclusões de missões.');
    }
    await qr.query(`DROP TABLE ${g}."missoes_conclusoes"`);
    await qr.query(`DROP TABLE ${g}."missoes"`);
  }
}
