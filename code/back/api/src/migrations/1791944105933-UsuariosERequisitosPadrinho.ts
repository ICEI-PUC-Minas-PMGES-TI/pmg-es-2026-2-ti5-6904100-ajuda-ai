import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaDe(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

const COLUNAS_USUARIOS = [
  'id',
  'nome',
  'email',
  'curso',
  'periodo',
  'turno',
  'interesses',
  'tipo_participacao',
  'status_cadastro',
  'motivo_rejeicao',
  'analisado_em',
  'analisado_por',
  'criado_em',
  'atualizado_em',
];

/**
 * `true` quando `usuarios` (com todas as colunas) e
 * `programas.requisitos_padrinho` já existem; `false` quando nenhuma das
 * duas existe; erro em qualquer estado intermediário.
 */
async function jaAplicada(queryRunner: QueryRunner): Promise<boolean> {
  const options = queryRunner.connection.options as { schema?: string };
  const schema = options.schema ?? 'feed';
  const colunas = (await queryRunner.query(
    `SELECT table_name, column_name FROM information_schema.columns ` +
      `WHERE table_schema = $1 AND (table_name = 'usuarios' ` +
      `OR (table_name = 'programas' AND column_name = 'requisitos_padrinho'))`,
    [schema],
  )) as Array<{ table_name: string; column_name: string }>;
  const usuarios = new Set(
    colunas
      .filter((c) => c.table_name === 'usuarios')
      .map((c) => c.column_name),
  );
  const requisitos = colunas.some((c) => c.table_name === 'programas');
  if (usuarios.size === 0 && !requisitos) return false;
  const faltando = COLUNAS_USUARIOS.filter((c) => !usuarios.has(c));
  if (requisitos && usuarios.size > 0 && faltando.length === 0) return true;
  throw new Error(
    'UsuariosERequisitosPadrinho recusada: estado parcial ' +
      `(usuarios: ${usuarios.size ? `faltam ${faltando.join(', ') || 'nada'}` : 'ausente'}; ` +
      `requisitos_padrinho: ${requisitos ? 'existe' : 'ausente'}). Nada foi alterado.`,
  );
}

/**
 * Deixa um banco criado antes do cadastro/requisitos compatível com as
 * entidades atuais, sem tocar em tabelas ou dados existentes:
 *
 * - cria `usuarios` (UsuarioEntity), vazia;
 * - adiciona `programas.requisitos_padrinho` (jsonb, NULL = ciclo ainda não
 *   configurado pela coordenação).
 *
 * Fora de propósito: `publicacoes.imagens` já tem `DEFAULT ARRAY[]::text[]`;
 * a diferença apontada pelo TypeORM é falso positivo de comparação de
 * default de array. Não há FK participacoes → usuarios: a ligação é pelo
 * e-mail (`participacoes.usuario_id`), como nas entidades.
 *
 * Nomes de PK/UNIQUE iguais aos que o TypeORM gera para a entidade, para não
 * surgirem diferenças em comparações futuras.
 */
export class UsuariosERequisitosPadrinho1791944105933 implements MigrationInterface {
  name = 'UsuariosERequisitosPadrinho1791944105933';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    // Bancos locais criados por `synchronize` já têm as duas mudanças, mas
    // não têm o registro desta migration. Só pula quando as duas existem e
    // `usuarios` tem todas as colunas abaixo; estado parcial falha, sem
    // IF NOT EXISTS, para não seguir com uma estrutura diferente.
    if (await jaAplicada(queryRunner)) return;
    await queryRunner.query(
      `CREATE TABLE ${s}."usuarios" (` +
        `"id" SERIAL NOT NULL, ` +
        `"nome" character varying(120) NOT NULL, ` +
        `"email" character varying(120) NOT NULL, ` +
        `"curso" character varying(120) NOT NULL, ` +
        `"periodo" integer NOT NULL, ` +
        `"turno" character varying(40), ` +
        `"interesses" jsonb, ` +
        `"tipo_participacao" character varying(20) NOT NULL, ` +
        `"status_cadastro" character varying(20) NOT NULL DEFAULT 'pendente', ` +
        `"motivo_rejeicao" text, ` +
        `"analisado_em" TIMESTAMP WITH TIME ZONE, ` +
        `"analisado_por" character varying(120), ` +
        `"criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), ` +
        `CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    // Nullable e sem default: os programas existentes ficam com NULL, que o
    // código trata como "sem requisitos configurados" (lista vazia).
    await queryRunner.query(
      `ALTER TABLE ${s}."programas" ADD "requisitos_padrinho" jsonb`,
    );
  }

  /**
   * Rollback seguro: recusa-se a apagar se já houver usuários cadastrados ou
   * requisitos configurados (perderia dados reais). Para descartar mesmo
   * assim, rode com MIGRATION_DOWN_DESCARTAR_DADOS=true.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const s = schemaDe(queryRunner);
    const [{ usuarios }] = (await queryRunner.query(
      `SELECT count(*)::int AS usuarios FROM ${s}."usuarios"`,
    )) as Array<{ usuarios: number }>;
    const [{ requisitos }] = (await queryRunner.query(
      `SELECT count(*)::int AS requisitos FROM ${s}."programas" WHERE "requisitos_padrinho" IS NOT NULL`,
    )) as Array<{ requisitos: number }>;
    if (
      (usuarios > 0 || requisitos > 0) &&
      process.env.MIGRATION_DOWN_DESCARTAR_DADOS !== 'true'
    ) {
      throw new Error(
        `Rollback recusado: ${usuarios} usuário(s) e ${requisitos} programa(s) com requisitos seriam apagados. ` +
          'Faça backup e rode com MIGRATION_DOWN_DESCARTAR_DADOS=true se quiser mesmo descartar.',
      );
    }
    await queryRunner.query(
      `ALTER TABLE ${s}."programas" DROP COLUMN "requisitos_padrinho"`,
    );
    await queryRunner.query(`DROP TABLE ${s}."usuarios"`);
  }
}
