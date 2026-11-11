import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { MapaService } from './mapa.service.js';

/** DataSource falso: responde catálogo/versão e grava SQL e parâmetros. */
function fonte(opcoes: { ativa?: boolean } = {}) {
  const chamadas: Array<{ sql: string; params?: unknown[] }> = [];
  const ds = {
    query: async (sql: string, params?: unknown[]) => {
      chamadas.push({ sql, params });
      if (sql.includes('FROM pg_extension')) return [{ schema: 'extensions' }];
      // Só a checagem isolada; as leituras usam a versão como subconsulta.
      if (sql.startsWith(`SELECT "id" FROM "mapa"."versoes"`)) {
        return opcoes.ativa === false ? [] : [{ id: 'v1' }];
      }
      return [];
    },
  } as unknown as DataSource;
  return { ds, chamadas };
}

describe('MapaService (sem banco)', () => {
  it('busca vazia não consulta o banco', async () => {
    const { ds, chamadas } = fonte();
    const servico = new MapaService(ds);
    expect(await servico.buscar(undefined)).toEqual([]);
    expect(await servico.buscar('   ')).toEqual([]);
    expect(chamadas).toEqual([]);
  });

  it('a entrada vai só como parâmetro; schema vem do catálogo', async () => {
    const { ds, chamadas } = fonte();
    const q = `'); DROP TABLE mapa.predios; --`;
    await new MapaService(ds).buscar(q, '5');
    const busca = chamadas.find((c) => c.sql.startsWith('WITH ativa'))!;
    expect(busca.sql).not.toContain('DROP');
    expect(busca.sql).not.toContain(q);
    expect(busca.params).toEqual([q, 5]);
    expect(busca.sql).toContain(
      '"extensions".unaccent(\'"extensions".unaccent\'::regdictionary',
    );
    expect(busca.sql).not.toMatch(/\bLIKE\b/i);
  });

  it('limite fora de 1..20 → 400', async () => {
    const servico = new MapaService(fonte().ds);
    for (const limite of ['0', '21', 'x', '-1', '2.5']) {
      await expect(servico.buscar('a', limite)).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it('sem versão ativa → 503; prédio inexistente → 404', async () => {
    await expect(
      new MapaService(fonte({ ativa: false }).ds).predios(),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(new MapaService(fonte().ds).predio('P999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('consultas filtram pela versão ativa', async () => {
    const { ds, chamadas } = fonte();
    const servico = new MapaService(ds);
    await servico.predios();
    await servico.areas();
    await servico.salas();
    const leituras = chamadas.filter((c) =>
      /FROM "mapa"\."(predios|areas|salas)"/.test(c.sql),
    );
    expect(leituras).toHaveLength(3);
    for (const c of leituras) {
      expect(c.sql).toContain(
        `"versao_id" = (SELECT "id" FROM "mapa"."versoes" WHERE "status" = 'ativa')`,
      );
      expect(c.params).toBeUndefined();
    }
  });
});
