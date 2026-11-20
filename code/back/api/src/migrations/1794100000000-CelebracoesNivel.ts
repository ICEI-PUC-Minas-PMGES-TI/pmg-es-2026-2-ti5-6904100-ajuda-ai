import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Limiares dos níveis quando esta migration foi escrita (cópia congelada de
 * `NIVEIS` em economia.ts): a migration histórica não muda se a tabela de
 * níveis mudar depois.
 */
export const LIMIARES_NIVEIS_V1 = [
  0, 50, 150, 300, 500, 750, 1050, 1400, 1950, 2600,
] as const;

/** Nível (1..n) de uma coluna de XP, em SQL, pelos limiares dados. */
export function sqlNivelDe(
  coluna: string,
  limiares: readonly number[] = LIMIARES_NIVEIS_V1,
): string {
  const casos = limiares
    .map((xp, i) => ({ xp, nivel: i + 1 }))
    .slice(1)
    .reverse()
    .map(({ xp, nivel }) => `WHEN ${coluna} >= ${xp} THEN ${nivel}`)
    .join(' ');
  return `(CASE ${casos} ELSE 1 END)`;
}

/** Schema configurado no DataSource (DB_SCHEMA; padrão `feed`), já entre aspas. */
function schemaUsuarios(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options as { schema?: string };
  return `"${(options.schema ?? 'feed').replaceAll('"', '""')}"`;
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
 * Revisar antes de executar no banco compartilhado (só cria e preenche a
 * tabela nova; nenhuma linha existente é alterada).
 */
export class CelebracoesNivel1794100000000 implements MigrationInterface {
  name = 'CelebracoesNivel1794100000000';

  async up(qr: QueryRunner): Promise<void> {
    const g = '"gamificacao"';
    const u = schemaUsuarios(qr);
    await qr.query(
      `CREATE TABLE ${g}."celebracoes_nivel" (` +
        `"usuario_id" integer NOT NULL, ` +
        `"nivel_celebrado" integer NOT NULL DEFAULT 1, ` +
        `"atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "pk_celebracoes_nivel" PRIMARY KEY ("usuario_id"), ` +
        // Estado de interface: some junto com o usuário (o histórico de XP,
        // que importa, continua protegido por RESTRICT no ledger).
        `CONSTRAINT "fk_celebracoes_nivel_usuario" FOREIGN KEY ("usuario_id") REFERENCES ${u}."usuarios"("id") ON DELETE CASCADE, ` +
        `CONSTRAINT "ck_celebracoes_nivel_minimo" CHECK ("nivel_celebrado" >= 1))`,
    );
    await qr.query(
      `INSERT INTO ${g}."celebracoes_nivel" ("usuario_id", "nivel_celebrado") ` +
        `SELECT c."usuario_id", ${sqlNivelDe('c."xp_acumulado"')} FROM ${g}."xp_carteiras" c ` +
        `WHERE c."xp_acumulado" >= ${LIMIARES_NIVEIS_V1[1]}`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE "gamificacao"."celebracoes_nivel"`);
  }
}
