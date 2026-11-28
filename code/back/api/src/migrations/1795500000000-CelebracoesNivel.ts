import type { MigrationInterface, QueryRunner } from 'typeorm';
import {
  diferencasDeEstrutura,
  marcaCriadoPor,
  migrationRegistrada,
} from '../database/estrutura-migrations.js';
import { LIMIARES_NIVEIS_V1, sqlNivelDe } from '../gamificacao/celebracoes-sql.js';

const NOME = 'CelebracoesNivel1795500000000';
/** Nome anterior, antes da renomeação para depois da Sprint-6. */
const LEGADA = 'CelebracoesNivel1794100000000';
const g = '"gamificacao"';

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
}

/** DDL da tabela, no schema dado (o real ou o temporário da conferência). */
function criarTabela(schema: string, usuarios: string): string {
  return (
    `CREATE TABLE ${schema}."celebracoes_nivel" (` +
    `"usuario_id" integer NOT NULL, ` +
    `"nivel_celebrado" integer NOT NULL DEFAULT 1, ` +
    `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
    `CONSTRAINT "pk_celebracoes_nivel" PRIMARY KEY ("usuario_id"), ` +
    // Estado de interface: some junto com o usuário (o histórico de XP,
    // que importa, continua protegido por RESTRICT no ledger).
    `CONSTRAINT "fk_celebracoes_nivel_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${usuarios}."usuarios"("id") ON DELETE CASCADE, ` +
    `CONSTRAINT "ck_celebracoes_nivel_minimo" CHECK ("nivel_celebrado" >= 1))`
  );
}

async function tabelaExiste(qr: QueryRunner): Promise<boolean> {
  const [linha] = (await qr.query(
    `SELECT to_regclass('gamificacao.celebracoes_nivel') IS NOT NULL AS existe`,
  )) as Array<{ existe: boolean }>;
  return Boolean(linha?.existe);
}

/**
 * Animação de conquista de nível: guarda, por usuário, o último nível cuja
 * conquista já foi celebrada. Estado de apresentação, separado do ledger: não
 * mexe em XP, moedas nem coletas.
 *
 * - Sem linha = nível 1 celebrado (todo usuário começa no nível 1).
 * - Backfill: quem já tem XP fica com o nível atual "celebrado", para que a
 *   implantação não dispare animações de conquistas antigas.
 * - O nível só avança (o servidor grava `GREATEST`) e nunca passa do nível
 *   real; uma correção administrativa que reduza o XP não gera nova
 *   celebração ao recuperar o nível.
 *
 * Era `1794100000000`, o mesmo timestamp de `ProgramaRecompensasFk` da
 * Sprint-6; renomeada para rodar depois de todas as migrations da Sprint-6.
 * Num banco em que a versão antiga já rodou (inclusive pelo script
 * `celebracoes:aplicar`), a tabela existe: o `up` só a adota se a estrutura
 * for idêntica à esperada (conferida pelo catálogo) e não refaz o backfill.
 * Qualquer divergência aborta sem alterar nada. O `down` só remove a tabela
 * criada por esta migration; a adotada da versão antiga fica.
 *
 * Revisar antes de executar no banco compartilhado (só cria e preenche a
 * tabela nova; nenhuma linha existente é alterada).
 */
export class CelebracoesNivel1795500000000 implements MigrationInterface {
  name = NOME;

  async up(qr: QueryRunner): Promise<void> {
    const u = schemaUsuarios(qr);
    if (await tabelaExiste(qr)) {
      const diferencas = await diferencasDeEstrutura(
        qr,
        'gamificacao',
        ['celebracoes_nivel'],
        async (temporario) => {
          await qr.query(criarTabela(`"${temporario}"`, u));
        },
      );
      if (diferencas.length > 0) {
        throw new Error(
          `${NOME}: gamificacao.celebracoes_nivel já existe com estrutura diferente ` +
            `da esperada; nada foi alterado. Diferenças: ${diferencas.join('; ')}`,
        );
      }
      return;
    }
    await qr.query(criarTabela(g, u));
    await qr.query(
      `INSERT INTO ${g}."celebracoes_nivel" ("usuario_id", "nivel_celebrado") ` +
        `SELECT c."usuario_id", ${sqlNivelDe('c."xp_acumulado"')} FROM ${g}."xp_carteiras" c ` +
        `WHERE c."xp_acumulado" >= ${LIMIARES_NIVEIS_V1[1]}`,
    );
    await qr.query(
      `COMMENT ON TABLE ${g}."celebracoes_nivel" IS '${marcaCriadoPor(NOME)}'`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    if (!(await tabelaExiste(qr))) return;
    const [linha] = (await qr.query(
      `SELECT obj_description('gamificacao.celebracoes_nivel'::regclass, 'pg_class') AS comentario`,
    )) as Array<{ comentario: string | null }>;
    const criadaPorEsta = linha?.comentario === marcaCriadoPor(NOME);
    // Adotada da versão antiga (registrada com o nome legado): fica.
    if (!criadaPorEsta && (await migrationRegistrada(qr, LEGADA))) return;
    await qr.query(`DROP TABLE ${g}."celebracoes_nivel"`);
  }
}
