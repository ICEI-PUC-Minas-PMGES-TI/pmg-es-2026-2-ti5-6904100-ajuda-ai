import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O feed passa a ser por ciclo (semestre): cada publicação guarda o código do
 * programa em que nasceu e a listagem mostra só o ciclo atual (DP-01).
 *
 * Publicações antigas ficam no semestre da própria data de criação, com a mesma
 * regra do app (jan–jun = 1, jul–dez = 2), no fuso de Brasília.
 *
 * Revisar antes de executar no banco compartilhado. Não executa automaticamente.
 */
export class FeedPorCiclo1793900000000 implements MigrationInterface {
  name = 'FeedPorCiclo1793900000000';

  async up(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? 'feed';
    const s = `"${schema.replaceAll('"', '""')}"`;
    await runner.query(
      `ALTER TABLE ${s}.publicacoes ADD COLUMN programa_codigo varchar(20)`,
    );
    await runner.query(`UPDATE ${s}.publicacoes SET programa_codigo =
      to_char(criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '/' ||
      CASE WHEN extract(month FROM criado_em AT TIME ZONE 'America/Sao_Paulo') <= 6
        THEN '1' ELSE '2' END`);
    // DEFAULT = semestre de agora: versões antigas do app, que ainda inserem
    // publicações sem informar o ciclo, continuam funcionando.
    await runner.query(`ALTER TABLE ${s}.publicacoes ALTER COLUMN programa_codigo
      SET DEFAULT (
        to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '/' ||
        CASE WHEN extract(month FROM now() AT TIME ZONE 'America/Sao_Paulo') <= 6
          THEN '1' ELSE '2' END)`);
    await runner.query(
      `ALTER TABLE ${s}.publicacoes ALTER COLUMN programa_codigo SET NOT NULL`,
    );
    await runner.query(
      `CREATE INDEX idx_publicacoes_programa ON ${s}.publicacoes(programa_codigo, criado_em DESC)`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema =
      (runner.connection.options as { schema?: string }).schema ?? 'feed';
    const s = `"${schema.replaceAll('"', '""')}"`;
    await runner.query(`DROP INDEX ${s}.idx_publicacoes_programa`);
    await runner.query(
      `ALTER TABLE ${s}.publicacoes DROP COLUMN programa_codigo`,
    );
  }
}
