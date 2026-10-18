/**
 * Eventos, restaurantes e cardápios (Tarefa 11) contra PostgreSQL/PostGIS
 * REAL, com a versão `pucmaps-12` ativa. Pulado sem MAPA_TEST_DB_URL (mesmo
 * procedimento de test/mapa-banco.integration.spec.ts; bancos `campus_*`
 * apagados ao fim). O Azure é substituído por um armazenamento em memória
 * com a mesma semântica (If-None-Match, 404 ao excluir o que não existe).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ConflictException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource, type MigrationInterface } from 'typeorm';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import {
  CampusAdminController,
  CardapiosAdminController,
  EventosAdminController,
  EventosController,
  RestaurantesAdminController,
  RestaurantesController,
} from '../src/campus/campus.controller.js';
import { CardapiosService } from '../src/campus/cardapios/cardapios.service.js';
import { EventosService } from '../src/campus/eventos/eventos.service.js';
import { RestaurantesService } from '../src/campus/restaurantes/restaurantes.service.js';
import { importarSnapshot } from '../src/mapa/importacao/importar-snapshot.js';
import { validarSnapshot } from '../src/mapa/importacao/snapshot.js';
import { RotasController } from '../src/mapa/rotas/rotas.controller.js';
import { RotasService } from '../src/mapa/rotas/rotas.service.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { EventosRestaurantesCardapios1792298839015 } from '../src/migrations/1792298839015-EventosRestaurantesCardapios.js';
import { AzureBlobStorageService } from '../src/storage/azure-blob-storage.service.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-de-teste-campus';
const MIGRATIONS: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
  EventosRestaurantesCardapios1792298839015,
];
const mapa = validarSnapshot(
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../scripts/mapa/dados/pucmaps-12.json'),
      'utf8',
    ),
  ),
);
const AREA = mapa.areas.find((a) => a.nome)!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const P16 = mapa.predios.find((p) => p.id === 'P16')!;
const [P16_LON, P16_LAT] = P16.localizacao.coordinates;

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.7\nconteudo');

/** Container em memória com a semântica usada (If-None-Match, 404 ao excluir). */
class ArmazenamentoFalso {
  blobs = new Map<string, { dados: Buffer; tipo: string; cache?: string }>();
  falharExclusao = false;
  async enviar(
    container: string,
    nome: string,
    dados: Buffer,
    tipo: string,
    opcoes: { cacheControl?: string } = {},
  ) {
    const chave = `${container}/${nome}`;
    if (this.blobs.has(chave)) throw new ConflictException('já existe');
    this.blobs.set(chave, { dados, tipo, cache: opcoes.cacheControl });
    return {
      container,
      blobName: nome,
      chave,
      url: this.urlPublica(container, nome),
    };
  }
  async excluir(container: string, nome: string) {
    if (this.falharExclusao) throw new Error('Azure fora do ar');
    if (!this.blobs.delete(`${container}/${nome}`))
      throw new NotFoundException('Blob não encontrado.');
  }
  urlPublica(container: string, nome: string) {
    return `https://conta.blob.core.windows.net/${container}/${nome}`;
  }
}

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
  const banco = `campus_${nome}`;
  await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${banco}`);
  criados.push(banco);
  const ds = new DataSource({
    type: 'postgres',
    url: urlDo(banco),
    schema: 'feed',
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    installExtensions: false,
  });
  await ds.initialize();
  await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
  await ds.runMigrations({ transaction: 'all' });
  return ds;
}

/** Data AAAA-MM-DD a `dias` de hoje (UTC; os testes usam janelas folgadas). */
const dia = (dias: number) =>
  new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
const horas = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe.skipIf(!URL_TESTE)(
  'Eventos, restaurantes e cardápios com PostGIS real',
  () => {
    let ds: DataSource;
    let app: INestApplication;
    let jwt: JwtService;
    const armazenamento = new ArmazenamentoFalso();
    const http = () => request(app.getHttpServer());
    const coordenador = () =>
      `Bearer ${jwt.sign({ sub: '3', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;
    const aluno = () =>
      `Bearer ${jwt.sign({ sub: '1', email: 'camila@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' })}`;
    const comoCoord = (
      metodo: 'get' | 'post' | 'patch' | 'delete',
      url: string,
    ) => http()[metodo](url).set('Authorization', coordenador());
    const contar = async (tabela: string) =>
      (
        (await ds.query(
          `SELECT count(*)::int AS n FROM mapa.${tabela}`,
        )) as Array<{ n: number }>
      )[0].n;

    beforeAll(async () => {
      ds = await bancoMigrado('api');
      await ds.query(
        `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
          `VALUES ('Camila Duarte', 'camila@pucminas.edu.br', 'Engenharia de Software', 3, 'apadrinhado', 'aprovado')`,
      );
      await importarSnapshot(ds, mapa, { ativar: true });
      const modulo = await Test.createTestingModule({
        imports: [JwtModule.register({ secret: SEGREDO })],
        controllers: [
          EventosController,
          RestaurantesController,
          CampusAdminController,
          EventosAdminController,
          RestaurantesAdminController,
          CardapiosAdminController,
          RotasController,
        ],
        providers: [
          EventosService,
          RestaurantesService,
          CardapiosService,
          RotasService,
          JwtAuthGuard,
          RolesGuard,
          { provide: DataSource, useValue: ds },
          { provide: AzureBlobStorageService, useValue: armazenamento },
        ],
      }).compile();
      app = modulo.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
      );
      await app.init();
      jwt = modulo.get(JwtService);
    });

    afterAll(async () => {
      await app?.close();
      await ds?.destroy();
      if (!URL_TESTE) return;
      for (const banco of criados)
        await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
    });

    describe('estado inicial e autorização', () => {
      it('nada importado do PUCMaps: listas públicas vazias (200)', async () => {
        expect((await http().get('/mapa/eventos').expect(200)).body).toEqual(
          [],
        );
        expect(
          (await http().get('/mapa/restaurantes').expect(200)).body,
        ).toEqual([]);
        await http().get(`/mapa/eventos/${INEXISTENTE}`).expect(404);
        await http()
          .get(`/mapa/restaurantes/${INEXISTENTE}/cardapio`)
          .expect(404);
        await http().get('/mapa/eventos/nao-uuid').expect(404);
      });

      it('sem token 401; aluno 403 em todas as rotas da coordenação; nada gravado', async () => {
        const rotas: Array<['get' | 'post' | 'patch' | 'delete', string]> = [
          ['get', '/coordenacao/campus'],
          ['get', '/coordenacao/eventos'],
          ['post', '/coordenacao/eventos'],
          ['get', `/coordenacao/eventos/${INEXISTENTE}`],
          ['patch', `/coordenacao/eventos/${INEXISTENTE}`],
          ['post', `/coordenacao/eventos/${INEXISTENTE}/desativar`],
          ['post', `/coordenacao/eventos/${INEXISTENTE}/ativar`],
          ['get', '/coordenacao/restaurantes'],
          ['get', '/coordenacao/restaurantes/sugestoes'],
          ['post', '/coordenacao/restaurantes'],
          ['patch', `/coordenacao/restaurantes/${INEXISTENTE}`],
          ['post', `/coordenacao/restaurantes/${INEXISTENTE}/desativar`],
          ['get', `/coordenacao/restaurantes/${INEXISTENTE}/cardapios`],
          ['post', `/coordenacao/restaurantes/${INEXISTENTE}/cardapios`],
          ['delete', `/coordenacao/cardapios/${INEXISTENTE}`],
        ];
        for (const [metodo, url] of rotas) {
          await http()[metodo](url).expect(401);
          await http()[metodo](url).set('Authorization', aluno()).expect(403);
        }
        // A rota pública não tem escrita.
        await http()
          .post('/mapa/eventos')
          .set('Authorization', coordenador())
          .send({})
          .expect(404);
        await http()
          .post('/mapa/restaurantes')
          .set('Authorization', coordenador())
          .send({})
          .expect(404);
        expect(await contar('eventos')).toBe(0);
        expect(await contar('restaurantes')).toBe(0);
      });

      it('região do campus para o seletor (mesma dos PucStops)', async () => {
        const { body } = await comoCoord('get', '/coordenacao/campus').expect(
          200,
        );
        expect(body.limite.type).toBe('Polygon');
        expect(body.bbox.west).toBeLessThan(P16_LON);
        expect(body.bbox.east).toBeGreaterThan(P16_LON);
      });

      it('colunas: sem versao_id; local em predio_id/area_id/localizacao; id uuid', async () => {
        const colunas = (
          (await ds.query(
            `SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) AS c FROM information_schema.columns ` +
              `WHERE table_schema = 'mapa' AND table_name IN ('eventos','restaurantes','cardapios') GROUP BY 1 ORDER BY 1`,
          )) as Array<{ table_name: string; c: string }>
        ).map((l) => `${l.table_name}:${l.c}`);
        expect(colunas).toEqual([
          'cardapios:id,restaurante_id,valido_de,valido_ate,arquivo,tipo_conteudo,tamanho_bytes,criado_por,criado_em',
          'eventos:id,titulo,descricao,inicio,fim,predio_id,area_id,localizacao,ativo,criado_por,criado_em,atualizado_em',
          'restaurantes:id,nome,descricao,predio_id,area_id,localizacao,horarios,ativo,criado_por,criado_em,atualizado_em',
        ]);
      });
    });

    describe('eventos', () => {
      const novo = (extra: object = {}) => ({
        titulo: 'Semana de Engenharia',
        descricao: 'Palestras e oficinas.',
        inicio: horas(-1),
        fim: horas(5),
        local: { predioId: 'P26' },
        ...extra,
      });
      const ids: Record<string, string> = {};

      it('coordenador cria com prédio, área, ponto e sem local', async () => {
        for (const [chave, corpo] of Object.entries({
          predio: novo(),
          area: novo({
            titulo: 'Feira na área',
            local: { areaId: AREA.id },
            inicio: horas(24),
            fim: horas(30),
          }),
          ponto: novo({
            titulo: 'Show no gramado',
            local: { latitude: P16_LAT, longitude: P16_LON },
            inicio: horas(48),
            fim: horas(50),
          }),
          semLocal: novo({
            titulo: 'Live online',
            local: undefined,
            inicio: horas(72),
            fim: horas(73),
          }),
        })) {
          const { body } = await comoCoord('post', '/coordenacao/eventos')
            .send(corpo)
            .expect(201);
          expect(body).toMatchObject({
            id: expect.stringMatching(UUID),
            ativo: true,
            criadoPor: null,
          });
          ids[chave] = body.id;
        }
        const { body: e } = await http()
          .get(`/mapa/eventos/${ids.predio}`)
          .expect(200);
        expect(e).toEqual({
          id: ids.predio,
          titulo: 'Semana de Engenharia',
          descricao: 'Palestras e oficinas.',
          inicio: expect.any(String),
          fim: expect.any(String),
          situacao: 'acontecendo',
          local: {
            tipo: 'predio',
            id: 'P26',
            nome: 'Biblioteca Padre Alberto Antoniazzi - P. 26',
            latitude: expect.any(Number),
            longitude: expect.any(Number),
            rota: { id: 'P26' },
          },
        });
        const { body: a } = await http()
          .get(`/mapa/eventos/${ids.area}`)
          .expect(200);
        expect(a.situacao).toBe('em-breve');
        expect(a.local).toMatchObject({
          tipo: 'area',
          id: AREA.id,
          nome: AREA.nome,
        });
        expect(a.local.rota).toEqual({
          latitude: a.local.latitude,
          longitude: a.local.longitude,
        });
        const { body: p } = await http()
          .get(`/mapa/eventos/${ids.ponto}`)
          .expect(200);
        expect(p.local).toEqual({
          tipo: 'ponto',
          id: null,
          nome: null,
          latitude: P16_LAT,
          longitude: P16_LON,
          rota: { latitude: P16_LAT, longitude: P16_LON },
        });
        expect(
          (await http().get(`/mapa/eventos/${ids.semLocal}`).expect(200)).body
            .local,
        ).toBeNull();
      });

      it('lista pública: ativos que não acabaram, por início', async () => {
        const passado = await comoCoord('post', '/coordenacao/eventos')
          .send(
            novo({ titulo: 'Já passou', inicio: horas(-10), fim: horas(-8) }),
          )
          .expect(201);
        ids.passado = passado.body.id;
        const { body } = await http().get('/mapa/eventos').expect(200);
        expect(body.map((e: { id: string }) => e.id)).toEqual([
          ids.predio,
          ids.area,
          ids.ponto,
          ids.semLocal,
        ]);
        // Encerrado sai da lista, mas o link direto ainda funciona.
        const { body: enc } = await http()
          .get(`/mapa/eventos/${ids.passado}`)
          .expect(200);
        expect(enc.situacao).toBe('encerrado');
        // Coordenação vê todos (inclusive encerrados).
        const { body: todos } = await comoCoord(
          'get',
          '/coordenacao/eventos',
        ).expect(200);
        expect(todos).toHaveLength(5);
      });

      it('validação: 400 (formato, fuso, período, local) e 422 (local fora do mapa/campus)', async () => {
        const antes = await contar('eventos');
        for (const corpo of [
          {},
          novo({ titulo: 'ab' }),
          novo({ titulo: '   ' }),
          novo({ titulo: 'x'.repeat(256) }),
          novo({ descricao: 'x'.repeat(2001) }),
          novo({ inicio: '2026-10-20T19:00' }), // sem fuso
          novo({ inicio: '20/10/2026' }),
          novo({ fim: horas(-2) }), // fim antes do início
          novo({ inicio: horas(1), fim: horas(1) }),
          novo({ inicio: horas(0), fim: horas(24 * 32) }), // > 31 dias
          novo({ local: { predioId: 'P26', areaId: AREA.id } }),
          novo({ local: { latitude: P16_LAT } }),
          novo({ local: {} }),
          novo({ local: { predioId: "P26' OR 1=1" } }),
          novo({ local: { areaId: 'nao-uuid' } }),
          novo({ ativo: 'sim' }),
          novo({ id: INEXISTENTE }),
          novo({ imagens: ['a.png'] }),
        ]) {
          await comoCoord('post', '/coordenacao/eventos')
            .send(corpo)
            .expect(400);
        }
        const r1 = await comoCoord('post', '/coordenacao/eventos')
          .send(novo({ local: { predioId: 'P999' } }))
          .expect(422);
        expect(r1.body.motivo).toBe('local-inexistente');
        const r2 = await comoCoord('post', '/coordenacao/eventos')
          .send(novo({ local: { areaId: INEXISTENTE } }))
          .expect(422);
        expect(r2.body.motivo).toBe('local-inexistente');
        const r3 = await comoCoord('post', '/coordenacao/eventos')
          .send(novo({ local: { latitude: -19.932, longitude: -43.938 } }))
          .expect(422);
        expect(r3.body.motivo).toBe('fora-do-campus');
        expect(await contar('eventos')).toBe(antes);
      });

      it('edita título, período e local (inclusive remover o local)', async () => {
        const { body } = await comoCoord(
          'patch',
          `/coordenacao/eventos/${ids.area}`,
        )
          .send({
            titulo: '  Feira de Profissões  ',
            local: { predioId: 'P16' },
          })
          .expect(200);
        expect(body).toMatchObject({
          titulo: 'Feira de Profissões',
          local: { tipo: 'predio', id: 'P16', rota: { id: 'P16' } },
        });
        const { body: semLocal } = await comoCoord(
          'patch',
          `/coordenacao/eventos/${ids.area}`,
        )
          .send({ local: null })
          .expect(200);
        expect(semLocal.local).toBeNull();
        // Período inválido combinando com o valor atual: fim antes do início gravado.
        await comoCoord('patch', `/coordenacao/eventos/${ids.area}`)
          .send({ fim: horas(1) })
          .expect(400);
        await comoCoord('patch', `/coordenacao/eventos/${ids.area}`)
          .send({})
          .expect(400);
        await comoCoord('patch', `/coordenacao/eventos/${ids.area}`)
          .send({ ativo: false })
          .expect(400);
        await comoCoord('patch', `/coordenacao/eventos/${INEXISTENTE}`)
          .send({ titulo: 'Outro nome' })
          .expect(404);
        await comoCoord('patch', '/coordenacao/eventos/nao-uuid')
          .send({ titulo: 'Outro nome' })
          .expect(400);
      });

      it('desativar tira do público (lista e detalhe); reativar volta; idempotente; sem DELETE', async () => {
        await comoCoord(
          'post',
          `/coordenacao/eventos/${ids.ponto}/desativar`,
        ).expect(200);
        await comoCoord(
          'post',
          `/coordenacao/eventos/${ids.ponto}/desativar`,
        ).expect(200);
        expect(
          (await http().get('/mapa/eventos')).body.map(
            (e: { id: string }) => e.id,
          ),
        ).not.toContain(ids.ponto);
        await http().get(`/mapa/eventos/${ids.ponto}`).expect(404);
        const { body } = await comoCoord(
          'get',
          `/coordenacao/eventos/${ids.ponto}`,
        ).expect(200);
        expect(body.ativo).toBe(false);
        await comoCoord(
          'post',
          `/coordenacao/eventos/${ids.ponto}/ativar`,
        ).expect(200);
        await http().get(`/mapa/eventos/${ids.ponto}`).expect(200);
        await comoCoord('delete', `/coordenacao/eventos/${ids.ponto}`).expect(
          404,
        );
      });

      it('rota até o evento pelo alvo que a API devolve (prédio por id; ponto por coordenada)', async () => {
        const { body: lista } = await http().get('/mapa/eventos').expect(200);
        const origem = { id: 'P34' };
        for (const e of lista.filter((x: { local: unknown }) => x.local)) {
          const { body } = await http()
            .post('/mapa/rotas')
            .send({ origem, destino: e.local.rota })
            .expect(200);
          expect(body.distanciaMetros).toBeGreaterThan(0);
          expect(body.destino.tipo).toBe(
            e.local.tipo === 'predio' ? 'predio' : 'coordenada',
          );
        }
      });
    });

    describe('restaurantes', () => {
      const ids: Record<string, string> = {};
      const segASex = [1, 2, 3, 4, 5].map((d) => ({
        dia: d,
        abre: '07:00',
        fecha: '21:00',
      }));

      it('sugestões = prédios CAFETERIA reais do mapa', async () => {
        const { body } = await comoCoord(
          'get',
          '/coordenacao/restaurantes/sugestoes',
        ).expect(200);
        expect(
          body.map((s: { predioId: string }) => s.predioId).sort(),
        ).toEqual(
          ['OSM_271050665', 'OSM_455954541', 'P16', 'P29', 'P57', 'P95'].sort(),
        );
        expect(body.every((s: { cadastrado: boolean }) => !s.cadastrado)).toBe(
          true,
        );
      });

      it('cria a partir da sugestão (P16) e por ponto; público com horários e aberto agora', async () => {
        const { body } = await comoCoord('post', '/coordenacao/restaurantes')
          .send({
            nome: 'Cantina do Prédio 16',
            local: { predioId: 'P16' },
            horarios: segASex,
          })
          .expect(201);
        ids.p16 = body.id;
        expect(body).toMatchObject({
          ativo: true,
          cardapios: 0,
          cardapioHoje: false,
          horarios: segASex,
        });
        const { body: ponto } = await comoCoord(
          'post',
          '/coordenacao/restaurantes',
        )
          .send({
            nome: 'Trailer do estacionamento',
            local: { latitude: P16_LAT + 0.0003, longitude: P16_LON },
            horarios: [],
          })
          .expect(201);
        ids.ponto = ponto.id;
        const { body: pub } = await http()
          .get(`/mapa/restaurantes/${ids.p16}`)
          .expect(200);
        expect(pub).toEqual({
          id: ids.p16,
          nome: 'Cantina do Prédio 16',
          descricao: '',
          local: expect.objectContaining({
            tipo: 'predio',
            id: 'P16',
            nome: 'Cantina - Prédio 16',
            rota: { id: 'P16' },
          }),
          horarios: segASex,
          abertoAgora: expect.any(Boolean),
          cardapioHoje: false,
        });
        const { body: sug } = await comoCoord(
          'get',
          '/coordenacao/restaurantes/sugestoes',
        ).expect(200);
        expect(
          sug.find((s: { predioId: string }) => s.predioId === 'P16')
            .cadastrado,
        ).toBe(true);
      });

      it('validação: local obrigatório, horários e nome', async () => {
        const antes = await contar('restaurantes');
        for (const corpo of [
          { nome: 'Sem local' },
          { nome: 'ab', local: { predioId: 'P16' } },
          {
            nome: 'Cantina',
            local: { predioId: 'P16' },
            horarios: [{ dia: 1, abre: '21:00', fecha: '07:00' }],
          },
          {
            nome: 'Cantina',
            local: { predioId: 'P16' },
            horarios: [{ dia: 8, abre: '07:00', fecha: '08:00' }],
          },
          {
            nome: 'Cantina',
            local: { predioId: 'P16' },
            horarios: [
              { dia: 1, abre: '07:00', fecha: '12:00' },
              { dia: 1, abre: '11:00', fecha: '13:00' },
            ],
          },
          { nome: 'Cantina', local: { predioId: 'P16' }, horarios: 'seg-sex' },
          { nome: 'Cantina', local: { predioId: 'P16' }, avaliacao: 5 },
        ]) {
          await comoCoord('post', '/coordenacao/restaurantes')
            .send(corpo)
            .expect(400);
        }
        const r = await comoCoord('post', '/coordenacao/restaurantes')
          .send({
            nome: 'Longe',
            local: { latitude: -19.932, longitude: -43.938 },
          })
          .expect(422);
        expect(r.body.motivo).toBe('fora-do-campus');
        expect(await contar('restaurantes')).toBe(antes);
      });

      it('edita horários e local; PATCH com local null é 400 (restaurante precisa de local)', async () => {
        const { body } = await comoCoord(
          'patch',
          `/coordenacao/restaurantes/${ids.p16}`,
        )
          .send({
            horarios: [{ dia: 6, abre: '08:00', fecha: '12:00' }],
            descricao: 'Salgados e almoço',
          })
          .expect(200);
        expect(body).toMatchObject({
          horarios: [{ dia: 6, abre: '08:00', fecha: '12:00' }],
          descricao: 'Salgados e almoço',
        });
        await comoCoord('patch', `/coordenacao/restaurantes/${ids.p16}`)
          .send({ local: null })
          .expect(400);
        await comoCoord('patch', `/coordenacao/restaurantes/${ids.p16}`)
          .send({ horarios: segASex })
          .expect(200);
      });

      describe('cardápios', () => {
        const enviar = (
          rid: string,
          arquivo: Buffer,
          nome: string,
          de: string,
          ate: string,
          extra: Record<string, string> = {},
        ) => {
          let req = comoCoord(
            'post',
            `/coordenacao/restaurantes/${rid}/cardapios`,
          )
            .field('validoDe', de)
            .field('validoAte', ate);
          for (const [k, v] of Object.entries(extra)) req = req.field(k, v);
          return req.attach('arquivo', arquivo, nome);
        };
        let primeiro: string;

        it('envia imagem: blob no restaurant-menus, nome determinístico, cache imutável; aparece hoje', async () => {
          const { body } = await enviar(
            ids.p16,
            PNG,
            'qualquer-nome.exe',
            dia(-1),
            dia(5),
          ).expect(201);
          primeiro = body.id;
          expect(body).toEqual({
            id: expect.stringMatching(UUID),
            url: `https://conta.blob.core.windows.net/restaurant-menus/restaurantes/${ids.p16}/cardapios/${body.id}.png`,
            tipoConteudo: 'image/png',
            tamanhoBytes: PNG.length,
            validoDe: dia(-1),
            validoAte: dia(5),
            criadoEm: expect.any(String),
          });
          const blob = armazenamento.blobs.get(
            `restaurant-menus/restaurantes/${ids.p16}/cardapios/${body.id}.png`,
          );
          expect(blob).toMatchObject({
            tipo: 'image/png',
            cache: 'public, max-age=31536000, immutable',
          });
          const { body: hoje } = await http()
            .get(`/mapa/restaurantes/${ids.p16}/cardapio`)
            .expect(200);
          expect(hoje.cardapio).toMatchObject({
            id: body.id,
            tipoConteudo: 'image/png',
          });
          expect(
            (await http().get(`/mapa/restaurantes/${ids.p16}`)).body
              .cardapioHoje,
          ).toBe(true);
          // Fora da vigência: nenhum.
          const { body: depois } = await http()
            .get(`/mapa/restaurantes/${ids.p16}/cardapio?data=${dia(20)}`)
            .expect(200);
          expect(depois).toEqual({ data: dia(20), cardapio: null });
        });

        it('PDF mais novo na mesma data vence; lista da coordenação traz os dois', async () => {
          const { body } = await enviar(
            ids.p16,
            PDF,
            'semana.pdf',
            dia(0),
            dia(2),
          ).expect(201);
          expect(body.tipoConteudo).toBe('application/pdf');
          expect(body.url.endsWith('.pdf')).toBe(true);
          const { body: hoje } = await http()
            .get(`/mapa/restaurantes/${ids.p16}/cardapio?data=${dia(1)}`)
            .expect(200);
          expect(hoje.cardapio.id).toBe(body.id);
          const { body: lista } = await comoCoord(
            'get',
            `/coordenacao/restaurantes/${ids.p16}/cardapios`,
          ).expect(200);
          expect(lista).toHaveLength(2);
        });

        it('validação: formato pelos bytes, vazio, datas, vigência > 31 dias, > 10 MB (413), campos extras', async () => {
          const antes = await contar('cardapios');
          await enviar(
            ids.p16,
            Buffer.from('<svg/>'),
            'cardapio.png',
            dia(0),
            dia(1),
          ).expect(400);
          await enviar(
            ids.p16,
            Buffer.from('GIF89a...'),
            'cardapio.gif',
            dia(0),
            dia(1),
          ).expect(400);
          await comoCoord(
            'post',
            `/coordenacao/restaurantes/${ids.p16}/cardapios`,
          )
            .field('validoDe', dia(0))
            .field('validoAte', dia(1))
            .expect(400); // sem arquivo
          await enviar(ids.p16, PNG, 'c.png', dia(3), dia(1)).expect(400);
          await enviar(ids.p16, PNG, 'c.png', dia(0), dia(31)).expect(400);
          await enviar(
            ids.p16,
            PNG,
            'c.png',
            '2026-02-30',
            '2026-03-01',
          ).expect(400);
          await enviar(ids.p16, PNG, 'c.png', '18/10/2026', dia(1)).expect(400);
          await enviar(ids.p16, PNG, 'c.png', dia(0), dia(1), {
            substitui: 'nao-uuid',
          }).expect(400);
          await enviar(ids.p16, PNG, 'c.png', dia(0), dia(1), {
            substitui: INEXISTENTE,
          }).expect(404);
          await enviar(ids.p16, PNG, 'c.png', dia(0), dia(1), {
            url: 'http://x',
          }).expect(400);
          await enviar(
            ids.p16,
            Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]),
            'grande.png',
            dia(0),
            dia(1),
          ).expect(413);
          await enviar(INEXISTENTE, PNG, 'c.png', dia(0), dia(1)).expect(404);
          expect(await contar('cardapios')).toBe(antes);
          expect([...armazenamento.blobs.keys()]).toHaveLength(antes);
        });

        it('substituir: grava o novo e só então remove o antigo (linha e blob)', async () => {
          const { body } = await enviar(
            ids.p16,
            PNG,
            'novo.png',
            dia(-1),
            dia(5),
            { substitui: primeiro },
          ).expect(201);
          expect(body.id).not.toBe(primeiro);
          const ids2 = (
            await comoCoord(
              'get',
              `/coordenacao/restaurantes/${ids.p16}/cardapios`,
            )
          ).body.map((c: { id: string }) => c.id);
          expect(ids2).toContain(body.id);
          expect(ids2).not.toContain(primeiro);
          expect(
            [...armazenamento.blobs.keys()].some((k) => k.includes(primeiro)),
          ).toBe(false);
        });

        it('falha ao gravar a linha desfaz o blob (nada órfão)', async () => {
          const blobsAntes = armazenamento.blobs.size;
          await ds.query(
            `CREATE FUNCTION mapa.falha_cardapio() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END $$`,
          );
          await ds.query(
            `CREATE TRIGGER falha_cardapio BEFORE INSERT ON mapa.cardapios FOR EACH ROW EXECUTE FUNCTION mapa.falha_cardapio()`,
          );
          try {
            await enviar(ids.p16, PNG, 'c.png', dia(0), dia(1)).expect(500);
          } finally {
            await ds.query(`DROP TRIGGER falha_cardapio ON mapa.cardapios`);
            await ds.query(`DROP FUNCTION mapa.falha_cardapio()`);
          }
          expect(armazenamento.blobs.size).toBe(blobsAntes);
        });

        it('remover apaga blob e linha; com o Azure fora, a linha fica (aponta para arquivo que existe)', async () => {
          const { body: lista } = await comoCoord(
            'get',
            `/coordenacao/restaurantes/${ids.p16}/cardapios`,
          ).expect(200);
          const alvo = lista[0];
          armazenamento.falharExclusao = true;
          await comoCoord('delete', `/coordenacao/cardapios/${alvo.id}`).expect(
            500,
          );
          armazenamento.falharExclusao = false;
          expect(
            (
              await comoCoord(
                'get',
                `/coordenacao/restaurantes/${ids.p16}/cardapios`,
              )
            ).body,
          ).toHaveLength(lista.length);
          await comoCoord('delete', `/coordenacao/cardapios/${alvo.id}`).expect(
            200,
            { removido: true },
          );
          await comoCoord('delete', `/coordenacao/cardapios/${alvo.id}`).expect(
            404,
          );
          expect(
            [...armazenamento.blobs.keys()].some((k) => k.includes(alvo.id)),
          ).toBe(false);
          // Blob que já sumiu do Azure não impede limpar a linha.
          const { body: novo } = await enviar(
            ids.p16,
            PDF,
            'x.pdf',
            dia(0),
            dia(0),
          ).expect(201);
          armazenamento.blobs.clear();
          await comoCoord('delete', `/coordenacao/cardapios/${novo.id}`).expect(
            200,
          );
        });

        it('restaurante desativado: some do público, cardápio público 404; coordenação ainda lista', async () => {
          await enviar(ids.p16, PNG, 'c.png', dia(0), dia(3)).expect(201);
          await comoCoord(
            'post',
            `/coordenacao/restaurantes/${ids.p16}/desativar`,
          ).expect(200);
          expect(
            (await http().get('/mapa/restaurantes')).body.map(
              (r: { id: string }) => r.id,
            ),
          ).not.toContain(ids.p16);
          await http().get(`/mapa/restaurantes/${ids.p16}`).expect(404);
          await http()
            .get(`/mapa/restaurantes/${ids.p16}/cardapio`)
            .expect(404);
          expect(
            (
              await comoCoord(
                'get',
                `/coordenacao/restaurantes/${ids.p16}/cardapios`,
              )
            ).body.length,
          ).toBeGreaterThan(0);
          await comoCoord(
            'post',
            `/coordenacao/restaurantes/${ids.p16}/ativar`,
          ).expect(200);
          expect(
            (await http().get(`/mapa/restaurantes/${ids.p16}/cardapio`)).body
              .cardapio,
          ).not.toBeNull();
          // Restaurante com cardápio não some por SQL (RESTRICT).
          await expect(
            ds.query(`DELETE FROM mapa.restaurantes WHERE id = $1`, [ids.p16]),
          ).rejects.toThrow(/fk_cardapios_restaurante/);
        });
      });
    });

    describe('integridade no banco', () => {
      it('CHECKs: local único, período, horários jsonb, nome de arquivo determinístico', async () => {
        await expect(
          ds.query(
            `INSERT INTO mapa.eventos (titulo, inicio, fim, predio_id, area_id) VALUES ('abc', now(), now() + interval '1 hour', 'P16', $1)`,
            [AREA.id],
          ),
        ).rejects.toThrow(/ck_eventos_local/);
        await expect(
          ds.query(
            `INSERT INTO mapa.eventos (titulo, inicio, fim) VALUES ('abc', now(), now() - interval '1 hour')`,
          ),
        ).rejects.toThrow(/ck_eventos_periodo/);
        await expect(
          ds.query(`INSERT INTO mapa.restaurantes (nome) VALUES ('abc')`),
        ).rejects.toThrow(/ck_restaurantes_local/);
        await expect(
          ds.query(
            `INSERT INTO mapa.restaurantes (nome, predio_id, horarios) VALUES ('abc', 'P16', '{}')`,
          ),
        ).rejects.toThrow(/ck_restaurantes_horarios/);
        const [{ id }] = await ds.query(
          `SELECT id FROM mapa.restaurantes LIMIT 1`,
        );
        await expect(
          ds.query(
            `INSERT INTO mapa.cardapios (id, restaurante_id, valido_de, valido_ate, arquivo, tipo_conteudo, tamanho_bytes) ` +
              `VALUES (gen_random_uuid(), $1, current_date, current_date, '../outro/arquivo.png', 'image/png', 10)`,
            [id],
          ),
        ).rejects.toThrow(/ck_cardapios_arquivo/);
      });
    });

    describe('migration', () => {
      it('rollback recusado com dados; banco vazio sobe, desce e sobe de novo', async () => {
        const qr = ds.createQueryRunner();
        try {
          await expect(
            new EventosRestaurantesCardapios1792298839015().down(qr),
          ).rejects.toThrow(/Rollback recusado/);
        } finally {
          await qr.release();
        }
        const vazio = await bancoMigrado('vazio');
        try {
          await vazio.undoLastMigration();
          expect(
            await vazio.query(`SELECT to_regclass('mapa.eventos') AS t`),
          ).toEqual([{ t: null }]);
          expect(
            await vazio.query(`SELECT to_regclass('mapa.pucstops')::text AS t`),
          ).toEqual([{ t: 'mapa.pucstops' }]);
          expect(
            await vazio.runMigrations({ transaction: 'all' }),
          ).toHaveLength(1);
        } finally {
          await vazio.destroy();
        }
      });
    });
  },
);
