import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SnapshotInvalidoError,
  hashDados,
  validarSnapshot,
  type SnapshotMapa,
} from './snapshot.js';

const ARQUIVO = resolve(
  import.meta.dirname,
  '../../../scripts/mapa/dados/pucmaps-12.json',
);
const texto = readFileSync(ARQUIVO, 'utf8');

/** Cópia mutável do snapshot real, com hash recalculado após a mudança. */
function alterado(mudar: (s: SnapshotMapa) => void, rehash = true): unknown {
  const s = JSON.parse(texto) as SnapshotMapa;
  mudar(s);
  if (rehash) s.hashDados = hashDados(s);
  return s;
}

function problemas(bruto: unknown): string[] {
  try {
    validarSnapshot(bruto);
  } catch (erro) {
    if (erro instanceof SnapshotInvalidoError) return erro.problemas;
    throw erro;
  }
  return [];
}

describe('snapshot do mapa (pucmaps-12)', () => {
  it('é válido, com as contagens auditadas na origem', () => {
    const s = validarSnapshot(JSON.parse(texto));
    expect(s.codigo).toBe('pucmaps-12');
    expect(s.versaoAssets).toBe('2026-09-30-r2');
    expect(s.predios).toHaveLength(101);
    expect(s.predios.filter((p) => p.poligono)).toHaveLength(82);
    expect(s.predios.filter((p) => p.tipo === 'GATE')).toHaveLength(19);
    expect(s.salas).toHaveLength(0);
    expect(s.areas).toHaveLength(12);
    expect(s.nos).toHaveLength(653);
    expect(s.arestas).toHaveLength(1654);
    expect(s.arestas.filter((e) => e.acessivel)).toHaveLength(1516);
    expect(s.arestas.filter((e) => e.geometria === null)).toHaveLength(32);
  });

  it('mantém as chaves dos footprints do app (2D/3D)', () => {
    const s = validarSnapshot(JSON.parse(texto));
    const footprints = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../../../../mobile/packages/campus_map/assets/data/campus_footprints.geojson',
        ),
        'utf8',
      ),
    ) as { features: Array<{ id: string }> };
    const chaves = new Set(s.predios.map((p) => p.id));
    for (const f of footprints.features) expect(chaves.has(f.id)).toBe(true);
    expect(s.predios.filter((p) => p.id.startsWith('GATE_'))).toHaveLength(19);
  });

  it('hash independe de formatação e de origem', () => {
    const s = JSON.parse(texto) as SnapshotMapa;
    const outro = { ...s, origem: { projeto: 'x' } };
    expect(hashDados(outro)).toBe(s.hashDados);
  });

  it('recusa hash divergente (conteúdo alterado sem novo hash)', () => {
    const bruto = alterado((s) => {
      s.predios[0].nome = 'Outro nome';
    }, false);
    expect(problemas(bruto).join()).toMatch(/hashDados diverge/);
  });

  it('recusa arquivo de outro formato', () => {
    expect(() => validarSnapshot({ formato: 'x' })).toThrow(
      SnapshotInvalidoError,
    );
    expect(() => validarSnapshot(null)).toThrow(SnapshotInvalidoError);
  });

  it('recusa aresta apontando para nó inexistente', () => {
    const bruto = alterado((s) => {
      s.arestas[0].destino = '00000000-0000-4000-8000-000000000000';
    });
    expect(problemas(bruto).join()).toMatch(/nó de destino .* inexistente/);
  });

  it('recusa nó removido que ainda é usado por arestas', () => {
    const bruto = alterado((s) => {
      const usado = s.arestas[0].origem;
      s.nos = s.nos.filter((n) => n.id !== usado);
    });
    expect(problemas(bruto).join()).toMatch(/nó de origem .* inexistente/);
  });

  it('recusa aresta com laço, custo negativo ou sem geometria e com distância', () => {
    expect(
      problemas(
        alterado((s) => {
          s.arestas[0].destino = s.arestas[0].origem;
        }),
      ).join(),
    ).toMatch(/laço/);
    expect(
      problemas(
        alterado((s) => {
          s.arestas[0].distanciaM = -1;
        }),
      ).join(),
    ).toMatch(/distância inválida/);
    expect(
      problemas(
        alterado((s) => {
          s.arestas[0].tempoCaminhadaS = -5;
        }),
      ).join(),
    ).toMatch(/tempo inválido/);
    expect(
      problemas(
        alterado((s) => {
          const e = s.arestas.find((a) => a.distanciaM > 0)!;
          e.geometria = null;
        }),
      ).join(),
    ).toMatch(/sem geometria com distância > 0/);
  });

  it('recusa geometria malformada (anel aberto, ponto fora de faixa, linha curta)', () => {
    expect(
      problemas(
        alterado((s) => {
          const anel = s.predios[0].poligono!.coordinates[0];
          anel[anel.length - 1] = [0, 0];
        }),
      ).join(),
    ).toMatch(/polígono inválido/);
    expect(
      problemas(
        alterado((s) => {
          s.nos[0].localizacao.coordinates = [200, 0];
        }),
      ).join(),
    ).toMatch(/ponto inválido/);
    expect(
      problemas(
        alterado((s) => {
          const e = s.arestas.find((a) => a.geometria)!;
          e.geometria!.coordinates = [e.geometria!.coordinates[0]];
        }),
      ).join(),
    ).toMatch(/linha inválida/);
  });

  it('recusa ids repetidos e referência a prédio inexistente', () => {
    expect(
      problemas(
        alterado((s) => {
          s.predios[1].id = s.predios[0].id;
        }),
      ).join(),
    ).toMatch(/prédios: id repetido/);
    expect(
      problemas(
        alterado((s) => {
          s.nos.find((n) => n.predioId)!.predioId = 'P999';
        }),
      ).join(),
    ).toMatch(/prédio P999 inexistente/);
  });
});
