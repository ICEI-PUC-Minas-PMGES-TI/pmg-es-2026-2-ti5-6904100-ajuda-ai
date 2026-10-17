import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

function nomeDoSchema(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return options.schema ?? 'feed';
}

/**
 * Colunas que a baseline cria em cada tabela. Num banco que já tem o schema
 * (criado por `synchronize`), todas precisam existir para a baseline ser
 * reconhecida; colunas a mais vêm de migrations posteriores (ex.:
 * `programas.requisitos_padrinho`).
 */
export const TABELAS_BASELINE: Record<string, string[]> = {
  avisos: ['id', 'titulo', 'descricao', 'publico', 'programa', 'criado_em'],
  formularios: [
    'id',
    'programa',
    'tipo',
    'publicado',
    'perguntas',
    'criado_em',
    'atualizado_em',
  ],
  participacoes: [
    'id',
    'usuario_id',
    'programa',
    'papel',
    'status',
    'grupo',
    'apadrinhados',
    'inicio_em',
    'termino_em',
    'respostas',
    'observacoes',
    'criado_em',
    'atualizado_em',
  ],
  programas: [
    'id',
    'codigo',
    'titulo',
    'etapa_atual',
    'inscricoes_abertas',
    'formulario_publicado',
    'matching_pendente',
    'vagas_apadrinhados',
    'grupos_previstos',
    'inscricoes_inicio',
    'inscricoes_fim',
    'analise_inicio',
    'analise_fim',
    'formacao_inicio',
    'formacao_fim',
    'andamento_inicio',
    'andamento_fim',
    'encerramento_em',
    'criado_em',
    'atualizado_em',
  ],
  publicacoes: [
    'id',
    'autor',
    'iniciais',
    'descricao_autor',
    'categoria',
    'texto',
    'imagens',
    'owner_id',
    'criado_em',
  ],
  comentarios: ['id', 'publicacao_id', 'autor_id', 'texto', 'criado_em'],
  curtidas: ['id', 'publicacao_id', 'usuario_id', 'criado_em'],
};

/**
 * Baseline do schema `feed` como ele era ANTES de
 * `UsuariosERequisitosPadrinho1791944105933` (sem `usuarios` e sem
 * `programas.requisitos_padrinho`): por isso o timestamp é anterior ao dela.
 * Estrutura copiada do Supabase em 17/10/2026 (nomes de PK/FK/índices iguais
 * aos que o TypeORM gerou por `synchronize`).
 *
 * Três situações, decididas pelo estado real e não por flag:
 *
 * - banco novo (nenhuma das 7 tabelas): cria tudo;
 * - banco existente (as 7 tabelas com todas as colunas da baseline, como o
 *   Supabase e bancos locais criados por `synchronize`): não altera nada; o
 *   TypeORM só registra a baseline como executada;
 * - qualquer outra coisa (parte das tabelas, coluna faltando): falha, sem
 *   tocar no banco. Exige análise manual.
 *
 * O TypeORM executa migrations pendentes mesmo com timestamp anterior à
 * última executada; no Supabase ela roda depois da incremental, como no-op.
 */
export class BaselineFeed1791900000000 implements MigrationInterface {
  name = 'BaselineFeed1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const colunas = (await queryRunner.query(
      `SELECT table_name, column_name FROM information_schema.columns ` +
        `WHERE table_schema = $1 AND table_name = ANY($2)`,
      [nomeDoSchema(queryRunner), Object.keys(TABELAS_BASELINE)],
    )) as Array<{ table_name: string; column_name: string }>;
    const existentes = new Map<string, Set<string>>();
    for (const { table_name, column_name } of colunas) {
      if (!existentes.has(table_name)) existentes.set(table_name, new Set());
      existentes.get(table_name)!.add(column_name);
    }

    if (existentes.size > 0) {
      const problemas: string[] = [];
      for (const [tabela, esperadas] of Object.entries(TABELAS_BASELINE)) {
        const atuais = existentes.get(tabela);
        if (!atuais) {
          problemas.push(`tabela ${tabela} ausente`);
          continue;
        }
        const faltando = esperadas.filter((c) => !atuais.has(c));
        if (faltando.length) {
          problemas.push(`${tabela} sem ${faltando.join(', ')}`);
        }
      }
      if (problemas.length) {
        throw new Error(
          `Baseline recusada: schema ${s} existe só em parte (${problemas.join('; ')}). ` +
            'Nada foi alterado. Compare com docs/tecnico/banco/migrations.md antes de continuar.',
        );
      }
      // Banco existente reconhecido: estrutura já é a da baseline.
      return;
    }

    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
    await queryRunner.query(
      `CREATE TABLE ${s}."avisos" (` +
        `"id" SERIAL NOT NULL, ` +
        `"titulo" character varying(120) NOT NULL, ` +
        `"descricao" text NOT NULL, ` +
        `"publico" character varying(20) NOT NULL DEFAULT 'todos', ` +
        `"programa" character varying(20), ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_f5879845d8caa44151fd8747e21" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE ${s}."formularios" (` +
        `"id" SERIAL NOT NULL, ` +
        `"programa" character varying(20) NOT NULL, ` +
        `"tipo" character varying(20) NOT NULL, ` +
        `"publicado" boolean NOT NULL DEFAULT false, ` +
        `"perguntas" jsonb, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "uq_formulario_programa_tipo" UNIQUE ("programa", "tipo"), ` +
        `CONSTRAINT "PK_99d35e86697a78044541773bd67" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE ${s}."participacoes" (` +
        `"id" SERIAL NOT NULL, ` +
        `"usuario_id" character varying(120) NOT NULL, ` +
        `"programa" character varying(20) NOT NULL, ` +
        `"papel" character varying(30) NOT NULL, ` +
        `"status" character varying(30) NOT NULL, ` +
        `"grupo" character varying(40), ` +
        `"apadrinhados" integer NOT NULL DEFAULT 0, ` +
        `"inicio_em" TIMESTAMP WITH TIME ZONE, ` +
        `"termino_em" TIMESTAMP WITH TIME ZONE, ` +
        `"respostas" jsonb, ` +
        `"observacoes" text, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "uq_participacao_usuario_programa_papel" UNIQUE ("usuario_id", "programa", "papel"), ` +
        `CONSTRAINT "PK_c03daf910b5b6a2fc4c5b11c189" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_participacao_usuario" ON ${s}."participacoes" ("usuario_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE ${s}."programas" (` +
        `"id" SERIAL NOT NULL, ` +
        `"codigo" character varying(20) NOT NULL, ` +
        `"titulo" character varying(120) NOT NULL, ` +
        `"etapa_atual" character varying(30) NOT NULL, ` +
        `"inscricoes_abertas" boolean NOT NULL DEFAULT false, ` +
        `"formulario_publicado" boolean NOT NULL DEFAULT false, ` +
        `"matching_pendente" boolean NOT NULL DEFAULT false, ` +
        `"vagas_apadrinhados" integer NOT NULL DEFAULT 0, ` +
        `"grupos_previstos" integer NOT NULL DEFAULT 0, ` +
        `"inscricoes_inicio" date, ` +
        `"inscricoes_fim" date, ` +
        `"analise_inicio" date, ` +
        `"analise_fim" date, ` +
        `"formacao_inicio" date, ` +
        `"formacao_fim" date, ` +
        `"andamento_inicio" date, ` +
        `"andamento_fim" date, ` +
        `"encerramento_em" date, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "uq_programa_codigo" UNIQUE ("codigo"), ` +
        `CONSTRAINT "PK_0eb3b38bfa274b4cbf0882232c8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE ${s}."publicacoes" (` +
        `"id" SERIAL NOT NULL, ` +
        `"autor" character varying(120) NOT NULL, ` +
        `"iniciais" character varying(8) NOT NULL, ` +
        `"descricao_autor" character varying(160) NOT NULL, ` +
        `"categoria" character varying(80) NOT NULL, ` +
        `"texto" text NOT NULL, ` +
        `"imagens" text array NOT NULL DEFAULT ARRAY[]::text[], ` +
        `"owner_id" character varying(100) NOT NULL, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_788b6f402a16bb27a354645614a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE ${s}."comentarios" (` +
        `"id" SERIAL NOT NULL, ` +
        `"publicacao_id" integer NOT NULL, ` +
        `"autor_id" character varying(100) NOT NULL, ` +
        `"texto" text NOT NULL, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_b60b1468bb275db8d5e875c4a78" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE ${s}."curtidas" (` +
        `"id" SERIAL NOT NULL, ` +
        `"publicacao_id" integer NOT NULL, ` +
        `"usuario_id" character varying(100) NOT NULL, ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_12d03dc7e64c16a12554e675301" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4f37b531d46471476c50a87379" ON ${s}."curtidas" ("publicacao_id", "usuario_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE ${s}."comentarios" ADD CONSTRAINT "FK_17ac1a3303c765cf4aa1e38a66e" ` +
        `FOREIGN KEY ("publicacao_id") REFERENCES ${s}."publicacoes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE ${s}."curtidas" ADD CONSTRAINT "FK_5695d30e937d8e7e595be208a4c" ` +
        `FOREIGN KEY ("publicacao_id") REFERENCES ${s}."publicacoes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /**
   * Sem rollback: num banco existente a baseline não criou nada (desfazer
   * apagaria tabelas e dados de antes dela); num banco novo, recriar o banco
   * é mais seguro que derrubar o schema por migration.
   */
  public async down(): Promise<void> {
    throw new Error(
      'BaselineFeed não é revertida: ela descreve o schema existente. ' +
        'Para começar do zero, use um banco novo.',
    );
  }
}
