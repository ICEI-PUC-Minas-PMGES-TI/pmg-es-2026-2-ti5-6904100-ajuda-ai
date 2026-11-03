import type { MigrationInterface, QueryRunner } from 'typeorm';

function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

export const TABELAS_CATALOGO_CRITERIOS = [
  'matching_criterios',
  'matching_criterio_versoes',
] as const;

export const COLUNAS_CATALOGO_CRITERIOS: Record<string, string[]> = {
  matching_criterios: [
    'id',
    'nome',
    'nome_normalizado',
    'descricao',
    'ativo',
    'versao_atual',
    'criado_por',
    'criado_em',
    'atualizado_em',
  ],
  matching_criterio_versoes: [
    'id',
    'criterio_id',
    'versao',
    'enunciado_padrao',
    'tipo',
    'alternativas',
    'criado_por',
    'criado_em',
  ],
};

async function jaAplicada(queryRunner: QueryRunner): Promise<boolean> {
  const options = queryRunner.connection.options as { schema?: string };
  const schema = options.schema ?? 'feed';
  const existentes = (await queryRunner.query(
    `SELECT table_name FROM information_schema.tables ` +
      `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
    [schema, TABELAS_CATALOGO_CRITERIOS],
  )) as Array<{ table_name: string }>;
  if (!existentes.length) return false;
  if (existentes.length === TABELAS_CATALOGO_CRITERIOS.length) {
    const colunas = (await queryRunner.query(
      `SELECT table_name, column_name FROM information_schema.columns ` +
        `WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
      [schema, TABELAS_CATALOGO_CRITERIOS],
    )) as Array<{ table_name: string; column_name: string }>;
    const presentes = new Set(
      colunas.map((c) => `${c.table_name}.${c.column_name}`),
    );
    const ausentes = Object.entries(COLUNAS_CATALOGO_CRITERIOS).flatMap(
      ([tabela, nomes]) =>
        nomes
          .filter((coluna) => !presentes.has(`${tabela}.${coluna}`))
          .map((coluna) => `${tabela}.${coluna}`),
    );
    if (!ausentes.length) return true;
    throw new Error(
      `CatalogoCriteriosMatching recusada: colunas ausentes: ${ausentes.join(', ')}.`,
    );
  }
  throw new Error(
    'CatalogoCriteriosMatching recusada: estado parcial ' +
      `(existe: ${existentes
        .map((t) => t.table_name)
        .sort()
        .join(', ')}).`,
  );
}

/** Catálogo reutilizável de critérios estruturados + sementes dos campos legados. */
export class CatalogoCriteriosMatching1792600000000 implements MigrationInterface {
  name = 'CatalogoCriteriosMatching1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await jaAplicada(queryRunner)) return;
    const s = schemaDe(queryRunner);
    await queryRunner.query(`
      CREATE TABLE ${s}."matching_criterios" (
        "id" SERIAL NOT NULL,
        "nome" varchar(120) NOT NULL,
        "nome_normalizado" varchar(120) NOT NULL,
        "descricao" text,
        "ativo" boolean NOT NULL DEFAULT true,
        "versao_atual" integer NOT NULL DEFAULT 1 CHECK ("versao_atual" > 0),
        "criado_por" varchar(120),
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_criterios" PRIMARY KEY ("id"),
        CONSTRAINT "uq_matching_criterio_nome_norm" UNIQUE ("nome_normalizado")
      );
      CREATE INDEX "idx_matching_criterio_ativo" ON ${s}."matching_criterios" ("ativo");

      CREATE TABLE ${s}."matching_criterio_versoes" (
        "id" SERIAL NOT NULL,
        "criterio_id" integer NOT NULL,
        "versao" integer NOT NULL CHECK ("versao" > 0),
        "enunciado_padrao" varchar(200) NOT NULL,
        "tipo" varchar(30) NOT NULL CHECK ("tipo" IN ('sim_nao','escolha_unica','multipla_escolha')),
        "alternativas" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "criado_por" varchar(120),
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_matching_criterio_versoes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_matching_criterio_versao_criterio" FOREIGN KEY ("criterio_id")
          REFERENCES ${s}."matching_criterios"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_matching_criterio_versao" UNIQUE ("criterio_id", "versao")
      );
    `);

    // Sementes equivalentes aos campos fixos já usados no matching (multipla escolha).
    // Alternativas vazias: o conteúdo vem das respostas existentes; a definição
    // tipa o critério. Programas antigos com configs campo→campo precisam reconfigurar
    // se não houver equivalência estruturada de alternativas.
    const sementes = [
      {
        nome: 'Disponibilidade',
        nomeNorm: 'disponibilidade',
        descricao: 'Horários ou turnos em que a pessoa está disponível.',
        enunciado: 'Qual é a sua disponibilidade?',
        tipo: 'multipla_escolha',
        alternativas: JSON.stringify([
          { id: 'manha', rotulo: 'Manhã' },
          { id: 'tarde', rotulo: 'Tarde' },
          { id: 'noite', rotulo: 'Noite' },
          { id: 'fim_de_semana', rotulo: 'Fim de semana' },
        ]),
      },
      {
        nome: 'Áreas de apoio',
        nomeNorm: 'areas',
        descricao:
          'Áreas em que o padrinho pode apoiar ou o apadrinhado precisa de apoio.',
        enunciado: 'Quais áreas de apoio são relevantes para você?',
        tipo: 'multipla_escolha',
        alternativas: JSON.stringify([
          { id: 'academico', rotulo: 'Acadêmico' },
          { id: 'carreira', rotulo: 'Carreira' },
          { id: 'pessoal', rotulo: 'Pessoal' },
          { id: 'social', rotulo: 'Social' },
        ]),
      },
      {
        nome: 'Interesses',
        nomeNorm: 'interesses',
        descricao: 'Interesses em comum para afinidade.',
        enunciado: 'Quais são os seus interesses?',
        tipo: 'multipla_escolha',
        alternativas: JSON.stringify([
          { id: 'tecnologia', rotulo: 'Tecnologia' },
          { id: 'esportes', rotulo: 'Esportes' },
          { id: 'artes', rotulo: 'Artes' },
          { id: 'voluntariado', rotulo: 'Voluntariado' },
        ]),
      },
    ];
    for (const semente of sementes) {
      const rows = (await queryRunner.query(
        `INSERT INTO ${s}."matching_criterios"
          ("nome", "nome_normalizado", "descricao", "ativo", "versao_atual", "criado_por")
         VALUES ($1, $2, $3, true, 1, 'migration:catalogo')
         ON CONFLICT ("nome_normalizado") DO NOTHING
         RETURNING "id"`,
        [semente.nome, semente.nomeNorm, semente.descricao],
      )) as Array<{ id: number }>;
      const id =
        rows[0]?.id ??
        (
          (await queryRunner.query(
            `SELECT "id" FROM ${s}."matching_criterios" WHERE "nome_normalizado" = $1`,
            [semente.nomeNorm],
          )) as Array<{ id: number }>
        )[0]?.id;
      if (!id) continue;
      await queryRunner.query(
        `INSERT INTO ${s}."matching_criterio_versoes"
          ("criterio_id", "versao", "enunciado_padrao", "tipo", "alternativas", "criado_por")
         VALUES ($1, 1, $2, $3, $4::jsonb, 'migration:catalogo')
         ON CONFLICT ("criterio_id", "versao") DO NOTHING`,
        [id, semente.enunciado, semente.tipo, semente.alternativas],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ usados }] = (await queryRunner.query(
      `SELECT (` +
        TABELAS_CATALOGO_CRITERIOS.map(
          (t) => `(SELECT count(*) FROM ${s}."${t}")`,
        ).join(' + ') +
        `)::int AS usados`,
    )) as Array<{ usados: number }>;
    if (usados > 0 && process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true') {
      throw new Error(
        `Rollback recusado: ${usados} registro(s) do catálogo seriam descartados.`,
      );
    }
    await queryRunner.query(`
      DROP TABLE ${s}."matching_criterio_versoes";
      DROP TABLE ${s}."matching_criterios";
    `);
  }
}
