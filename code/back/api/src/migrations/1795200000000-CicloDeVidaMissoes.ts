import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';
import {
  INSTRUCOES_MISSAO_MAX,
  PUBLICOS_MISSAO,
  QUANTIDADE_MISSAO_MAX,
} from '../gamificacao/missoes/missoes.js';

/**
 * F22: público e instruções da missão, vários PucStops por missão de
 * exploração e ciclo de vida rascunho → publicada → arquivada.
 *
 * Missão de PucStops com pontos escolhidos guarda a lista em `pucstops` e a
 * meta é visitar todos (`quantidade` = tamanho da lista). `alvo_id` fica só
 * para o evento.
 *
 * O código (CODIGO e EVENTO) só vale até `codigo_liberado_ate`: a
 * coordenação libera por alguns minutos na hora da atividade, e o código
 * repassado depois não serve.
 */
export class CicloDeVidaMissoes1795200000000 implements MigrationInterface {
  name = 'CicloDeVidaMissoes1795200000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const publicos = PUBLICOS_MISSAO.map((p) => `'${p}'`).join(', ');

    await qr.query(
      `ALTER TABLE ${g}."missoes" ` +
        `ADD COLUMN "publico" character varying(20) NOT NULL DEFAULT 'TODOS', ` +
        `ADD COLUMN "instrucoes" character varying(${INSTRUCOES_MISSAO_MAX}), ` +
        `ADD COLUMN "pucstops" uuid[], ` +
        `ADD COLUMN "codigo_liberado_ate" timestamp with time zone, ` +
        `ADD CONSTRAINT "ck_missoes_publico" CHECK ("publico" IN (${publicos})), ` +
        // Só padrinho com dupla publica no feed.
        `ADD CONSTRAINT "ck_missoes_publico_requisito" CHECK (NOT ("publico" = 'APADRINHADOS' AND "requisito" = 'FEED_PUBLICACOES'))`,
    );

    await qr.query(
      `UPDATE ${g}."missoes" SET "pucstops" = ARRAY["alvo_id"], "alvo_id" = NULL ` +
        `WHERE "requisito" = 'PUCSTOPS' AND "alvo_id" IS NOT NULL`,
    );
    await qr.query(
      `ALTER TABLE ${g}."missoes" DROP CONSTRAINT "ck_missoes_requisito_alvo", ` +
        `ADD CONSTRAINT "ck_missoes_requisito_alvo" CHECK (` +
        `("requisito" = 'EVENTO' AND "alvo_id" IS NOT NULL AND "pucstops" IS NULL AND "quantidade" = 1 AND "tipo" = 'UNICA') ` +
        `OR ("requisito" = 'PUCSTOPS' AND "tipo" = 'UNICA' AND "alvo_id" IS NULL AND ("pucstops" IS NULL ` +
        `OR (cardinality("pucstops") BETWEEN 1 AND ${QUANTIDADE_MISSAO_MAX} AND "quantidade" = cardinality("pucstops")))) ` +
        `OR ("requisito" IS DISTINCT FROM 'EVENTO' AND "requisito" IS DISTINCT FROM 'PUCSTOPS' AND "alvo_id" IS NULL AND "pucstops" IS NULL))`,
    );

    // Desativadas antes de `publicada_em` existir, mas já concluídas: são
    // arquivadas, não rascunhos (não podem ser excluídas nem editadas).
    await qr.query(
      `UPDATE ${g}."missoes" m SET "publicada_em" = m."criado_em" ` +
        `WHERE m."publicada_em" IS NULL ` +
        `AND EXISTS (SELECT 1 FROM ${g}."missoes_conclusoes" c WHERE c."missao_id" = m."id")`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    const [{ perdidas }] = (await qr.query(
      `SELECT count(*)::int AS perdidas FROM ${g}."missoes" ` +
        `WHERE "publico" <> 'TODOS' OR "instrucoes" IS NOT NULL OR cardinality("pucstops") > 1`,
    )) as Array<{ perdidas: number }>;
    if (Number(perdidas) > 0) {
      throw new Error(
        `Rollback recusado: ${perdidas} missão(ões) perderiam público, instruções ou pontos.`,
      );
    }
    await qr.query(
      `ALTER TABLE ${g}."missoes" DROP CONSTRAINT "ck_missoes_requisito_alvo"`,
    );
    await qr.query(
      `UPDATE ${g}."missoes" SET "alvo_id" = "pucstops"[1] WHERE "pucstops" IS NOT NULL`,
    );
    await qr.query(
      `ALTER TABLE ${g}."missoes" ADD CONSTRAINT "ck_missoes_requisito_alvo" CHECK (` +
        `("requisito" = 'EVENTO' AND "alvo_id" IS NOT NULL AND "quantidade" = 1 AND "tipo" = 'UNICA') ` +
        `OR ("requisito" = 'PUCSTOPS' AND "tipo" = 'UNICA' AND ("alvo_id" IS NULL OR "quantidade" = 1)) ` +
        `OR ("requisito" IS DISTINCT FROM 'EVENTO' AND "requisito" IS DISTINCT FROM 'PUCSTOPS' AND "alvo_id" IS NULL)), ` +
        `DROP CONSTRAINT "ck_missoes_publico_requisito", DROP CONSTRAINT "ck_missoes_publico", ` +
        `DROP COLUMN "codigo_liberado_ate", DROP COLUMN "pucstops", DROP COLUMN "instrucoes", DROP COLUMN "publico"`,
    );
  }
}
