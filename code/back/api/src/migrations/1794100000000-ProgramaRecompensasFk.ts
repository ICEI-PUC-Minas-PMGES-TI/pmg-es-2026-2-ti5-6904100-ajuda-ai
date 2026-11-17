import type { MigrationInterface, QueryRunner } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao/gamificacao.js';

/**
 * `recompensas.programa_codigo` passa a referenciar `programas.codigo`.
 * Excluir um programa com recompensas restritas a ele fica bloqueado
 * (RESTRICT → 409 em `ProgramasService`), em vez de deixar recompensas órfãs.
 * Se já houver órfãs, a migration recusa e lista os códigos para correção manual.
 * Era `1793700000000`; renomeada para depois da Sprint-6 (timestamp repetido).
 */
export class ProgramaRecompensasFk1794100000000 implements MigrationInterface {
  name = 'ProgramaRecompensasFk1794100000000';

  async up(qr: QueryRunner): Promise<void> {
    const schema =
      (qr.connection.options as { schema?: string }).schema ?? 'feed';
    const u = `"${schema.replaceAll('"', '""')}"`;
    const r = `"${SCHEMA_GAMIFICACAO}"."recompensas"`;

    // Já aplicada com o nome antigo (ProgramaRecompensasFk1793700000000).
    const [existe] = (await qr.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'fk_recompensas_programa'`,
    )) as unknown[];
    if (existe) return;

    const orfas = (await qr.query(
      `SELECT DISTINCT x."programa_codigo" AS codigo FROM ${r} x ` +
        `WHERE x."programa_codigo" IS NOT NULL ` +
        `AND NOT EXISTS (SELECT 1 FROM ${u}."programas" p WHERE p."codigo" = x."programa_codigo")`,
    )) as Array<{ codigo: string }>;
    if (orfas.length > 0) {
      throw new Error(
        `Recompensas ligadas a programas inexistentes: ${orfas.map((o) => o.codigo).join(', ')}. ` +
          'Corrija programa_codigo dessas recompensas antes de rodar a migration.',
      );
    }

    await qr.query(
      `ALTER TABLE ${r} ADD CONSTRAINT "fk_recompensas_programa" ` +
        `FOREIGN KEY ("programa_codigo") REFERENCES ${u}."programas"("codigo") ` +
        `ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    await qr.query(
      `CREATE INDEX "idx_recompensas_programa" ON ${r} ("programa_codigo") ` +
        `WHERE "programa_codigo" IS NOT NULL`,
    );
  }

  async down(qr: QueryRunner): Promise<void> {
    const g = `"${SCHEMA_GAMIFICACAO}"`;
    await qr.query(`DROP INDEX ${g}."idx_recompensas_programa"`);
    await qr.query(
      `ALTER TABLE ${g}."recompensas" DROP CONSTRAINT "fk_recompensas_programa"`,
    );
  }
}
