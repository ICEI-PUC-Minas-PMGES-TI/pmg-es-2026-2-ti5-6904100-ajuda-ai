/**
 * API de leitura do mapa contra PostgreSQL/PostGIS REAL (unaccent incluso).
 * Pulado sem MAPA_TEST_DB_URL; mesmo procedimento de
 * test/mapa-banco.integration.spec.ts (bancos `mapa_api_*`, apagados ao fim).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { ResultadoBuscaDto } from '../src/mapa/dto/mapa.dto.js';
import { importarSnapshot } from '../src/mapa/importacao/importar-snapshot.js';
import {
  hashDados,
  validarSnapshot,
  type SnapshotMapa,
} from '../src/mapa/importacao/snapshot.js';
import { MapaController } from '../src/mapa/mapa.controller.js';
import { MapaService } from '../src/mapa/mapa.service.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const snapshot = validarSnapshot(
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../scripts/mapa/dados/pucmaps-12.json'),
      'utf8',
    ),
  ),
);
const footprints = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      '../../../mobile/packages/campus_map/assets/data/campus_footprints.geojson',
    ),
    'utf8',
  ),
) as { features: Array<{ id: string; properties: { center: number[] } }> };

function urlDo(banco: string): string {
  const url = new URL(URL_TESTE!);
  url.pathname = `/${banco}`;
  return url.toString();
}

async function admin(sql: string): Promise<void> {
  const c = new pg.Client({ connectionString: URL_TESTE });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

const criados: string[] = [];
async function bancoMigrado(nome: string): Promise<DataSource> {
  const banco = `mapa_api_${nome}`;
  await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${banco}`);
  criados.push(banco);
  const ds = new DataSource({
    type: 'postgres',
    url: urlDo(banco),
    schema: 'feed',
    migrations: [
      BaselineFeed1791900000000,
      UsuariosERequisitosPadrinho1791944105933,
      HabilitaPostgisESchemaMapa1792263378656,
      CriaTabelasMapa1792263378657,
    ],
    migrationsTableName: 'migrations',
    installExtensions: false,
  });
  await ds.initialize();
  await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
  await ds.runMigrations({ transaction: 'all' });
  return ds;
}

async function aplicacao(ds: DataSource): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    controllers: [MapaController],
    providers: [MapaService, { provide: DataSource, useValue: ds }],
  }).compile();
  const app = modulo.createNestApplication();
  // Mesmo pipe global do main.ts.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

/** Porta direta de `normalizeCampusQuery` + ranking do LocalCampusPlaceRepository. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function referencia(q: string, limite = 8): string[] {
  const t = normalizar(q);
  if (!t) return [];
  const lugares = [
    ...snapshot.predios
      .filter((p) => p.nome || p.codigo)
      .map((p) => ({ id: p.id, ordem: 0, nome: p.nome, codigo: p.codigo })),
    ...snapshot.areas.map((a) => ({
      id: a.id,
      ordem: 1,
      nome: a.nome,
      codigo: null,
    })),
  ];
  const rank = (n: string, c: string) =>
    c && c === t
      ? 0
      : n && n === t
        ? 1
        : n.startsWith(t)
          ? 2
          : c.startsWith(t)
            ? 3
            : n.includes(t)
              ? 4
              : null;
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return lugares
    .map((l) => {
      const n = normalizar(l.nome ?? '');
      const c = normalizar(l.codigo ?? '');
      return { ...l, n, c, r: rank(n, c) };
    })
    .filter((l) => l.r !== null)
    .sort(
      (a, b) =>
        a.r! - b.r! ||
        a.ordem - b.ordem ||
        cmp(a.n, b.n) ||
        cmp(a.c, b.c) ||
        cmp(a.id, b.id),
    )
    .slice(0, limite)
    .map((l) => l.id);
}

describe.skipIf(!URL_TESTE)('API do mapa (PostGIS + unaccent reais)', () => {
  let ds: DataSource;
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ds = await bancoMigrado('principal');
    // Versão antiga com um prédio renomeado: precisa ficar invisível.
    const antiga = structuredClone(snapshot) as SnapshotMapa;
    antiga.codigo = 'teste-antiga';
    antiga.predios.find((p) => p.id === 'P02')!.nome = 'Prédio Arquivado Xyzzy';
    antiga.hashDados = hashDados(antiga);
    await importarSnapshot(ds, antiga, { ativar: true });
    await importarSnapshot(ds, snapshot, { ativar: true });
    app = await aplicacao(ds);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
    for (const banco of criados) {
      await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
    }
  });

  it('GET /mapa/versao: só a ativa, sem hash nem UUID', async () => {
    const r = await http().get('/mapa/versao').expect(200);
    expect(r.body).toEqual({
      codigo: 'pucmaps-12',
      status: 'ativa',
      versaoAssets: '2026-09-30-r2',
      origem: {
        projeto: 'PUCMaps',
        versao: 12,
        atualizadaEm: '2026-09-29T18:07:12.378Z',
      },
      ativadaEm: expect.any(String),
      contagens: { predios: 101, areas: 12, salas: 0 },
    });
    expect(JSON.stringify(r.body)).not.toMatch(/hash|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('GET /mapa/predios: 101 da versão ativa, centro igual ao do app', async () => {
    const r = await http().get('/mapa/predios').expect(200);
    expect(r.body).toHaveLength(101);
    expect(Object.keys(r.body[0]).sort()).toEqual([
      'altura',
      'categoria',
      'codigo',
      'id',
      'latitude',
      'longitude',
      'nome',
    ]);
    const porId = new Map(
      (
        r.body as Array<{
          id: string;
          latitude: number;
          longitude: number;
          nome: string;
        }>
      ).map((p) => [p.id, p]),
    );
    expect(porId.get('P02')!.nome).not.toMatch(/Arquivado/);
    for (const f of footprints.features) {
      const p = porId.get(f.id)!;
      expect(p.longitude).toBeCloseTo(f.properties.center[0], 9);
      expect(p.latitude).toBeCloseTo(f.properties.center[1], 9);
    }
  });

  it('GET /mapa/predios/:id: geometria GeoJSON; portão sem polígono; 404', async () => {
    const r = await http().get('/mapa/predios/P26').expect(200);
    expect(r.body).toMatchObject({
      id: 'P26',
      codigo: '26',
      nome: 'Biblioteca Padre Alberto Antoniazzi - P. 26',
      categoria: 'LIBRARY',
      geometria: { type: 'Polygon' },
    });
    expect(Array.isArray(r.body.entradas)).toBe(true);
    const portao = await http()
      .get('/mapa/predios/GATE_1097403867')
      .expect(200);
    expect(portao.body.geometria).toBeNull();
    await http().get('/mapa/predios/P999').expect(404);
    await http()
      .get(`/mapa/predios/${encodeURIComponent("P26' OR '1'='1")}`)
      .expect(404);
  });

  it('GET /mapa/areas e /mapa/salas: só a versão ativa', async () => {
    const areas = await http().get('/mapa/areas').expect(200);
    expect(areas.body).toHaveLength(12);
    expect(areas.body[0].geometria.type).toBe('Polygon');
    expect(
      new Set(areas.body.map((a: { categoria: string }) => a.categoria)),
    ).toEqual(new Set(['PARK', 'PARKING_LOT']));
    await http().get('/mapa/salas').expect(200, []);
  });

  it('busca: vazia e só espaços devolvem []', async () => {
    await http().get('/mapa/busca').expect(200, []);
    await http().get('/mapa/busca?q=').expect(200, []);
    await http().get('/mapa/busca?q=%20%20%20').expect(200, []);
  });

  it('busca: código exato, nome exato, prefixo, contém, caixa e acento', async () => {
    const ids = async (q: string) =>
      (
        (await http().get('/mapa/busca').query({ q }).expect(200))
          .body as ResultadoBuscaDto[]
      ).map((r) => r.id);
    expect((await ids('26'))[0]).toBe('P26');
    expect((await ids('1')).slice(0, 2).sort()).toEqual([
      'P01_R4751608',
      'P01_W1519720030',
    ]);
    expect((await ids('Planetário PUC Minas'))[0]).toBe('OSM_1278031371');
    expect((await ids('bibli'))[0]).toBe('P26');
    expect(await ids('Antoniazzi')).toEqual(['P26']);
    expect(await ids('BIBLIOTECA')).toEqual(await ids('biblioteca'));
    expect((await ids('planetario'))[0]).toBe('OSM_1278031371');
    expect(await ids('  planetário   puc  ')).toEqual(
      await ids('planetario puc'),
    );
    expect(await ids('Xyzzy')).toEqual([]);
  });

  it('busca: mesmo ranking da busca local do app (referência)', async () => {
    for (const q of [
      '1',
      '2',
      '26',
      'predio',
      'prédio 1',
      'bibli',
      'portao',
      'portaria',
      'estacionamento',
      'banquinho',
      'parque',
      'puc',
      'agencia',
      'teologia',
      'p. 26',
    ]) {
      const r = await http().get('/mapa/busca').query({ q }).expect(200);
      expect(
        r.body.map((x: ResultadoBuscaDto) => x.id),
        q,
      ).toEqual(referencia(q));
    }
  });

  it('busca: tipos, contrato e área depois de prédio', async () => {
    const r = await http()
      .get('/mapa/busca')
      .query({ q: 'estacionamento' })
      .expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    for (const item of r.body) {
      expect(Object.keys(item).sort()).toEqual([
        'categoria',
        'codigo',
        'id',
        'latitude',
        'longitude',
        'nome',
        'tipo',
      ]);
      expect(item.tipo).toBe('area');
    }
    const predio = (await http().get('/mapa/busca').query({ q: '26' })).body[0];
    expect(predio).toMatchObject({
      id: 'P26',
      tipo: 'predio',
      categoria: 'LIBRARY',
    });
  });

  it('busca: limite padrão 8, máximo 20, inválidos → 400', async () => {
    expect((await http().get('/mapa/busca?q=a').expect(200)).body).toHaveLength(
      8,
    );
    expect(
      (await http().get('/mapa/busca?q=a&limit=3').expect(200)).body,
    ).toHaveLength(3);
    expect(
      (await http().get('/mapa/busca?q=a&limit=20').expect(200)).body,
    ).toHaveLength(20);
    for (const limit of ['0', '21', '99', '-1', 'abc', '1.5']) {
      await http().get('/mapa/busca').query({ q: 'a', limit }).expect(400);
    }
    await http()
      .get('/mapa/busca')
      .query({ q: 'x'.repeat(101) })
      .expect(400);
    await http().get('/mapa/busca').query({ q: 'a', outro: '1' }).expect(400);
  });

  it('busca: entrada maliciosa é só texto (sem injeção nem curinga)', async () => {
    for (const q of [
      "'; DROP TABLE mapa.predios; --",
      "' OR '1'='1",
      '%',
      '_',
      '\\',
      '$1',
    ]) {
      await http().get('/mapa/busca').query({ q }).expect(200, []);
    }
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM mapa.predios`,
    );
    expect(n).toBe(202); // duas versões intactas
  });

  it('sem versão ativa: 503 controlado', async () => {
    const vazio = await bancoMigrado('sem_ativa');
    const outra = await aplicacao(vazio);
    try {
      for (const rota of [
        '/mapa/versao',
        '/mapa/predios',
        '/mapa/areas',
        '/mapa/busca?q=a',
      ]) {
        const r = await request(outra.getHttpServer()).get(rota).expect(503);
        expect(r.body.message).toBe('Mapa indisponível: nenhuma versão ativa.');
      }
    } finally {
      await outra.close();
      await vazio.destroy();
    }
  }, 60_000);
});
