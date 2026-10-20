import { getMetadataArgsStorage } from 'typeorm';
import { ENTIDADES_MAPA } from './index.js';

describe('entidades do schema mapa', () => {
  const storage = getMetadataArgsStorage();
  const tabela = (alvo: unknown) =>
    storage.tables.find((t) => t.target === alvo)!;
  const colunas = (alvo: unknown) =>
    storage.columns.filter((c) => c.target === alvo);

  it('todas no schema mapa, nomes em português/snake_case', () => {
    expect(ENTIDADES_MAPA.map((e) => tabela(e).name)).toEqual([
      'versoes',
      'predios',
      'salas',
      'areas',
      'nos_grafo',
      'arestas_grafo',
    ]);
    for (const e of ENTIDADES_MAPA) {
      expect(tabela(e).schema).toBe('mapa');
      for (const c of colunas(e)) {
        const nome = c.options.name ?? c.propertyName;
        expect(nome).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it('geometrias tipadas com SRID 4326', () => {
    const espaciais = ENTIDADES_MAPA.flatMap((e) =>
      colunas(e)
        .filter((c) => c.options.type === 'geometry')
        .map((c) => [
          `${tabela(e).name}.${c.options.name ?? c.propertyName}`,
          c.options.spatialFeatureType,
          c.options.srid,
        ]),
    );
    expect(espaciais).toEqual([
      ['predios.localizacao', 'Point', 4326],
      ['predios.poligono', 'Polygon', 4326],
      ['salas.localizacao', 'Point', 4326],
      ['areas.localizacao', 'Point', 4326],
      ['areas.poligono', 'Polygon', 4326],
      ['nos_grafo.localizacao', 'Point', 4326],
      ['arestas_grafo.geometria', 'LineString', 4326],
    ]);
  });

  it('chave por versão e nenhuma relação em cascata', () => {
    for (const e of ENTIDADES_MAPA.slice(1)) {
      const primarias = colunas(e)
        .filter((c) => c.mode === 'regular' && c.options.primary)
        .map((c) => c.propertyName);
      expect(primarias, tabela(e).name).toEqual(['versaoId', 'id']);
    }
    const relacoes = storage.relations.filter((r) =>
      ENTIDADES_MAPA.includes(r.target as never),
    );
    expect(relacoes.length).toBeGreaterThan(0);
    for (const r of relacoes) {
      expect(r.options.onDelete).toBe('RESTRICT');
      expect(r.options.cascade ?? false).toBe(false);
    }
  });
});
