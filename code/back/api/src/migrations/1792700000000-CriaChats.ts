import type { MigrationInterface, QueryRunner } from 'typeorm';

function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export const TABELAS_CHAT = [
  'chats',
  'chat_participantes',
  'mensagens_chat',
] as const;

export const COLUNAS_CHAT: Record<string, string[]> = {
  chats: [
    'id',
    'programa_id',
    'matching_vinculo_id',
    'titulo',
    'ativo',
    'criado_em',
    'atualizado_em',
  ],
  chat_participantes: ['id', 'chat_id', 'participacao_id', 'entrou_em'],
  mensagens_chat: [
    'id',
    'chat_id',
    'remetente_participacao_id',
    'texto',
    'estado',
    'entregue_em',
    'lida_em',
    'criada_em',
  ],
};

async function jaAplicada(queryRunner: QueryRunner): Promise<boolean> {
  const schema =
    (queryRunner.connection.options as { schema?: string }).schema ?? 'feed';
  const existentes = (await queryRunner.query(
    `SELECT table_name FROM information_schema.tables ` +
      `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [schema, TABELAS_CHAT],
  )) as Array<{ table_name: string }>;
  if (!existentes.length) return false;
  if (existentes.length !== TABELAS_CHAT.length)
    throw new Error(
      `CriaChats recusada: estado parcial (existe: ${existentes
        .map((tabela) => tabela.table_name)
        .sort()
        .join(', ')}).`,
    );
  const colunas = (await queryRunner.query(
    `SELECT table_name, column_name FROM information_schema.columns ` +
      `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [schema, TABELAS_CHAT],
  )) as Array<{ table_name: string; column_name: string }>;
  const presentes = new Set(
    colunas.map((coluna) => `${coluna.table_name}.${coluna.column_name}`),
  );
  const ausentes = Object.entries(COLUNAS_CHAT).flatMap(([tabela, nomes]) =>
    nomes
      .filter((nome) => !presentes.has(`${tabela}.${nome}`))
      .map((nome) => `${tabela}.${nome}`),
  );
  if (ausentes.length)
    throw new Error(
      `CriaChats recusada: colunas ausentes: ${ausentes.join(', ')}.`,
    );
  return true;
}

export class CriaChats1792700000000 implements MigrationInterface {
  name = 'CriaChats1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await jaAplicada(queryRunner)) return;
    const s = schemaDe(queryRunner);
    await queryRunner.query(`
      CREATE TABLE ${s}."chats" (
        "id" SERIAL NOT NULL,
        "programa_id" integer NOT NULL,
        "matching_vinculo_id" integer,
        "titulo" varchar(120),
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_chats" PRIMARY KEY ("id"),
        CONSTRAINT "fk_chat_programa" FOREIGN KEY ("programa_id")
          REFERENCES ${s}."programas"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_chat_matching_vinculo" FOREIGN KEY ("matching_vinculo_id")
          REFERENCES ${s}."matching_vinculos"("id") ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX "uq_chat_matching_vinculo"
        ON ${s}."chats" ("matching_vinculo_id")
        WHERE "matching_vinculo_id" IS NOT NULL;
      CREATE INDEX "idx_chat_programa_atualizado"
        ON ${s}."chats" ("programa_id", "atualizado_em");

      CREATE TABLE ${s}."chat_participantes" (
        "id" SERIAL NOT NULL,
        "chat_id" integer NOT NULL,
        "participacao_id" integer NOT NULL,
        "entrou_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_chat_participantes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_chat_participante" UNIQUE ("chat_id", "participacao_id"),
        CONSTRAINT "fk_chat_participante_chat" FOREIGN KEY ("chat_id")
          REFERENCES ${s}."chats"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_chat_participante_participacao" FOREIGN KEY ("participacao_id")
          REFERENCES ${s}."participacoes"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "idx_chat_participante_participacao"
        ON ${s}."chat_participantes" ("participacao_id");

      CREATE TABLE ${s}."mensagens_chat" (
        "id" SERIAL NOT NULL,
        "chat_id" integer NOT NULL,
        "remetente_participacao_id" integer NOT NULL,
        "texto" text NOT NULL CHECK (length(btrim("texto")) BETWEEN 1 AND 4000),
        "estado" varchar(20) NOT NULL DEFAULT 'enviada'
          CHECK ("estado" IN ('enviada', 'entregue', 'lida')),
        "entregue_em" TIMESTAMP WITH TIME ZONE,
        "lida_em" TIMESTAMP WITH TIME ZONE,
        "criada_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_mensagens_chat" PRIMARY KEY ("id"),
        CONSTRAINT "fk_mensagem_chat" FOREIGN KEY ("chat_id")
          REFERENCES ${s}."chats"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_mensagem_remetente" FOREIGN KEY ("remetente_participacao_id")
          REFERENCES ${s}."participacoes"("id") ON DELETE RESTRICT
      );
      CREATE INDEX "idx_mensagem_chat_criada"
        ON ${s}."mensagens_chat" ("chat_id", "criada_em");
      CREATE INDEX "idx_mensagem_chat_estado"
        ON ${s}."mensagens_chat" ("chat_id", "estado");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ mensagens, participantes, chats }] = (await queryRunner.query(
      `SELECT ` +
        `(SELECT count(*) FROM ${s}."mensagens_chat")::int AS mensagens, ` +
        `(SELECT count(*) FROM ${s}."chat_participantes")::int AS participantes, ` +
        `(SELECT count(*) FROM ${s}."chats")::int AS chats`,
    )) as Array<{ mensagens: number; participantes: number; chats: number }>;
    const total = mensagens + participantes + chats;
    if (total > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true')
      throw new Error(
        `Rollback recusado: ${total} registro(s) de chat seriam apagados. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    await queryRunner.query(`
      DROP TABLE ${s}."mensagens_chat";
      DROP TABLE ${s}."chat_participantes";
      DROP TABLE ${s}."chats";
    `);
  }
}
