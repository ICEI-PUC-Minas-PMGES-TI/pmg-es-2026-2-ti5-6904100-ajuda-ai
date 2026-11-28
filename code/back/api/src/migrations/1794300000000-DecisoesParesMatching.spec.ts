import type { QueryRunner } from 'typeorm';
import { DecisoesParesMatching1794300000000 } from './1794300000000-DecisoesParesMatching.js';

describe('Migração das decisões de pares', () => {
  it('cria histórico separado, protege referências e importa recusas antigas sem regravá-las', async () => {
    const comandos: string[] = [];
    const runner = {
      connection: { options: { schema: 'feed' } },
      query: async (sql: string) => {
        comandos.push(sql);
      },
    } as unknown as QueryRunner;
    await new DecisoesParesMatching1794300000000().up(runner);
    const sql = comandos.join('\n');
    expect(sql).toContain('CREATE TABLE "feed"."matching_pares_decisoes"');
    expect(sql).toContain('"evento_anterior_id"');
    expect(sql).toContain('length(btrim("motivo")) > 0');
    expect(sql).toContain('LEFT JOIN "feed"."matching_decisoes"');
    expect(sql).toContain('COALESCE(d."responsavel", s."decidida_por"');
    expect(sql).toContain(
      'WHERE s."status" = \'recusada\' OR d."decisao" = \'recusada\'',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX');
    expect(sql).not.toMatch(/UPDATE |DELETE FROM|TRUNCATE|DROP TABLE/);
  });
  it('escapa o nome configurado do schema como identificador', async () => {
    const comandos: string[] = [];
    const runner = {
      connection: { options: { schema: 'ciclo"teste' } },
      query: async (sql: string) => {
        comandos.push(sql);
      },
    } as unknown as QueryRunner;
    await new DecisoesParesMatching1794300000000().up(runner);
    expect(comandos[0]).toContain('"ciclo""teste"."matching_pares_decisoes"');
  });
});
