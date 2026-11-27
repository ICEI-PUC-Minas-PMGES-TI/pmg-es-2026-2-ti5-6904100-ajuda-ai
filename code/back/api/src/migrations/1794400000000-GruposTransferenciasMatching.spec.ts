import type { QueryRunner } from 'typeorm';
import { GruposTransferenciasMatching1794400000000 } from './1794400000000-GruposTransferenciasMatching.js';

describe('Migração dos grupos canônicos', () => {
  it('preserva fotografia legada antes das projeções e não cria relações por nome', async () => {
    const sql: string[] = [];
    const qr = {
      connection: { options: { schema: 'teste' } },
      query: async (q: string) => sql.push(q),
    } as unknown as QueryRunner;
    await new GruposTransferenciasMatching1794400000000().up(qr);
    const codigo = sql.join('\n');
    expect(codigo).toContain('"teste".matching_grupos');
    expect(codigo).toContain('operacao_id UUID NOT NULL');
    expect(codigo).toContain('uq_matching_vinculo_operacao');
    expect(codigo).toContain('vinculo_fora_ciclo');
    expect(codigo).not.toMatch(
      /DELETE FROM|TRUNCATE|DROP TABLE|INSERT INTO .*matching_vinculos\s*\(/i,
    );
    expect(
      sql.findIndex((s) =>
        s.startsWith('INSERT INTO "teste".matching_grupos_conciliacao'),
      ),
    ).toBeLessThan(
      sql.findIndex((s) => s.startsWith('UPDATE "teste".participacoes')),
    );
  });
  it('escapa o schema e exige recuperação planejada para reverter dados migrados', async () => {
    const sql: string[] = [];
    const qr = {
      connection: { options: { schema: 'test"e' } },
      query: async (q: string) => sql.push(q),
    } as unknown as QueryRunner;
    const migration = new GruposTransferenciasMatching1794400000000();
    await migration.up(qr);
    expect(sql[0]).toContain('"test""e"');
    await expect(migration.down(qr)).rejects.toThrow(/backup/);
  });
});
