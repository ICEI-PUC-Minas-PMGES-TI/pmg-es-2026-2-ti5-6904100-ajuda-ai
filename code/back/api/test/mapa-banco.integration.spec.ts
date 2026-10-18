/**
 * Integração com PostgreSQL/PostGIS REAL e descartável. Pulado sem
 * MAPA_TEST_DB_URL. Cria bancos `mapa_teste_*` no servidor indicado (nunca o
 * banco da URL) e os apaga ao final. Ver docs/tecnico/banco/migrations.md:
 *
 *   docker run -d --name mapa-teste -p 55432:5432 -e POSTGRES_PASSWORD=teste \
 *     postgis/postgis:16-3.5-alpine -c 'search_path="$user", public, extensions'
 *   MAPA_TEST_DB_URL=postgres://postgres:teste@localhost:55432/postgres npx vitest run test/mapa-banco
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { DataSource, type MigrationInterface } from 'typeorm';
import { AvisoEntity } from '../src/avisos/entities/aviso.entity.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { ENTIDADES_MAPA, PredioEntity } from '../src/mapa/entities/index.js';
import {
  ImportacaoRecusadaError,
  importarSnapshot,
  relatorioMapa,
} from '../src/mapa/importacao/importar-snapshot.js';
import {
  hashDados,
  validarSnapshot,
  type SnapshotMapa,
} from '../src/mapa/importacao/snapshot.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ComentarioEntity } from '../src/publicacoes/entities/comentario.entity.js';
import { CurtidaEntity } from '../src/publicacoes/entities/curtida.entity.js';
import { PublicacaoEntity } from '../src/publicacoes/entities/publicacao.entity.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const ENTIDADES_FEED = [
  AvisoEntity,
  FormularioEntity,
  ParticipacaoEntity,
  ProgramaEntity,
  PublicacaoEntity,
  ComentarioEntity,
  CurtidaEntity,
  UsuarioEntity,
];
const MIGRATIONS: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
];
const snapshotReal = validarSnapshot(
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../scripts/mapa/dados/pucmaps-12.json'),
      'utf8',
    ),
  ),
);

function urlDo(banco: string): string {
  const url = new URL(URL_TESTE!);
  url.pathname = `/${banco}`;
  return url.toString();
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: URL_TESTE });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const criados: string[] = [];
async function bancoNovo(
  nome: string,
  template = 'template1',
): Promise<string> {
  const banco = `mapa_teste_${nome}`;
  await admin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${banco}`);
    await c.query(`CREATE DATABASE ${banco} TEMPLATE ${template}`);
  });
  criados.push(banco);
  return banco;
}

function fonte(
  banco: string,
  entidades = [...ENTIDADES_FEED, ...ENTIDADES_MAPA],
) {
  return new DataSource({
    type: 'postgres',
    url: urlDo(banco),
    schema: 'feed',
    entities: entidades,
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    synchronize: false,
    // Como no data-source do CLI: extensões só pelas migrations.
    installExtensions: false,
    logging: false,
  });
}

async function comFonte<T>(
  banco: string,
  fn: (ds: DataSource) => Promise<T>,
  entidades?: Parameters<typeof fonte>[1],
): Promise<T> {
  const ds = fonte(banco, entidades);
  await ds.initialize();
  try {
    return await fn(ds);
  } finally {
    await ds.destroy();
  }
}

/** Estado atual do Supabase/locais: schema `feed` criado por synchronize. */
async function bancoDeSynchronize(nome: string): Promise<string> {
  const banco = await bancoNovo(nome);
  await comFonte(
    banco,
    async (ds) => {
      await ds.query('CREATE SCHEMA feed');
      await ds.synchronize();
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ('2026/2', 'Programa real', 'inscricoes')`,
      );
    },
    ENTIDADES_FEED,
  );
  return banco;
}

/**
 * Diferença que o TypeORM sempre aponta e não é real: o default de array de
 * `publicacoes.imagens` (já registrado na migration UsuariosERequisitosPadrinho).
 */
const FALSO_POSITIVO = `ALTER TABLE "feed"."publicacoes" ALTER COLUMN "imagens" SET DEFAULT ARRAY[]::text[]`;
async function diferencasEntidadesBanco(ds: DataSource): Promise<string[]> {
  const log = await ds.driver.createSchemaBuilder().log();
  return log.upQueries.map((q) => q.query).filter((q) => q !== FALSO_POSITIVO);
}

/** Único passo manual de um banco novo (ver docs/tecnico/banco/migrations.md). */
const criarSchemaFeed = (ds: DataSource) =>
  ds.query('CREATE SCHEMA IF NOT EXISTS feed');

const executadas = (ds: DataSource) =>
  ds.query(`SELECT name FROM feed.migrations ORDER BY id`) as Promise<
    Array<{ name: string }>
  >;

describe.skipIf(!URL_TESTE)(
  'banco real: migrations, PostGIS e importação',
  () => {
    afterAll(async () => {
      if (!URL_TESTE) return;
      await admin(async (c) => {
        for (const banco of criados)
          await c.query(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
      });
    });

    it('A) banco vazio: migrations criam feed + mapa iguais às entidades', async () => {
      const banco = await bancoNovo('vazio');
      await comFonte(banco, async (ds) => {
        // Sem ele o TypeORM falha ao criar feed.migrations antes da 1ª migration.
        await criarSchemaFeed(ds);
        const rodadas = await ds.runMigrations({ transaction: 'all' });
        expect(rodadas.map((m) => m.name)).toEqual(
          MIGRATIONS.map((m) => new m().name!),
        );
        // O que o synchronize faria para casar entidades e banco: nada.
        expect(await diferencasEntidadesBanco(ds)).toEqual([]);
        const [{ schema }] = await ds.query(
          `SELECT extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname = 'postgis'`,
        );
        expect(schema).toBe('extensions');
        expect(
          await ds.query(
            `SELECT extname FROM pg_extension WHERE extname = 'pgrouting'`,
          ),
        ).toEqual([]);
      });
    });

    it('B) banco de synchronize sem tabela de migrations (local): reconhece e preserva dados', async () => {
      const banco = await bancoDeSynchronize('synchronize');
      await comFonte(banco, async (ds) => {
        const rodadas = await ds.runMigrations({ transaction: 'all' });
        expect(rodadas).toHaveLength(5);
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM feed.programas`,
        );
        expect(n).toBe(1);
        expect(await diferencasEntidadesBanco(ds)).toEqual([]);
      });
    });

    it('C) estado do Supabase (incremental já registrada): só baseline + mapa + PucStops/XP', async () => {
      const banco = await bancoDeSynchronize('supabase');
      await comFonte(banco, async (ds) => {
        await ds.query(
          `CREATE TABLE feed.migrations ("id" SERIAL NOT NULL, "timestamp" bigint NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY ("id"))`,
        );
        await ds.query(
          `INSERT INTO feed.migrations ("timestamp", "name") VALUES (1791944105933, 'UsuariosERequisitosPadrinho1791944105933')`,
        );
        const rodadas = await ds.runMigrations({ transaction: 'all' });
        expect(rodadas.map((m) => m.name)).toEqual([
          'BaselineFeed1791900000000',
          'HabilitaPostgisESchemaMapa1792263378656',
          'CriaTabelasMapa1792263378657',
          'PucStopsEXpGlobal1792279161187',
        ]);
        expect((await executadas(ds)).map((m) => m.name)).toHaveLength(5);
        // Segunda execução: nada pendente.
        expect(await ds.runMigrations()).toEqual([]);
        // Reverter a baseline é recusado (não derruba feed).
        await ds.undoLastMigration(); // PucStops e XP (vazios)
        await ds.undoLastMigration(); // tabelas mapa
        await ds.undoLastMigration(); // schema mapa
        await expect(ds.undoLastMigration()).rejects.toThrow(/não é revertida/);
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM feed.programas`,
        );
        expect(n).toBe(1);
      });
    });

    it('D) schema feed parcial: baseline recusa e nada muda', async () => {
      const banco = await bancoNovo('parcial');
      await comFonte(banco, async (ds) => {
        await ds.query(`CREATE SCHEMA feed`);
        await ds.query(`CREATE TABLE feed.avisos (id serial PRIMARY KEY)`);
        await expect(ds.runMigrations({ transaction: 'all' })).rejects.toThrow(
          /Baseline recusada/,
        );
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema IN ('feed', 'mapa') AND table_name <> 'migrations'`,
        );
        expect(n).toBe(1);
      });
    });

    it('E) PostGIS já instalado em public (volume novo da imagem local): usa o existente', async () => {
      const banco = await bancoNovo('postgis_public', 'template_postgis');
      await comFonte(banco, async (ds) => {
        await criarSchemaFeed(ds);
        await ds.runMigrations({ transaction: 'all' });
        const [{ schema }] = await ds.query(
          `SELECT extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname = 'postgis'`,
        );
        expect(schema).toBe('public');
        const [{ tipo }] = await ds.query(
          `SELECT format_type(atttypid, atttypmod) AS tipo FROM pg_attribute WHERE attrelid = 'mapa.predios'::regclass AND attname = 'poligono'`,
        );
        expect(tipo).toBe('geometry(Polygon,4326)');
      });
    });

    describe('importação do snapshot real', () => {
      let banco: string;
      beforeAll(async () => {
        banco = await bancoNovo('importacao');
        await comFonte(banco, async (ds) => {
          await criarSchemaFeed(ds);
          await ds.runMigrations({ transaction: 'all' });
        });
      });

      it('primeira importação: contagens, versão ativa e zero inconsistências', async () => {
        await comFonte(banco, async (ds) => {
          const r = await importarSnapshot(ds, snapshotReal, { ativar: true });
          expect(r.situacao).toBe('importada');
          expect(r.status).toBe('ativa');
          expect(r.contagens).toEqual({
            predios: 101,
            salas: 0,
            areas: 12,
            nos: 653,
            arestas: 1654,
          });
          const rel = await relatorioMapa(ds);
          expect(rel).toEqual({
            versoes: 1,
            ativas: 1,
            contagensAtiva: r.contagens,
            geometriasInvalidas: 0,
            sridIncorreto: 0,
            arestasPenduradas: 0,
            nosForaDoPredioReferenciado: 0,
          });
          const [v] = await ds.query(
            `SELECT versao_assets, origem->>'versao' AS origem FROM mapa.versoes`,
          );
          expect(v).toEqual({ versao_assets: '2026-09-30-r2', origem: '12' });
        });
      });

      it('segunda importação: idempotente, nada duplicado nem reescrito', async () => {
        await comFonte(banco, async (ds) => {
          const antes = await ds.query(
            `SELECT xmin::text AS x FROM mapa.versoes`,
          );
          const r = await importarSnapshot(ds, snapshotReal, { ativar: true });
          expect(r.situacao).toBe('ja-importada');
          expect(
            await ds.query(`SELECT xmin::text AS x FROM mapa.versoes`),
          ).toEqual(antes);
          const [{ n }] = await ds.query(
            `SELECT count(*)::int AS n FROM mapa.predios`,
          );
          expect(n).toBe(101);
        });
      });

      it('mesmo código com outro conteúdo é recusado (versão imutável)', async () => {
        await comFonte(banco, async (ds) => {
          const outro = structuredClone(snapshotReal) as SnapshotMapa;
          outro.predios[0].nome = 'Alterado';
          outro.hashDados = hashDados(outro);
          await expect(importarSnapshot(ds, outro)).rejects.toThrow(
            ImportacaoRecusadaError,
          );
          const [{ nome }] = await ds.query(
            `SELECT nome FROM mapa.predios WHERE id = $1`,
            [snapshotReal.predios[0].id],
          );
          expect(nome).toBe(snapshotReal.predios[0].nome);
        });
      });

      it('geometria inválida para o PostGIS: transação desfeita, nenhuma versão criada', async () => {
        await comFonte(banco, async (ds) => {
          const ruim = structuredClone(snapshotReal) as SnapshotMapa;
          ruim.codigo = 'teste-gravata';
          // Polígono "gravata borboleta" (auto-interseção): JSON válido, PostGIS inválido.
          ruim.predios[0].poligono = {
            type: 'Polygon',
            coordinates: [
              [
                [-43.99, -19.92],
                [-43.98, -19.91],
                [-43.98, -19.92],
                [-43.99, -19.91],
                [-43.99, -19.92],
              ],
            ],
          };
          ruim.hashDados = hashDados(ruim);
          validarSnapshot(ruim);
          await expect(importarSnapshot(ds, ruim)).rejects.toThrow(
            /ck_predios_poligono_valido/,
          );
          const [{ n }] = await ds.query(
            `SELECT count(*)::int AS n FROM mapa.versoes WHERE codigo = 'teste-gravata'`,
          );
          expect(n).toBe(0);
        });
      });

      it('nova versão ativada arquiva a anterior; nunca duas ativas', async () => {
        await comFonte(banco, async (ds) => {
          const nova = structuredClone(snapshotReal) as SnapshotMapa;
          nova.codigo = 'pucmaps-12-teste';
          nova.hashDados = hashDados(nova);
          await importarSnapshot(ds, nova, { ativar: true });
          expect(
            await ds.query(
              `SELECT codigo, status FROM mapa.versoes ORDER BY codigo`,
            ),
          ).toEqual([
            { codigo: 'pucmaps-12', status: 'arquivada' },
            { codigo: 'pucmaps-12-teste', status: 'ativa' },
          ]);
          await expect(
            ds.query(
              `UPDATE mapa.versoes SET status = 'ativa', ativada_em = now()`,
            ),
          ).rejects.toThrow(/uq_versoes_uma_ativa/);
          // Versão com dados não é apagada por acidente (sem cascata).
          await expect(
            ds.query(`DELETE FROM mapa.versoes WHERE codigo = 'pucmaps-12'`),
          ).rejects.toThrow(/fk_/);
          // Mesmo nó id em duas versões, sem colisão (chave por versão).
          const [{ n }] = await ds.query(
            `SELECT count(DISTINCT versao_id)::int AS n FROM mapa.nos_grafo WHERE id = $1`,
            [snapshotReal.nos[0].id],
          );
          expect(n).toBe(2);
        });
      });

      it('aresta apontando para nó de outra versão é barrada pela FK composta', async () => {
        await comFonte(banco, async (ds) => {
          const [a, b] = await ds.query(
            `SELECT id FROM mapa.versoes ORDER BY codigo`,
          );
          const no = snapshotReal.nos[0].id;
          await expect(
            ds.query(
              `INSERT INTO mapa.arestas_grafo (versao_id, id, no_origem_id, no_destino_id, distancia_m, tempo_caminhada_s, acessivel)
             VALUES ($1, gen_random_uuid(), $2, gen_random_uuid(), 1, 1, true)`,
              [a.id, no],
            ),
          ).rejects.toThrow(/fk_arestas_grafo_destino/);
          expect(b.id).not.toBe(a.id);
        });
      });

      it('PostGIS: versão, GeoJSON, distância, interseção e leitura pela entidade', async () => {
        await comFonte(banco, async (ds) => {
          const [{ v }] = await ds.query(`SELECT PostGIS_Version() AS v`);
          expect(v).toMatch(/^3\./);
          const [{ wkt }] = await ds.query(
            `SELECT ST_AsText(ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-43.9918,-19.9236]}')) AS wkt`,
          );
          expect(wkt).toBe('POINT(-43.9918 -19.9236)');
          // Comprimento geodésico das arestas confere com a distância da origem.
          const [{ dif }] = await ds.query(
            `SELECT max(abs(ST_Length(geometria::geography) - distancia_m)) AS dif FROM mapa.arestas_grafo WHERE geometria IS NOT NULL`,
          );
          expect(dif).toBeLessThan(1);
          const [{ d }] = await ds.query(
            `SELECT ST_Distance(a.localizacao::geography, b.localizacao::geography) AS d
             FROM mapa.predios a, mapa.predios b JOIN mapa.versoes v ON v.id = b.versao_id AND v.status = 'ativa'
            WHERE a.versao_id = b.versao_id AND a.id = 'P01_R4751608' AND b.id = 'P02'`,
          );
          expect(d).toBeGreaterThan(10);
          expect(d).toBeLessThan(500);
          // Nós ligados a prédios com polígono ficam dentro ou perto dele (entradas).
          const [{ longe }] = await ds.query(
            `SELECT count(*)::int AS longe FROM mapa.nos_grafo n JOIN mapa.predios p
              ON p.versao_id = n.versao_id AND p.id = n.predio_id
            WHERE p.poligono IS NOT NULL AND NOT ST_DWithin(n.localizacao::geography, p.poligono::geography, 30)`,
          );
          expect(longe).toBe(0);
          const [{ dentro }] = await ds.query(
            `SELECT count(*)::int AS dentro FROM mapa.predios p
            WHERE p.poligono IS NOT NULL AND ST_Intersects(p.poligono, ST_SetSRID(ST_MakePoint(-43.9918, -19.9236), 4326))`,
          );
          expect(dentro).toBeGreaterThan(0);
          const predio = await ds
            .getRepository(PredioEntity)
            .findOneByOrFail({ id: 'P01_R4751608' });
          expect(predio.localizacao.type).toBe('Point');
          expect(predio.poligono?.type).toBe('Polygon');
        });
      });
    });
  },
);
