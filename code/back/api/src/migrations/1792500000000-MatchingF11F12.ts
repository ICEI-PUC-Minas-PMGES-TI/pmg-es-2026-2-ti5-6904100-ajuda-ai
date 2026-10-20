import type { MigrationInterface, QueryRunner } from 'typeorm';

function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export const TABELAS_MATCHING = [
  'matching_configuracoes',
  'matching_execucoes',
  'matching_sugestoes',
  'matching_decisoes',
  'matching_vinculos',
  'matching_chat_outbox',
] as const;

export const COLUNAS_MATCHING: Record<string, string[]> = {
  matching_configuracoes: [
    'id',
    'programa_id',
    'versao',
    'liberado',
    'capacidade_por_padrinho',
    'capacidade_por_apadrinhado',
    'criterios',
    'criado_por',
    'criado_em',
  ],
  matching_execucoes: [
    'id',
    'programa_id',
    'configuracao_id',
    'status',
    'config_snapshot',
    'formularios_snapshot',
    'erro',
    'iniciada_por',
    'concluida_em',
    'criado_em',
  ],
  matching_sugestoes: [
    'id',
    'programa_id',
    'execucao_id',
    'padrinho_participacao_id',
    'apadrinhado_participacao_id',
    'status',
    'score',
    'explicacao',
    'decidida_por',
    'decidida_em',
    'motivo_decisao',
    'vinculo_id',
    'criado_em',
    'atualizado_em',
  ],
  matching_decisoes: [
    'id',
    'sugestao_id',
    'decisao',
    'responsavel',
    'motivo',
    'decidida_em',
  ],
  matching_vinculos: [
    'id',
    'programa_id',
    'padrinho_participacao_id',
    'apadrinhado_participacao_id',
    'ativo',
    'origem',
    'sugestao_id',
    'confirmado_por',
    'confirmado_em',
    'encerrado_em',
  ],
  matching_chat_outbox: [
    'id',
    'chave_idempotencia',
    'programa_id',
    'tipo_evento',
    'payload',
    'status',
    'tentativas',
    'erro',
    'criado_em',
    'atualizado_em',
  ],
};

async function jaAplicada(queryRunner: QueryRunner): Promise<boolean> {
  const options = queryRunner.connection.options as { schema?: string };
  const existentes = (await queryRunner.query(
    `SELECT table_name FROM information_schema.tables ` +
      `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [options.schema ?? 'feed', TABELAS_MATCHING],
  )) as Array<{ table_name: string }>;
  if (!existentes.length) return false;
  if (existentes.length === TABELAS_MATCHING.length) {
    const colunas = (await queryRunner.query(
      `SELECT table_name, column_name FROM information_schema.columns ` +
        `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
      [options.schema ?? 'feed', TABELAS_MATCHING],
    )) as Array<{ table_name: string; column_name: string }>;
    const presentes = new Set(
      colunas.map((c) => `${c.table_name}.${c.column_name}`),
    );
    const ausentes = Object.entries(COLUNAS_MATCHING).flatMap(
      ([tabela, nomes]) =>
        nomes
          .filter((coluna) => !presentes.has(`${tabela}.${coluna}`))
          .map((coluna) => `${tabela}.${coluna}`),
    );
    if (!ausentes.length) return true;
    throw new Error(
      `MatchingF11F12 recusada: tabelas existentes com colunas ausentes: ${ausentes.join(', ')}. Nada foi alterado.`,
    );
  }
  throw new Error(
    'MatchingF11F12 recusada: estado parcial ' +
      `(existe: ${existentes
        .map((t) => t.table_name)
        .sort()
        .join(', ')}). Nada foi alterado.`,
  );
}

/** Persistência, constraints e conversão não destrutiva dos grupos F11/F12. */
export class MatchingF11F121792500000000 implements MigrationInterface {
  name = 'MatchingF11F121792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await jaAplicada(queryRunner)) return;
    const s = schemaDe(queryRunner);
    await queryRunner.query(`
      CREATE TABLE ${s}."matching_configuracoes" (
        "id" SERIAL NOT NULL,
        "programa_id" integer NOT NULL,
        "versao" integer NOT NULL CHECK ("versao" > 0),
        "liberado" boolean NOT NULL DEFAULT false,
        "capacidade_por_padrinho" integer NOT NULL CHECK ("capacidade_por_padrinho" BETWEEN 1 AND 20),
        "capacidade_por_apadrinhado" integer NOT NULL CHECK ("capacidade_por_apadrinhado" BETWEEN 1 AND 20),
        "criterios" jsonb NOT NULL,
        "criado_por" varchar(120),
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_configuracoes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_config_programa" FOREIGN KEY ("programa_id") REFERENCES ${s}."programas"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_matching_config_programa_versao" UNIQUE ("programa_id", "versao")
      );
      CREATE INDEX "idx_matching_config_programa" ON ${s}."matching_configuracoes" ("programa_id");

      CREATE TABLE ${s}."matching_execucoes" (
        "id" SERIAL NOT NULL,
        "programa_id" integer NOT NULL,
        "configuracao_id" integer NOT NULL,
        "status" varchar(20) NOT NULL CHECK ("status" IN ('executando','concluida','falha')),
        "config_snapshot" jsonb NOT NULL,
        "formularios_snapshot" jsonb NOT NULL,
        "erro" text,
        "iniciada_por" varchar(120),
        "concluida_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_execucoes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_execucao_programa" FOREIGN KEY ("programa_id") REFERENCES ${s}."programas"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_execucao_config" FOREIGN KEY ("configuracao_id") REFERENCES ${s}."matching_configuracoes"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "idx_matching_execucao_programa" ON ${s}."matching_execucoes" ("programa_id", "criado_em");
      CREATE UNIQUE INDEX "uq_matching_execucao_em_andamento" ON ${s}."matching_execucoes" ("programa_id") WHERE "status" = 'executando';

      CREATE TABLE ${s}."matching_sugestoes" (
        "id" SERIAL NOT NULL,
        "programa_id" integer NOT NULL,
        "execucao_id" integer NOT NULL,
        "padrinho_participacao_id" integer NOT NULL,
        "apadrinhado_participacao_id" integer NOT NULL,
        "status" varchar(20) NOT NULL CHECK ("status" IN ('pendente','aprovada','recusada','obsoleta')),
        "score" numeric(8,4) NOT NULL CHECK ("score" BETWEEN 0 AND 1),
        "explicacao" jsonb NOT NULL,
        "decidida_por" varchar(120),
        "decidida_em" TIMESTAMP WITH TIME ZONE,
        "motivo_decisao" text,
        "vinculo_id" integer,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_sugestoes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_sugestao_programa" FOREIGN KEY ("programa_id") REFERENCES ${s}."programas"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_sugestao_execucao" FOREIGN KEY ("execucao_id") REFERENCES ${s}."matching_execucoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_sugestao_padrinho" FOREIGN KEY ("padrinho_participacao_id") REFERENCES ${s}."participacoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_sugestao_apadrinhado" FOREIGN KEY ("apadrinhado_participacao_id") REFERENCES ${s}."participacoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_matching_sugestao_distintos" CHECK ("padrinho_participacao_id" <> "apadrinhado_participacao_id"),
        CONSTRAINT "uq_matching_sugestao_execucao_par" UNIQUE ("execucao_id", "padrinho_participacao_id", "apadrinhado_participacao_id")
      );
      CREATE INDEX "idx_matching_sugestao_programa_status" ON ${s}."matching_sugestoes" ("programa_id", "status");

      CREATE TABLE ${s}."matching_vinculos" (
        "id" SERIAL NOT NULL,
        "programa_id" integer NOT NULL,
        "padrinho_participacao_id" integer NOT NULL,
        "apadrinhado_participacao_id" integer NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "origem" varchar(20) NOT NULL DEFAULT 'matching' CHECK ("origem" IN ('matching','legado')),
        "sugestao_id" integer,
        "confirmado_por" varchar(120),
        "confirmado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "encerrado_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_matching_vinculos" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_vinculo_programa" FOREIGN KEY ("programa_id") REFERENCES ${s}."programas"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_vinculo_padrinho" FOREIGN KEY ("padrinho_participacao_id") REFERENCES ${s}."participacoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_vinculo_apadrinhado" FOREIGN KEY ("apadrinhado_participacao_id") REFERENCES ${s}."participacoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_vinculo_sugestao" FOREIGN KEY ("sugestao_id") REFERENCES ${s}."matching_sugestoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_matching_vinculo_distintos" CHECK ("padrinho_participacao_id" <> "apadrinhado_participacao_id")
      );
      CREATE UNIQUE INDEX "uq_matching_vinculo_par_ativo" ON ${s}."matching_vinculos" ("programa_id", "padrinho_participacao_id", "apadrinhado_participacao_id") WHERE "ativo" = true;
      CREATE INDEX "idx_matching_vinculo_programa_padrinho" ON ${s}."matching_vinculos" ("programa_id", "padrinho_participacao_id");
      CREATE INDEX "idx_matching_vinculo_programa_apadrinhado" ON ${s}."matching_vinculos" ("programa_id", "apadrinhado_participacao_id");
      ALTER TABLE ${s}."matching_sugestoes" ADD CONSTRAINT "fk_matching_sugestao_vinculo" FOREIGN KEY ("vinculo_id") REFERENCES ${s}."matching_vinculos"("id") ON DELETE RESTRICT;

      CREATE TABLE ${s}."matching_decisoes" (
        "id" SERIAL NOT NULL,
        "sugestao_id" integer NOT NULL,
        "decisao" varchar(20) NOT NULL CHECK ("decisao" IN ('aprovada','recusada')),
        "responsavel" varchar(120) NOT NULL,
        "motivo" text,
        "decidida_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_decisoes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_decisao_sugestao" FOREIGN KEY ("sugestao_id") REFERENCES ${s}."matching_sugestoes"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_matching_decisao_sugestao" UNIQUE ("sugestao_id")
      );

      CREATE TABLE ${s}."matching_chat_outbox" (
        "id" SERIAL NOT NULL,
        "chave_idempotencia" varchar(160) NOT NULL,
        "programa_id" integer NOT NULL,
        "tipo_evento" varchar(30) NOT NULL CHECK ("tipo_evento" IN ('conversa_privada','grupo_coletivo')),
        "payload" jsonb NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pendente' CHECK ("status" IN ('pendente','processando','concluido','falha')),
        "tentativas" integer NOT NULL DEFAULT 0 CHECK ("tentativas" >= 0),
        "erro" text,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_chat_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_outbox_programa" FOREIGN KEY ("programa_id") REFERENCES ${s}."programas"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_matching_outbox_chave" UNIQUE ("chave_idempotencia")
      );
      CREATE INDEX "idx_matching_outbox_status" ON ${s}."matching_chat_outbox" ("status", "criado_em");
    `);

    // Converte todos os pares válidos sem alterar nem apagar `participacoes.grupo`.
    await queryRunner.query(`
      INSERT INTO ${s}."matching_vinculos"
        ("programa_id", "padrinho_participacao_id", "apadrinhado_participacao_id", "ativo", "origem", "confirmado_por")
      SELECT pr."id", p."id", a."id", true, 'legado', 'migration:F11F12'
      FROM ${s}."participacoes" p
      JOIN ${s}."participacoes" a
        ON a."programa" = p."programa" AND a."grupo" = p."grupo"
      JOIN ${s}."programas" pr ON pr."codigo" = p."programa"
      WHERE p."papel" = 'padrinho' AND a."papel" = 'apadrinhado'
        AND p."status" = 'em_andamento' AND a."status" = 'em_andamento'
        AND p."grupo" IS NOT NULL AND btrim(p."grupo") <> ''
        AND p."id" <> a."id" AND p."usuario_id" <> a."usuario_id"
      ON CONFLICT ("programa_id", "padrinho_participacao_id", "apadrinhado_participacao_id")
        WHERE "ativo" = true DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ usados }] = (await queryRunner.query(
      `SELECT (` +
        TABELAS_MATCHING.map((t) => `(SELECT count(*) FROM ${s}."${t}")`).join(
          ' + ',
        ) +
        `)::int AS usados`,
    )) as Array<{ usados: number }>;
    if (usados > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true')
      throw new Error(
        `Rollback recusado: ${usados} registro(s) de matching seriam descartados.`,
      );
    await queryRunner.query(`
      DROP TABLE ${s}."matching_chat_outbox";
      DROP TABLE ${s}."matching_decisoes";
      ALTER TABLE ${s}."matching_sugestoes" DROP CONSTRAINT "fk_matching_sugestao_vinculo";
      DROP TABLE ${s}."matching_vinculos";
      DROP TABLE ${s}."matching_sugestoes";
      DROP TABLE ${s}."matching_execucoes";
      DROP TABLE ${s}."matching_configuracoes";
    `);
  }
}
