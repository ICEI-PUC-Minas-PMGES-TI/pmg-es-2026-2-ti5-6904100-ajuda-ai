// Gera o snapshot geográfico (JSON versionado no Git) a partir de um banco do
// PUCMaps e dos footprints do package `campus_map`. SOMENTE LEITURA na origem.
//
// Uso (em code/back/api):
//   PUCMAPS_DB_USER=... PUCMAPS_DB_PASSWORD=... PUCMAPS_DB_NAME=... \
//     node scripts/mapa/exportar-pucmaps.mjs [--versao 12] [--saida <arquivo>]
//
// Conexão: PUCMAPS_DB_HOST (padrão localhost), PUCMAPS_DB_PORT (5432),
// PUCMAPS_DB_USER, PUCMAPS_DB_PASSWORD, PUCMAPS_DB_NAME. Só host local: o
// banco antigo de produção nunca é acessado por este script.
// Sem --versao, usa a versão ACTIVE da origem.
//
// Regras (ver docs/tecnico/mapa/dados-geo.md):
// - prédio com footprint: chave = id do footprint; geometria do footprint, que
//   precisa ser ST_Equals ao polígono da origem; demais campos da origem;
// - prédio sem footprint: só portões (GATE, sem polígono), chave GATE_<código>;
// - footprint sem prédio na origem: entra com os dados do footprint;
// - aresta com linha degenerada (2 pontos iguais): geometria nula, exige
//   distância 0 e nós no mesmo ponto.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
// Mesmo hash que o importador confere (compilado em dist/).
import { hashDados } from '../../dist/mapa/importacao/snapshot.js';

const raiz = path.resolve(import.meta.dirname, '../..');
const FOOTPRINTS = path.resolve(
  raiz,
  '../../mobile/packages/campus_map/assets/data/campus_footprints.geojson',
);
const REPO_ORIGEM = path.resolve(raiz, '../../../../mapa-da-puc-1');
const VERSAO_ASSETS = '2026-09-30-r2';

function argumentos(argv) {
  const opcoes = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--versao') opcoes.versao = Number(argv[++i]);
    else if (argv[i] === '--saida') opcoes.saida = path.resolve(argv[++i]);
    else throw new Error(`argumento desconhecido: ${argv[i]}`);
  }
  return opcoes;
}

const geo = (texto) => (texto == null ? null : JSON.parse(texto));

async function main() {
  const opcoes = argumentos(process.argv.slice(2));
  const host = process.env.PUCMAPS_DB_HOST ?? 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('exportar-pucmaps só lê bancos locais do PUCMaps.');
  }
  const cliente = new pg.Client({
    host,
    port: Number(process.env.PUCMAPS_DB_PORT ?? 5432),
    user: process.env.PUCMAPS_DB_USER,
    password: process.env.PUCMAPS_DB_PASSWORD,
    database: process.env.PUCMAPS_DB_NAME,
  });
  await cliente.connect();
  try {
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    const q = async (sql, p) => (await cliente.query(sql, p)).rows;

    const [versao] = opcoes.versao
      ? await q(`SELECT * FROM map_versions WHERE version = $1`, [
          opcoes.versao,
        ])
      : await q(`SELECT * FROM map_versions WHERE status = 'ACTIVE'`);
    if (!versao) throw new Error('versão de origem não encontrada');
    const v = versao.id;

    const textoFootprints = fs.readFileSync(FOOTPRINTS);
    const footprints = JSON.parse(textoFootprints.toString('utf8')).features;

    const prediosOrigem = await q(
      `SELECT id, code, name, type, entrances,
              ST_AsGeoJSON(location) AS loc, ST_AsGeoJSON(polygon) AS poly
         FROM buildings WHERE "mapVersionId" = $1 ORDER BY id`,
      [v],
    );
    const porId = new Map(prediosOrigem.map((b) => [b.id, b]));
    const chavePorOrigem = new Map();
    const predios = [];
    for (const f of footprints) {
      const p = f.properties;
      const origem = p.apiId ? porId.get(p.apiId) : undefined;
      if (p.apiId && !origem) {
        throw new Error(
          `footprint ${f.id}: apiId ${p.apiId} fora da versão ${versao.version}`,
        );
      }
      if (origem) {
        const [{ igual }] = await q(
          `SELECT ST_Equals(polygon, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)) AS igual
             FROM buildings WHERE id = $1`,
          [origem.id, JSON.stringify(f.geometry)],
        );
        if (!igual)
          throw new Error(`footprint ${f.id}: polígono difere da origem`);
        chavePorOrigem.set(origem.id, f.id);
      }
      predios.push({
        id: f.id,
        idOrigem: origem?.id ?? null,
        osmId: p.osmId ?? null,
        codigo: origem?.code ?? p.code ?? null,
        nome: origem?.name ?? p.name ?? null,
        tipo: origem?.type ?? null,
        altura: p.height ?? null,
        alturaBase: p.minHeight ?? null,
        entradas: origem?.entrances ?? [],
        localizacao: origem
          ? geo(origem.loc)
          : { type: 'Point', coordinates: p.center },
        poligono: f.geometry,
      });
    }
    for (const b of prediosOrigem) {
      if (chavePorOrigem.has(b.id)) continue;
      if (b.type !== 'GATE' || b.poly !== null) {
        throw new Error(
          `prédio ${b.id} (${b.type}) sem footprint e não é portão`,
        );
      }
      const id = `GATE_${b.code}`;
      chavePorOrigem.set(b.id, id);
      predios.push({
        id,
        idOrigem: b.id,
        osmId: null,
        codigo: b.code,
        nome: b.name,
        tipo: b.type,
        altura: null,
        alturaBase: null,
        entradas: b.entrances,
        localizacao: geo(b.loc),
        poligono: null,
      });
    }

    const areas = (
      await q(
        `SELECT id, name, type, entrances, ST_AsGeoJSON(location) AS loc,
                ST_AsGeoJSON(polygon) AS poly
           FROM areas WHERE "mapVersionId" = $1 ORDER BY id`,
        [v],
      )
    ).map((a) => ({
      id: a.id,
      nome: a.name,
      tipo: a.type,
      entradas: a.entrances,
      localizacao: geo(a.loc),
      poligono: geo(a.poly),
    }));

    const salasOrigem = await q(
      `SELECT r.* FROM rooms r JOIN buildings b ON b.id = r."buildingId"
        WHERE b."mapVersionId" = $1 ORDER BY r.id`,
      [v],
    );
    const salas = salasOrigem.map((r) => ({
      id: r.id,
      predioId: chavePorOrigem.get(r.buildingId),
      nome: r.name,
      andar: r.floor,
      capacidade: r.capacity,
      tipo: r.type,
      localizacao: { type: 'Point', coordinates: [r.longitude, r.latitude] },
    }));

    const nos = (
      await q(
        `SELECT id, "buildingId", "roomId", level::float8 AS level, layer,
                ST_AsGeoJSON(location) AS loc
           FROM graph_nodes WHERE "mapVersionId" = $1 ORDER BY id`,
        [v],
      )
    ).map((n) => {
      if (n.buildingId && !chavePorOrigem.has(n.buildingId)) {
        throw new Error(`nó ${n.id}: prédio ${n.buildingId} inexistente`);
      }
      return {
        id: n.id,
        predioId: n.buildingId ? chavePorOrigem.get(n.buildingId) : null,
        salaId: n.roomId ?? null,
        nivel: n.level,
        camada: n.layer,
        localizacao: geo(n.loc),
      };
    });

    let degeneradas = 0;
    const arestas = (
      await q(
        `SELECT e.id, e."fromNodeId", e."toNodeId", e."distanceMeters",
                e."walkingTimeSeconds", e.accessible, e."isGenerated", e.layer,
                ST_AsGeoJSON(e.geometry) AS geom,
                (e.geometry IS NOT NULL AND ST_IsValid(e.geometry)) AS valida,
                ST_Equals(a.location, b.location) AS mesmo_ponto
           FROM graph_edges e
           JOIN graph_nodes a ON a.id = e."fromNodeId" AND a."mapVersionId" = e."mapVersionId"
           JOIN graph_nodes b ON b.id = e."toNodeId" AND b."mapVersionId" = e."mapVersionId"
          WHERE e."mapVersionId" = $1 ORDER BY e.id`,
        [v],
      )
    ).map((e) => {
      let geometria = geo(e.geom);
      if (!e.valida) {
        if (e.distanceMeters !== 0 || !e.mesmo_ponto) {
          throw new Error(
            `aresta ${e.id}: geometria inválida com distância ${e.distanceMeters}`,
          );
        }
        degeneradas++;
        geometria = null;
      }
      return {
        id: e.id,
        origem: e.fromNodeId,
        destino: e.toNodeId,
        distanciaM: e.distanceMeters,
        tempoCaminhadaS: e.walkingTimeSeconds,
        acessivel: e.accessible,
        gerada: e.isGenerated,
        camada: e.layer,
        geometria,
      };
    });
    await cliente.query('COMMIT');

    let commit = null;
    try {
      commit = execFileSync(
        'git',
        ['-C', REPO_ORIGEM, 'rev-parse', '--short', 'HEAD'],
        {
          encoding: 'utf8',
        },
      ).trim();
    } catch {
      // repositório de origem ausente: só não registra o commit
    }

    const codigo = `pucmaps-${versao.version}`;
    const dados = { codigo, predios, areas, salas, nos, arestas };
    const snapshot = {
      formato: 'ajuda-ai/mapa-snapshot',
      schemaVersion: 1,
      codigo,
      versaoAssets: VERSAO_ASSETS,
      hashDados: hashDados(dados),
      origem: {
        projeto: 'PUCMaps',
        repositorioCommit: commit,
        banco: 'pucmaps (docker local)',
        versao: versao.version,
        versaoId: versao.id,
        status: versao.status,
        atualizadaEm: versao.updatedAt,
        bbox: versao.bbox,
        footprints: {
          arquivo:
            'code/mobile/packages/campus_map/assets/data/campus_footprints.geojson',
          sha256: crypto
            .createHash('sha256')
            .update(textoFootprints)
            .digest('hex'),
        },
        osm: {
          provider: 'OpenStreetMap',
          license: 'ODbL 1.0',
          attribution: '© OpenStreetMap contributors',
          timestamp: '2026-09-30T17:10:14Z',
        },
        transformacoes: {
          prediosComFootprint: predios.filter((p) => p.poligono).length,
          portoesSemFootprint: predios.filter((p) => p.tipo === 'GATE').length,
          footprintsSemOrigem: predios.filter((p) => !p.idOrigem).length,
          arestasDegeneradasSemGeometria: degeneradas,
        },
      },
      predios,
      areas,
      salas,
      nos,
      arestas,
    };
    const saida =
      opcoes.saida ??
      path.join(raiz, 'scripts', 'mapa', 'dados', `${codigo}.json`);
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    fs.writeFileSync(saida, serializar(snapshot));
    console.log(
      `${codigo}: ${predios.length} prédios, ${areas.length} áreas, ${salas.length} salas, ` +
        `${nos.length} nós, ${arestas.length} arestas (${degeneradas} sem geometria) → ${path.relative(raiz, saida)}`,
    );
  } finally {
    await cliente.end();
  }
}

/** Um registro por linha: arquivo legível e diff pequeno entre versões. */
function serializar(snapshot) {
  const linhas = ['{'];
  const chaves = Object.keys(snapshot);
  chaves.forEach((chave, i) => {
    const fim = i === chaves.length - 1 ? '' : ',';
    const valor = snapshot[chave];
    if (Array.isArray(valor) && valor.length) {
      linhas.push(`  ${JSON.stringify(chave)}: [`);
      valor.forEach((item, j) =>
        linhas.push(
          `    ${JSON.stringify(item)}${j === valor.length - 1 ? '' : ','}`,
        ),
      );
      linhas.push(`  ]${fim}`);
    } else {
      linhas.push(`  ${JSON.stringify(chave)}: ${JSON.stringify(valor)}${fim}`);
    }
  });
  linhas.push('}');
  return `${linhas.join('\n')}\n`;
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
