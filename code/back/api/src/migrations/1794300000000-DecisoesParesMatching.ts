import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DecisoesParesMatching1794300000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const schema = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(`CREATE TABLE ${schema}."matching_pares_decisoes" (
      "id" SERIAL PRIMARY KEY,
      "programa_id" INTEGER NOT NULL REFERENCES ${schema}."programas"("id") ON DELETE RESTRICT,
      "padrinho_participacao_id" INTEGER NOT NULL REFERENCES ${schema}."participacoes"("id") ON DELETE RESTRICT,
      "apadrinhado_participacao_id" INTEGER NOT NULL REFERENCES ${schema}."participacoes"("id") ON DELETE RESTRICT,
      "acao" VARCHAR(20) NOT NULL CHECK ("acao" IN ('recusado','reconsiderado')),
      "responsavel" VARCHAR(120) NOT NULL,
      "motivo" TEXT,
      "sugestao_id" INTEGER REFERENCES ${schema}."matching_sugestoes"("id") ON DELETE RESTRICT,
      "evento_anterior_id" INTEGER REFERENCES ${schema}."matching_pares_decisoes"("id") ON DELETE RESTRICT,
      "decidida_em" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ck_matching_par_pessoas_distintas" CHECK ("padrinho_participacao_id" <> "apadrinhado_participacao_id"),
      CONSTRAINT "ck_matching_par_reconsideracao_motivo" CHECK ("acao" <> 'reconsiderado' OR ("evento_anterior_id" IS NOT NULL AND "motivo" IS NOT NULL AND length(btrim("motivo")) > 0))
    )`);
    await qr.query(
      `CREATE INDEX "idx_matching_par_decisao_ciclo_par" ON ${schema}."matching_pares_decisoes" ("programa_id", "padrinho_participacao_id", "apadrinhado_participacao_id", "id")`,
    );
    await qr.query(
      `CREATE UNIQUE INDEX "uq_matching_par_recusa_sugestao" ON ${schema}."matching_pares_decisoes" ("sugestao_id") WHERE "acao" = 'recusado'`,
    );
    // Recusas anteriores também impedem o par no ciclo; suas decisões não são regravadas.
    await qr.query(`INSERT INTO ${schema}."matching_pares_decisoes" ("programa_id", "padrinho_participacao_id", "apadrinhado_participacao_id", "acao", "responsavel", "motivo", "sugestao_id", "decidida_em")
      SELECT s."programa_id", s."padrinho_participacao_id", s."apadrinhado_participacao_id", 'recusado', COALESCE(d."responsavel", s."decidida_por", 'migracao:legado'), COALESCE(d."motivo", s."motivo_decisao"), s."id", COALESCE(d."decidida_em", s."decidida_em", s."atualizado_em", s."criado_em")
      FROM ${schema}."matching_sugestoes" s LEFT JOIN ${schema}."matching_decisoes" d ON s."id" = d."sugestao_id" AND d."decisao" = 'recusada'
      WHERE s."status" = 'recusada' OR d."decisao" = 'recusada' ORDER BY COALESCE(d."decidida_em", s."decidida_em", s."atualizado_em", s."criado_em"), s."id"`);
  }
  async down(qr: QueryRunner): Promise<void> {
    const schema = `"${((qr.connection.options as { schema?: string }).schema ?? 'feed').replaceAll('"', '""')}"`;
    await qr.query(`DROP TABLE ${schema}."matching_pares_decisoes"`);
  }
}
