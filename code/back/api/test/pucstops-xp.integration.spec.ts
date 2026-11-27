/**
 * PucStops (CRUD da coordenação), geofence e XP contra PostgreSQL/PostGIS
 * REAL. Pulado sem MAPA_TEST_DB_URL; mesmo procedimento de
 * test/mapa-banco.integration.spec.ts (bancos `pucstops_*`, apagados ao fim).
 * A geofence e o limite do campus não são mockados: tudo é medido pelo
 * PostGIS, com a versão real `pucmaps-12` do mapa ativa.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource, type MigrationInterface } from 'typeorm';
import { permissoesPeloToken } from './helpers/permissoes.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { DelegacaoGuard } from '../src/coordenacao/delegacoes/delegacao.guard.js';
import { DelegacoesService } from '../src/coordenacao/delegacoes/delegacoes.service.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { PucStopsAdminController } from '../src/gamificacao/pucstops/pucstops-admin.controller.js';
import {
  MARGEM_CAMPUS_METROS,
  PucStopsAdminService,
} from '../src/gamificacao/pucstops/pucstops-admin.service.js';
import {
  MinhasColetasController,
  PucStopsController,
} from '../src/gamificacao/pucstops/pucstops.controller.js';
import { PucStopsService } from '../src/gamificacao/pucstops/pucstops.service.js';
import {
  NiveisController,
  XpController,
} from '../src/gamificacao/xp/xp.controller.js';
import { XpService } from '../src/gamificacao/xp/xp.service.js';
import { importarSnapshot } from '../src/mapa/importacao/importar-snapshot.js';
import { validarSnapshot } from '../src/mapa/importacao/snapshot.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { GamificacaoNiveisMoedasCiclos1794000000000 } from '../src/migrations/1794000000000-GamificacaoNiveisMoedasCiclos.js';
import { nivelDe } from '../src/gamificacao/economia.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import {
  registrarMovimentacao,
  travarCarteira,
} from '../src/gamificacao/gamificacao.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { CriaDelegacoes1795500000000 } from '../src/migrations/1795500000000-CriaDelegacoes.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const CICLO = ParticipacoesService.programaAtual();
const SEGREDO = 'segredo-de-teste-pucstops';
const MIGRATIONS: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
  GamificacaoNiveisMoedasCiclos1794000000000,
];
const mapa = validarSnapshot(
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../scripts/mapa/dados/pucmaps-12.json'),
      'utf8',
    ),
  ),
);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/** Centro de um prédio da versão real do mapa (posição dentro do campus). */
function noPredio(id: string): { latitude: number; longitude: number } {
  const predio = mapa.predios.find((p) => p.id === id);
  if (!predio) throw new Error(`prédio ${id} fora do snapshot`);
  const [longitude, latitude] = predio.localizacao.coordinates;
  return { latitude, longitude };
}

interface Fixture {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  raioMetros: number;
  xp: number;
  ativo: boolean;
}

/** PucStop que a coordenação cadastra no teste (id preenchido pelo banco). */
const fixture = (
  nome: string,
  predio: string,
  raioMetros: number,
  xp: number,
  ativo = true,
): Fixture => ({ id: '', nome, ...noPredio(predio), raioMetros, xp, ativo });
const BIBLIOTECA = fixture('Biblioteca', 'P26', 30, 50);
const MEDICINA = fixture('Prédio 24', 'P24', 40, 40);
const INATIVO = fixture('Museu', 'P40', 25, 30, false);
const ATIVOS = [
  BIBLIOTECA,
  MEDICINA,
  fixture('ICEI', 'P34', 25, 20),
  fixture('Cantina', 'P16', 20, 10),
  fixture('Teatro', 'P30', 25, 20),
];

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
async function bancoMigrado(
  nome: string,
  comDelegacoes = false,
): Promise<DataSource> {
  const banco = `pucstops_${nome}`;
  await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${banco}`);
  criados.push(banco);
  const ds = new DataSource({
    type: 'postgres',
    url: urlDo(banco),
    schema: 'feed',
    migrations: comDelegacoes
      ? [...MIGRATIONS, CriaDelegacoes1795500000000]
      : MIGRATIONS,
    migrationsTableName: 'migrations',
    installExtensions: false,
    // Pool maior que o número de coletas simultâneas do teste de concorrência.
    extra: { max: 30 },
  });
  await ds.initialize();
  await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
  await ds.runMigrations({ transaction: 'all' });
  return ds;
}

const USUARIOS = [
  ['Camila Duarte', 'camila@pucminas.edu.br'],
  ['Thiago Moreira', 'thiago@pucminas.edu.br'],
  ['Ana Beatriz Costa', 'ana.beatriz@pucminas.edu.br'],
  ['Lucas Almeida', 'lucas.almeida@pucminas.edu.br'],
  ['Pedro Lima', 'pedro.lima@pucminas.edu.br'],
  ['Julia Fernandes', 'julia.fernandes@pucminas.edu.br'],
  ['Marina Rocha', 'marina.rocha@pucminas.edu.br'],
  ['Coordenação Cadastrada', 'coordenacao.cadastrada@pucminas.edu.br'],
];

describe.skipIf(!URL_TESTE)('PucStops e XP com PostGIS real', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  const ids: Record<string, number> = {};
  const http = () => request(app.getHttpServer());

  /** JWT de acesso como o AuthService emite (`sub` = usuarios.id). */
  const token = (email: string, sub = String(ids[email])) =>
    `Bearer ${jwt.sign({ sub, email, perfil: 'apadrinhado', escopo: 'acesso' })}`;

  /**
   * Coordenador mockado, como o AuthService assina hoje: `sub` "3" (que no
   * banco é a Ana Beatriz) e e-mail que não está em `usuarios`.
   */
  const coordenador = () =>
    `Bearer ${jwt.sign({ sub: '3', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;

  const criarPucStop = (corpo: object, autorizacao = coordenador()) =>
    http()
      .post('/coordenacao/pucstops')
      .set('Authorization', autorizacao)
      .send(corpo);

  const editar = (id: string, corpo: object) =>
    http()
      .patch(`/coordenacao/pucstops/${id}`)
      .set('Authorization', coordenador())
      .send(corpo);

  const acao = (id: string, nome: 'ativar' | 'desativar') =>
    http()
      .post(`/coordenacao/pucstops/${id}/${nome}`)
      .set('Authorization', coordenador());

  const publicos = async () =>
    (await http().get('/mapa/pucstops').expect(200)).body as Array<{
      id: string;
      nome: string;
      latitude: number;
      longitude: number;
      raioMetros: number;
      xp: number;
    }>;

  const contarPucStops = async () =>
    (
      (await ds.query(
        `SELECT count(*)::int AS n FROM mapa.pucstops`,
      )) as Array<{
        n: number;
      }>
    )[0].n;

  /** Ponto a `metros` de outro (geodésico, pelo próprio PostGIS). */
  async function aDistancia(
    p: { latitude: number; longitude: number },
    metros: number,
    azimute = 90,
  ): Promise<{ latitude: number; longitude: number }> {
    const [ponto] = (await ds.query(
      `SELECT ST_Y(q::geometry) AS latitude, ST_X(q::geometry) AS longitude FROM ` +
        `(SELECT ST_Project(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3::float8, radians($4::float8)) AS q) t`,
      [p.longitude, p.latitude, metros, azimute],
    )) as Array<{ latitude: number; longitude: number }>;
    return ponto;
  }

  const coletar = (id: string, email: string, corpo: object) =>
    http()
      .post(`/mapa/pucstops/${id}/claim`)
      .set('Authorization', token(email))
      .send(corpo);

  async function saldoELedger(usuarioId: number) {
    const [linha] = (await ds.query(
      `SELECT coalesce((SELECT saldo FROM gamificacao.xp_carteiras WHERE usuario_id = $1), 0) AS saldo, ` +
        `coalesce((SELECT sum(quantidade)::int FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1), 0) AS soma, ` +
        `(SELECT count(*)::int FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1) AS movimentacoes, ` +
        `(SELECT count(*)::int FROM gamificacao.pucstop_coletas WHERE usuario_id = $1) AS coletas`,
      [usuarioId],
    )) as Array<{
      saldo: number;
      soma: number;
      movimentacoes: number;
      coletas: number;
    }>;
    return linha;
  }

  beforeAll(async () => {
    ds = await bancoMigrado('api', true);
    for (const [nome, email] of USUARIOS) {
      const [{ id }] = await ds.query(
        `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
          `VALUES ($1, $2, 'Engenharia de Software', 3, 'apadrinhado', 'aprovado') RETURNING id`,
        [nome, email],
      );
      ids[email] = id;
    }
    await importarSnapshot(ds, mapa, { ativar: true });

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [
        NiveisController,
        PucStopsController,
        MinhasColetasController,
        XpController,
        PucStopsAdminController,
      ],
      providers: [
        PucStopsService,
        PucStopsAdminService,
        XpService,
        JwtAuthGuard,
        RolesGuard,
        DelegacaoGuard,
        DelegacoesService,
        Reflector,
        permissoesPeloToken(),
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    app = modulo.createNestApplication();
    // Mesmo pipe global do main.ts.
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

  describe('sem PucStops cadastrados', () => {
    it('nenhum PucStop herdado: lista pública vazia (200, não é erro)', async () => {
      expect(await contarPucStops()).toBe(0);
      expect(await publicos()).toEqual([]);
      await http().get(`/mapa/pucstops/${ID_INEXISTENTE}`).expect(404);
    });

    it('tabela sem versão do mapa, sem origem PUCMaps e com id UUID gerado pelo banco', async () => {
      const colunas = (await ds.query(
        `SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns ` +
          `WHERE table_schema = 'mapa' AND table_name = 'pucstops' ORDER BY ordinal_position`,
      )) as Array<{
        column_name: string;
        data_type: string;
        column_default: string | null;
        is_nullable: string;
      }>;
      expect(colunas.map((c) => c.column_name)).toEqual([
        'id',
        'nome',
        'localizacao',
        'raio_metros',
        'xp',
        'ativo',
        'criado_por',
        'criado_em',
        'atualizado_em',
      ]);
      expect(colunas[0]).toMatchObject({
        data_type: 'uuid',
        column_default: 'gen_random_uuid()',
      });
      expect(colunas.find((c) => c.column_name === 'criado_por')).toMatchObject(
        { data_type: 'integer', is_nullable: 'YES' },
      );
      const [{ tipo }] = await ds.query(
        `SELECT format_type(atttypid, atttypmod) AS tipo FROM pg_attribute ` +
          `WHERE attrelid = 'mapa.pucstops'::regclass AND attname = 'localizacao'`,
      );
      expect(tipo).toBe('geometry(Point,4326)');
      const [{ fk }] = await ds.query(
        `SELECT format_type(atttypid, atttypmod) AS fk FROM pg_attribute ` +
          `WHERE attrelid = 'gamificacao.pucstop_coletas'::regclass AND attname = 'pucstop_id'`,
      );
      expect(fk).toBe('uuid');
      // criado_por → usuarios.id, sem cascata.
      const [restricao] = await ds.query(
        `SELECT confrelid::regclass::text AS alvo, confdeltype AS ao_apagar FROM pg_constraint ` +
          `WHERE conname = 'fk_pucstops_criado_por'`,
      );
      expect(restricao).toEqual({ alvo: 'feed.usuarios', ao_apagar: 'r' });
    });
  });

  describe('administração (coordenação)', () => {
    const valido = () => ({
      nome: 'Totem de teste',
      ...noPredio('P12'),
      xp: 10,
      raioMetros: 20,
    });

    it('sem token 401; aluno 403 em todas as rotas; nada criado nem alterado', async () => {
      await http().get('/coordenacao/pucstops').expect(401);
      await http().post('/coordenacao/pucstops').send(valido()).expect(401);
      const aluno = token('camila@pucminas.edu.br');
      await http()
        .get('/coordenacao/pucstops')
        .set('Authorization', aluno)
        .expect(403);
      await http()
        .get('/coordenacao/pucstops/campus')
        .set('Authorization', aluno)
        .expect(403);
      await criarPucStop(valido(), aluno).expect(403);
      await http()
        .patch(`/coordenacao/pucstops/${ID_INEXISTENTE}`)
        .set('Authorization', aluno)
        .send({ xp: 999 })
        .expect(403);
      for (const nome of ['ativar', 'desativar']) {
        await http()
          .post(`/coordenacao/pucstops/${ID_INEXISTENTE}/${nome}`)
          .set('Authorization', aluno)
          .expect(403);
      }
      // A rota pública do mapa não tem escrita.
      await http()
        .post('/mapa/pucstops')
        .set('Authorization', coordenador())
        .send(valido())
        .expect(404);
      await http()
        .patch(`/mapa/pucstops/${ID_INEXISTENTE}`)
        .set('Authorization', coordenador())
        .send({ xp: 1 })
        .expect(404);
      expect(await contarPucStops()).toBe(0);
    });

    it('região do campus: envoltória da versão ativa + margem, contém os prédios', async () => {
      const { body } = await http()
        .get('/coordenacao/pucstops/campus')
        .set('Authorization', coordenador())
        .expect(200);
      expect(body.margemMetros).toBe(MARGEM_CAMPUS_METROS);
      expect(body.limite.type).toBe('Polygon');
      const { west, south, east, north } = body.bbox;
      for (const predio of ['P01_R4751608', 'P26', 'P40', 'P24']) {
        const p = noPredio(predio);
        expect(p.longitude).toBeGreaterThan(west);
        expect(p.longitude).toBeLessThan(east);
        expect(p.latitude).toBeGreaterThan(south);
        expect(p.latitude).toBeLessThan(north);
      }
      // O campus tem cerca de 1 km: a região não é o mundo inteiro.
      expect(east - west).toBeLessThan(0.02);
      expect(north - south).toBeLessThan(0.02);
    });

    it('coordenador cria os PucStops; os ativos aparecem no mapa público', async () => {
      for (const p of [...ATIVOS, INATIVO]) {
        const { body } = await criarPucStop({
          nome: p.nome,
          latitude: p.latitude,
          longitude: p.longitude,
          xp: p.xp,
          raioMetros: p.raioMetros,
          ...(p.ativo ? {} : { ativo: false }),
        }).expect(201);
        expect(body).toEqual({
          id: expect.stringMatching(UUID),
          nome: p.nome,
          latitude: p.latitude,
          longitude: p.longitude,
          raioMetros: p.raioMetros,
          xp: p.xp,
          ativo: p.ativo,
          // Coordenador mockado não está em `usuarios` (sub "3" é outra pessoa).
          criadoPor: null,
          criadoEm: expect.any(String),
          atualizadoEm: expect.any(String),
          coletas: 0,
        });
        p.id = body.id;
      }
      const lista = await publicos();
      expect(lista.map((p) => p.id).sort()).toEqual(
        ATIVOS.map((p) => p.id).sort(),
      );
      expect(lista.find((p) => p.id === BIBLIOTECA.id)).toEqual({
        id: BIBLIOTECA.id,
        nome: BIBLIOTECA.nome,
        latitude: BIBLIOTECA.latitude,
        longitude: BIBLIOTECA.longitude,
        raioMetros: BIBLIOTECA.raioMetros,
        xp: BIBLIOTECA.xp,
      });
      // Inativo desde a criação: fora do mapa dos alunos, visível na coordenação.
      await http().get(`/mapa/pucstops/${INATIVO.id}`).expect(404);
      const { body: todos } = await http()
        .get('/coordenacao/pucstops')
        .set('Authorization', coordenador())
        .expect(200);
      expect(todos).toHaveLength(ATIVOS.length + 1);
      expect(todos.find((p: Fixture) => p.id === INATIVO.id).ativo).toBe(false);
    });

    it('criado_por = usuarios.id quando o coordenador está em usuarios', async () => {
      const email = 'coordenacao.cadastrada@pucminas.edu.br';
      const autorizacao = `Bearer ${jwt.sign({ sub: String(ids[email]), email, perfil: 'coordenador', escopo: 'acesso' })}`;
      const { body } = await criarPucStop(valido(), autorizacao).expect(201);
      expect(body.criadoPor).toBe(ids[email]);
      await acao(body.id, 'desativar').expect(200);
    });

    it('corpo inválido ou com campos do servidor: 400, nada gravado', async () => {
      const antes = await contarPucStops();
      for (const corpo of [
        {},
        { ...valido(), nome: undefined },
        { ...valido(), nome: '   ' },
        { ...valido(), nome: 'x'.repeat(121) },
        { ...valido(), nome: 42 },
        { ...valido(), xp: 0 },
        { ...valido(), xp: -5 },
        { ...valido(), xp: 1001 },
        { ...valido(), xp: 10.5 },
        { ...valido(), xp: '10' },
        { ...valido(), raioMetros: 0 },
        { ...valido(), raioMetros: 9.9 },
        { ...valido(), raioMetros: 201 },
        { ...valido(), latitude: 91 },
        { ...valido(), longitude: -181 },
        { ...valido(), latitude: '-19.92' },
        { ...valido(), latitude: undefined },
        { ...valido(), ativo: 'sim' },
        { ...valido(), id: ID_INEXISTENTE },
        { ...valido(), criadoPor: 1 },
        { ...valido(), coletas: 0 },
      ]) {
        await criarPucStop(corpo).expect(400);
      }
      expect(await contarPucStops()).toBe(antes);
    });

    it('fora do campus: 422 fora-do-campus, nada gravado', async () => {
      const antes = await contarPucStops();
      const leste = await aDistancia(noPredio('P40'), 600, 90);
      for (const ponto of [
        leste,
        // Praça da Liberdade, uns 6 km.
        { latitude: -19.932, longitude: -43.938 },
        { latitude: 0, longitude: 0 },
      ]) {
        const { body } = await criarPucStop({ ...valido(), ...ponto }).expect(
          422,
        );
        expect(body).toMatchObject({
          motivo: 'fora-do-campus',
          distanciaMetros: expect.any(Number),
        });
        expect(body.distanciaMetros).toBeGreaterThan(MARGEM_CAMPUS_METROS);
      }
      expect(await contarPucStops()).toBe(antes);
    });

    it('edita nome, XP, raio e posição; reflete no mapa público', async () => {
      const { body: criado } = await criarPucStop(valido()).expect(201);
      const novo = await aDistancia(noPredio('P12'), 15, 0);
      const { body } = await editar(criado.id, {
        nome: '  Psicologia  ',
        xp: 40,
        raioMetros: 45,
        ...novo,
      }).expect(200);
      expect(body).toMatchObject({
        id: criado.id,
        nome: 'Psicologia',
        xp: 40,
        raioMetros: 45,
        ativo: true,
        criadoEm: criado.criadoEm,
      });
      expect(body.latitude).toBeCloseTo(novo.latitude, 9);
      expect(body.longitude).toBeCloseTo(novo.longitude, 9);
      expect(new Date(body.atualizadoEm) >= new Date(criado.atualizadoEm)).toBe(
        true,
      );
      expect((await publicos()).find((p) => p.id === criado.id)).toMatchObject({
        nome: 'Psicologia',
        xp: 40,
        raioMetros: 45,
      });
      // Só o XP: o resto fica.
      const { body: soXp } = await editar(criado.id, { xp: 30 }).expect(200);
      expect(soXp).toMatchObject({
        nome: 'Psicologia',
        xp: 30,
        raioMetros: 45,
      });
      expect(soXp.latitude).toBeCloseTo(novo.latitude, 9);
      await acao(criado.id, 'desativar').expect(200);
    });

    it('edição inválida: 400/404/422 sem mudar nada', async () => {
      const ler = async () =>
        (
          await http()
            .get(`/coordenacao/pucstops/${BIBLIOTECA.id}`)
            .set('Authorization', coordenador())
            .expect(200)
        ).body;
      const antes = await ler();
      await editar(BIBLIOTECA.id, {}).expect(400);
      await editar(BIBLIOTECA.id, { latitude: BIBLIOTECA.latitude }).expect(
        400,
      );
      await editar(BIBLIOTECA.id, { nome: ' ' }).expect(400);
      await editar(BIBLIOTECA.id, { xp: 0 }).expect(400);
      await editar(BIBLIOTECA.id, { raioMetros: 500 }).expect(400);
      await editar(BIBLIOTECA.id, { ativo: false }).expect(400);
      await editar(BIBLIOTECA.id, { id: ID_INEXISTENTE }).expect(400);
      const { body } = await editar(BIBLIOTECA.id, {
        latitude: -19.932,
        longitude: -43.938,
      }).expect(422);
      expect(body.motivo).toBe('fora-do-campus');
      await editar(ID_INEXISTENTE, { xp: 20 }).expect(404);
      await editar('totem_biblioteca', { xp: 20 }).expect(400);
      await http()
        .get('/coordenacao/pucstops/nao-e-uuid')
        .set('Authorization', coordenador())
        .expect(400);
      await http()
        .get(`/coordenacao/pucstops/${ID_INEXISTENTE}`)
        .set('Authorization', coordenador())
        .expect(404);
      expect(await ler()).toEqual(antes);
    });

    it('desativar ("excluir") tira do mapa público; reativar volta; ambos idempotentes', async () => {
      const { body: criado } = await criarPucStop(valido()).expect(201);
      const { body: desativado } = await acao(criado.id, 'desativar').expect(
        200,
      );
      expect(desativado.ativo).toBe(false);
      await acao(criado.id, 'desativar').expect(200);
      expect((await publicos()).map((p) => p.id)).not.toContain(criado.id);
      await http().get(`/mapa/pucstops/${criado.id}`).expect(404);
      // Continua no banco e na lista da coordenação.
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM mapa.pucstops WHERE id = $1`,
        [criado.id],
      );
      expect(n).toBe(1);
      const { body: reativado } = await acao(criado.id, 'ativar').expect(200);
      expect(reativado.ativo).toBe(true);
      expect((await publicos()).map((p) => p.id)).toContain(criado.id);
      await acao(criado.id, 'desativar').expect(200);
      await acao(ID_INEXISTENTE, 'desativar').expect(404);
      // Não há exclusão física pela API.
      await http()
        .delete(`/coordenacao/pucstops/${criado.id}`)
        .set('Authorization', coordenador())
        .expect(404);
    });
  });

  describe('coleta', () => {
    const camila = 'camila@pucminas.edu.br';

    it('sem token: 401; token sem cadastro (coordenador mockado, sub colidindo): 403', async () => {
      await http()
        .post(`/mapa/pucstops/${BIBLIOTECA.id}/claim`)
        .send({
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
        })
        .expect(401);
      // O coordenador assina sub "3", que no banco é a Ana Beatriz.
      await http()
        .post(`/mapa/pucstops/${BIBLIOTECA.id}/claim`)
        .set('Authorization', token('renata@pucminas.edu.br', '3'))
        .send({
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
        })
        .expect(403);
      expect((await saldoELedger(3)).movimentacoes).toBe(0);
    });

    it('corpo inválido ou com campos do servidor: 400, nada gravado', async () => {
      for (const corpo of [
        {},
        { latitude: 91, longitude: BIBLIOTECA.longitude },
        { latitude: BIBLIOTECA.latitude, longitude: -181 },
        { latitude: '-19.92', longitude: BIBLIOTECA.longitude },
        {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
          accuracy: -1,
        },
        {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
          xp: 9999,
        },
        {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
          usuarioId: 2,
        },
        {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
          raioMetros: 5000,
        },
      ]) {
        await coletar(BIBLIOTECA.id, camila, corpo).expect(400);
      }
      expect((await saldoELedger(ids[camila])).movimentacoes).toBe(0);
    });

    it('perto: credita o XP do PucStop, ledger e saldo batem, sem coordenada gravada', async () => {
      const ponto = await aDistancia(BIBLIOTECA, 12);
      const { body } = await coletar(BIBLIOTECA.id, camila, {
        ...ponto,
        accuracy: 8.5,
      }).expect(201);
      expect(body).toEqual({
        pucstopId: BIBLIOTECA.id,
        xpGanho: BIBLIOTECA.xp,
        moedasGanhas: BIBLIOTECA.xp,
        xpConfigurado: BIBLIOTECA.xp,
        limiteAtingido: false,
        xpTotal: BIBLIOTECA.xp,
        moedas: BIBLIOTECA.xp,
        xpAcumulado: BIBLIOTECA.xp,
        nivel: expect.objectContaining({ numero: 2, nome: 'Curiosidade' }),
        subiuDeNivel: true,
        ciclo: CICLO,
        claimedAt: expect.any(String),
        distanciaMetros: 12,
      });
      const estado = await saldoELedger(ids[camila]);
      expect(estado).toEqual({
        saldo: BIBLIOTECA.xp,
        soma: BIBLIOTECA.xp,
        movimentacoes: 1,
        coletas: 1,
      });
      const [mov] = await ds.query(
        `SELECT tipo, referencia_tipo, referencia_id, chave_idempotencia, saldo_apos FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1`,
        [ids[camila]],
      );
      expect(mov).toEqual({
        tipo: 'PUCSTOP_CLAIM',
        referencia_tipo: 'pucstop',
        referencia_id: BIBLIOTECA.id,
        chave_idempotencia: `pucstop:${BIBLIOTECA.id}:usuario:${ids[camila]}:ciclo:${CICLO}`,
        saldo_apos: BIBLIOTECA.xp,
      });
      // Nenhuma coluna de coordenada nas tabelas de gamificação.
      const colunas = (
        await ds.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'gamificacao'`,
        )
      ).map((c: { column_name: string }) => c.column_name);
      expect(
        colunas.filter((c: string) =>
          /lat|lon|geo|accuracy|precis|local/.test(c),
        ),
      ).toEqual([]);
    });

    it('segunda coleta do mesmo PucStop: 409 ja-coletado, XP não muda', async () => {
      const { body } = await coletar(BIBLIOTECA.id, camila, {
        latitude: BIBLIOTECA.latitude,
        longitude: BIBLIOTECA.longitude,
      }).expect(409);
      expect(body.motivo).toBe('ja-coletado');
      expect((await saldoELedger(ids[camila])).saldo).toBe(BIBLIOTECA.xp);
    });

    it('limite do raio (inclusivo): 5 cm dentro coleta, 5 cm fora recusa', async () => {
      const thiago = 'thiago@pucminas.edu.br';
      const ana = 'ana.beatriz@pucminas.edu.br';
      const dentro = await aDistancia(
        MEDICINA,
        MEDICINA.raioMetros - 0.05,
        200,
      );
      const fora = await aDistancia(MEDICINA, MEDICINA.raioMetros + 0.05, 200);
      const recusada = await coletar(MEDICINA.id, ana, fora).expect(422);
      expect(recusada.body).toMatchObject({
        motivo: 'fora-do-alcance',
        raioMetros: MEDICINA.raioMetros,
      });
      // Distância devolvida com 1 casa (40,05 m → 40,0 ou 40,1).
      expect(recusada.body.distanciaMetros).toBeCloseTo(MEDICINA.raioMetros, 0);
      const aceita = await coletar(MEDICINA.id, thiago, dentro).expect(201);
      expect(aceita.body.distanciaMetros).toBeCloseTo(MEDICINA.raioMetros, 0);
    });

    it('longe (outro lado do campus): 422 com a distância, nada gravado', async () => {
      const lucas = 'lucas.almeida@pucminas.edu.br';
      const { body } = await coletar(BIBLIOTECA.id, lucas, {
        latitude: MEDICINA.latitude,
        longitude: MEDICINA.longitude,
      }).expect(422);
      expect(body.motivo).toBe('fora-do-alcance');
      expect(body.distanciaMetros).toBeGreaterThan(200);
      expect(await saldoELedger(ids[lucas])).toMatchObject({
        saldo: 0,
        movimentacoes: 0,
        coletas: 0,
      });
    });

    it('precisão pior que 100 m: 422 precisao-insuficiente, mesmo em cima do PucStop', async () => {
      const { body } = await coletar(
        BIBLIOTECA.id,
        'lucas.almeida@pucminas.edu.br',
        {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
          accuracy: 150,
        },
      ).expect(422);
      expect(body.motivo).toBe('precisao-insuficiente');
    });

    it('inativo: 422 inativo; inexistente ou id malformado: 404', async () => {
      const lucas = 'lucas.almeida@pucminas.edu.br';
      const { body } = await coletar(INATIVO.id, lucas, {
        latitude: INATIVO.latitude,
        longitude: INATIVO.longitude,
      }).expect(422);
      expect(body.motivo).toBe('inativo');
      for (const id of ['nao_existe', ID_INEXISTENTE, 'totem_biblioteca']) {
        await coletar(id, lucas, {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
        }).expect(404);
      }
      expect((await saldoELedger(ids[lucas])).movimentacoes).toBe(0);
    });
  });

  describe('concorrência', () => {
    it('20 coletas simultâneas do mesmo PucStop: uma ganha, 19 recebem ja-coletado, XP uma vez', async () => {
      const pedro = 'pedro.lima@pucminas.edu.br';
      const corpo = {
        latitude: BIBLIOTECA.latitude,
        longitude: BIBLIOTECA.longitude,
      };
      const respostas = await Promise.all(
        Array.from({ length: 20 }, () => coletar(BIBLIOTECA.id, pedro, corpo)),
      );
      const status = respostas.map((r) => r.status).sort();
      expect(status.filter((s) => s === 201)).toHaveLength(1);
      expect(status.filter((s) => s === 409)).toHaveLength(19);
      for (const r of respostas.filter((r) => r.status === 409)) {
        expect(r.body.motivo).toBe('ja-coletado');
      }
      expect(await saldoELedger(ids[pedro])).toEqual({
        saldo: BIBLIOTECA.xp,
        soma: BIBLIOTECA.xp,
        movimentacoes: 1,
        coletas: 1,
      });
    });

    it('2 coletas simultâneas do mesmo PucStop: uma 201, outra 409, uma movimentação, saldo +XP uma vez', async () => {
      const ana = 'ana.beatriz@pucminas.edu.br';
      const antes = await saldoELedger(ids[ana]);
      const corpo = {
        latitude: BIBLIOTECA.latitude,
        longitude: BIBLIOTECA.longitude,
      };
      const respostas = await Promise.all([
        coletar(BIBLIOTECA.id, ana, corpo),
        coletar(BIBLIOTECA.id, ana, corpo),
      ]);
      expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(respostas.find((r) => r.status === 409)!.body.motivo).toBe(
        'ja-coletado',
      );
      expect(await saldoELedger(ids[ana])).toEqual({
        saldo: antes.saldo + BIBLIOTECA.xp,
        soma: antes.soma + BIBLIOTECA.xp,
        movimentacoes: antes.movimentacoes + 1,
        coletas: antes.coletas + 1,
      });
    });

    it('coletas simultâneas de PucStops diferentes: todas creditam, saldo = soma, saldo_apos em sequência', async () => {
      const julia = 'julia.fernandes@pucminas.edu.br';
      const ativos = ATIVOS;
      const respostas = await Promise.all(
        ativos.map((p) =>
          coletar(p.id, julia, {
            latitude: p.latitude,
            longitude: p.longitude,
          }),
        ),
      );
      expect(respostas.map((r) => r.status)).toEqual(ativos.map(() => 201));
      const total = ativos.reduce((s, p) => s + p.xp, 0);
      expect(Math.max(...respostas.map((r) => r.body.xpTotal))).toBe(total);
      expect(await saldoELedger(ids[julia])).toEqual({
        saldo: total,
        soma: total,
        movimentacoes: ativos.length,
        coletas: ativos.length,
      });
      // Cada movimentação viu o saldo da anterior (nenhuma leitura perdida).
      const movs = await ds.query(
        `SELECT quantidade, saldo_apos FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1 ORDER BY id`,
        [ids[julia]],
      );
      let acumulado = 0;
      for (const m of movs) {
        acumulado += m.quantidade;
        expect(m.saldo_apos).toBe(acumulado);
      }
    });
  });

  describe('XP do usuário', () => {
    it('GET /me/xp e /me/xp/movimentacoes (paginado, só do próprio usuário)', async () => {
      const julia = 'julia.fernandes@pucminas.edu.br';
      const total = ATIVOS.reduce((s, p) => s + p.xp, 0);
      await http().get('/me/xp').expect(401);
      const resumo = await http()
        .get('/me/xp')
        .set('Authorization', token(julia))
        .expect(200);
      expect(resumo.body).toEqual({
        saldo: total,
        moedas: total,
        xpAcumulado: total,
        nivel: expect.objectContaining({ numero: nivelDe(total).numero }),
        ciclo: CICLO,
        limites: {
          totens: { ganho: total, limite: 400 },
          ciclo: { ganho: total, limite: 1500 },
        },
        atualizadoEm: expect.any(String),
      });

      const pagina1 = await http()
        .get('/me/xp/movimentacoes?limite=3')
        .set('Authorization', token(julia))
        .expect(200);
      expect(pagina1.body).toHaveLength(3);
      expect(pagina1.body[0]).toMatchObject({
        tipo: 'PUCSTOP_CLAIM',
        quantidade: expect.any(Number),
        referencia: { tipo: 'pucstop', id: expect.any(String) },
        saldoApos: total,
      });
      const ultimo = pagina1.body.at(-1).id;
      const pagina2 = await http()
        .get(`/me/xp/movimentacoes?limite=3&antes=${ultimo}`)
        .set('Authorization', token(julia))
        .expect(200);
      expect(pagina2.body).toHaveLength(ATIVOS.length - 3);
      for (const q of [
        'limite=0',
        'limite=101',
        'limite=abc',
        'antes=-1',
        'outro=1',
      ]) {
        await http()
          .get(`/me/xp/movimentacoes?${q}`)
          .set('Authorization', token(julia))
          .expect(400);
      }

      // Quem nunca coletou: saldo 0, sem carteira criada por leitura.
      const nova = await http()
        .get('/me/xp')
        .set('Authorization', token('lucas.almeida@pucminas.edu.br'))
        .expect(200);
      expect(nova.body).toMatchObject({
        saldo: 0,
        moedas: 0,
        xpAcumulado: 0,
        nivel: { numero: 1, nome: 'Primeiro passo', progresso: 0 },
        atualizadoEm: null,
      });
    });

    it('GET /me/pucstops: coletas do próprio usuário', async () => {
      const { body } = await http()
        .get('/me/pucstops')
        .set('Authorization', token('camila@pucminas.edu.br'))
        .expect(200);
      expect(body).toEqual([
        {
          pucstopId: BIBLIOTECA.id,
          xp: BIBLIOTECA.xp,
          ciclo: CICLO,
          claimedAt: expect.any(String),
        },
      ]);
      await http().get('/me/pucstops').expect(401);
    });

    it('saldo == soma do ledger para todos os usuários', async () => {
      const divergentes = await ds.query(
        `SELECT c.usuario_id FROM gamificacao.xp_carteiras c ` +
          `LEFT JOIN (SELECT usuario_id, sum(quantidade) AS soma FROM gamificacao.xp_movimentacoes GROUP BY usuario_id) l USING (usuario_id) ` +
          `WHERE c.saldo <> coalesce(l.soma, 0)`,
      );
      expect(divergentes).toEqual([]);
    });
  });

  describe('integridade no banco', () => {
    it('ledger e coletas são somente inserção', async () => {
      await expect(
        ds.query(`UPDATE gamificacao.xp_movimentacoes SET quantidade = 1000`),
      ).rejects.toThrow(/somente inserção/);
      await expect(
        ds.query(`DELETE FROM gamificacao.pucstop_coletas`),
      ).rejects.toThrow(/somente inserção/);
      await expect(
        ds.query(`TRUNCATE gamificacao.xp_movimentacoes CASCADE`),
      ).rejects.toThrow(/somente inserção/);
    });

    it('CHECKs: coleta de PucStop nunca negativa; débito futuro aceito; saldo nunca negativo', async () => {
      const lucas = ids['lucas.almeida@pucminas.edu.br'];
      await expect(
        ds.query(
          `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, tipo, descricao, chave_idempotencia, saldo_apos) ` +
            `VALUES ($1, -10, 'PUCSTOP_CLAIM', 'x', 'teste:negativo', 0)`,
          [lucas],
        ),
      ).rejects.toThrow(/ck_xp_movimentacoes_pucstop_positivo/);
      await expect(
        ds.query(
          `INSERT INTO gamificacao.xp_carteiras (usuario_id, saldo) VALUES ($1, -1)`,
          [lucas],
        ),
      ).rejects.toThrow(/ck_xp_carteiras_saldo/);
      // Débito (troca futura) é um tipo válido no schema; este fica revertido.
      const qr = ds.createQueryRunner();
      await qr.startTransaction();
      await qr.query(
        `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, tipo, descricao, chave_idempotencia, saldo_apos) ` +
          `VALUES ($1, -5, 'RECOMPENSA', 'troca', 'teste:debito', 0)`,
        [lucas],
      );
      await qr.rollbackTransaction();
      await qr.release();
    });

    it('falha no meio da coleta desfaz tudo (rollback): sem XP, sem coleta', async () => {
      const lucas = 'lucas.almeida@pucminas.edu.br';
      await ds.query(
        `CREATE FUNCTION gamificacao.falha_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END $$`,
      );
      await ds.query(
        `CREATE TRIGGER falha_teste BEFORE INSERT ON gamificacao.pucstop_coletas FOR EACH ROW EXECUTE FUNCTION gamificacao.falha_teste()`,
      );
      try {
        await coletar(MEDICINA.id, lucas, {
          latitude: MEDICINA.latitude,
          longitude: MEDICINA.longitude,
        }).expect(500);
      } finally {
        await ds.query(
          `DROP TRIGGER falha_teste ON gamificacao.pucstop_coletas`,
        );
        await ds.query(`DROP FUNCTION gamificacao.falha_teste()`);
      }
      expect(await saldoELedger(ids[lucas])).toEqual({
        saldo: 0,
        soma: 0,
        movimentacoes: 0,
        coletas: 0,
      });
      // Depois da falha, a mesma coleta funciona (nada ficou "meio gravado").
      await coletar(MEDICINA.id, lucas, {
        latitude: MEDICINA.latitude,
        longitude: MEDICINA.longitude,
      }).expect(201);
    });

    it('falha ao gravar o XP desfaz a coleta (sem coleta sem XP)', async () => {
      const lucas = 'lucas.almeida@pucminas.edu.br';
      const antes = await saldoELedger(ids[lucas]);
      await ds.query(
        `CREATE FUNCTION gamificacao.falha_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada no ledger'; END $$`,
      );
      await ds.query(
        `CREATE TRIGGER falha_ledger BEFORE INSERT ON gamificacao.xp_movimentacoes FOR EACH ROW EXECUTE FUNCTION gamificacao.falha_ledger()`,
      );
      try {
        await coletar(BIBLIOTECA.id, lucas, {
          latitude: BIBLIOTECA.latitude,
          longitude: BIBLIOTECA.longitude,
        }).expect(500);
      } finally {
        await ds.query(
          `DROP TRIGGER falha_ledger ON gamificacao.xp_movimentacoes`,
        );
        await ds.query(`DROP FUNCTION gamificacao.falha_ledger()`);
      }
      expect(await saldoELedger(ids[lucas])).toEqual(antes);
    });

    it('invariantes: toda coleta tem sua movimentação e vice-versa, com o mesmo XP', async () => {
      const [r] = await ds.query(
        `SELECT
           (SELECT count(*)::int FROM gamificacao.xp_movimentacoes m WHERE m.tipo = 'PUCSTOP_CLAIM'
              AND NOT EXISTS (SELECT 1 FROM gamificacao.pucstop_coletas c WHERE c.movimentacao_id = m.id
                AND c.usuario_id = m.usuario_id AND c.pucstop_id::text = m.referencia_id AND c.xp = m.quantidade)) AS xp_sem_coleta,
           (SELECT count(*)::int FROM gamificacao.pucstop_coletas c
              LEFT JOIN gamificacao.xp_movimentacoes m ON m.id = c.movimentacao_id WHERE m.id IS NULL) AS coleta_sem_xp,
           (SELECT count(*)::int FROM gamificacao.pucstop_coletas) AS coletas,
           (SELECT count(*)::int FROM gamificacao.xp_movimentacoes WHERE tipo = 'PUCSTOP_CLAIM') AS movimentacoes`,
      );
      expect(r).toMatchObject({ xp_sem_coleta: 0, coleta_sem_xp: 0 });
      expect(r.coletas).toBe(r.movimentacoes);
      expect(r.coletas).toBeGreaterThan(0);
    });

    it('função de trigger com search_path fixo (vazio)', async () => {
      const [{ config }] = await ds.query(
        `SELECT proconfig[1] AS config FROM pg_proc WHERE oid = 'gamificacao.somente_insercao()'::regprocedure`,
      );
      expect(config).toBe('search_path=""');
    });
  });

  describe('histórico após edição', () => {
    const camila = 'camila@pucminas.edu.br';
    const marina = 'marina.rocha@pucminas.edu.br';
    const editavel = fixture('Prédio 4', 'P04', 25, 50);

    it('claim e XP antigos ficam; o novo XP vale só para as próximas coletas', async () => {
      const { body } = await criarPucStop({
        nome: editavel.nome,
        latitude: editavel.latitude,
        longitude: editavel.longitude,
        xp: editavel.xp,
        raioMetros: editavel.raioMetros,
      }).expect(201);
      editavel.id = body.id;
      const antes = await saldoELedger(ids[camila]);
      await coletar(editavel.id, camila, {
        latitude: editavel.latitude,
        longitude: editavel.longitude,
      }).expect(201);

      // Coordenação muda XP, raio, nome e move o totem 150 m.
      const novo = await aDistancia(editavel, 150, 180);
      await editar(editavel.id, {
        nome: 'Prédio 4 (novo local)',
        xp: 30,
        raioMetros: 30,
        ...novo,
      }).expect(200);

      // Coleta da Camila intacta: mesmo XP concedido, mesma descrição.
      const [coleta] = await ds.query(
        `SELECT c.xp, m.quantidade, m.descricao, m.saldo_apos FROM gamificacao.pucstop_coletas c ` +
          `JOIN gamificacao.xp_movimentacoes m ON m.id = c.movimentacao_id WHERE c.usuario_id = $1 AND c.pucstop_id = $2`,
        [ids[camila], editavel.id],
      );
      expect(coleta).toEqual({
        xp: 50,
        quantidade: 50,
        descricao: 'PucStop: Prédio 4',
        saldo_apos: antes.saldo + 50,
      });
      expect(await saldoELedger(ids[camila])).toMatchObject({
        saldo: antes.saldo + 50,
        soma: antes.soma + 50,
      });
      // Camila já coletou: mudar a posição não reabre a coleta.
      const repetida = await coletar(editavel.id, camila, novo).expect(409);
      expect(repetida.body.motivo).toBe('ja-coletado');

      // Na posição antiga, quem não coletou fica fora do alcance.
      const longe = await coletar(editavel.id, marina, {
        latitude: editavel.latitude,
        longitude: editavel.longitude,
      }).expect(422);
      expect(longe.body.motivo).toBe('fora-do-alcance');
      // Na posição nova, ganha o XP novo.
      const { body: nova } = await coletar(editavel.id, marina, novo).expect(
        201,
      );
      expect(nova.xpGanho).toBe(30);
      const { body: minhas } = await http()
        .get('/me/pucstops')
        .set('Authorization', token(camila))
        .expect(200);
      expect(
        minhas.find((c: { pucstopId: string }) => c.pucstopId === editavel.id),
      ).toMatchObject({ xp: 50 });
    });

    it('desativar não apaga coletas nem ledger; coleta nova fica bloqueada', async () => {
      const contar = async () =>
        (
          await ds.query(
            `SELECT (SELECT count(*)::int FROM gamificacao.pucstop_coletas WHERE pucstop_id = $1) AS coletas, ` +
              `(SELECT count(*)::int FROM gamificacao.xp_movimentacoes WHERE referencia_id = $1::text) AS movimentacoes, ` +
              `(SELECT coalesce(sum(quantidade), 0)::int FROM gamificacao.xp_movimentacoes WHERE referencia_id = $1::text) AS xp`,
            [editavel.id],
          )
        )[0];
      const antes = await contar();
      expect(antes).toEqual({ coletas: 2, movimentacoes: 2, xp: 80 });
      const { body } = await acao(editavel.id, 'desativar').expect(200);
      expect(body).toMatchObject({ ativo: false, coletas: 2 });
      expect(await contar()).toEqual(antes);
      const recusada = await coletar(editavel.id, 'thiago@pucminas.edu.br', {
        latitude: body.latitude,
        longitude: body.longitude,
      }).expect(422);
      expect(recusada.body.motivo).toBe('inativo');
      expect(await contar()).toEqual(antes);
      // Nem por SQL direto: as coletas seguram a linha (RESTRICT).
      await expect(
        ds.query(`DELETE FROM mapa.pucstops WHERE id = $1`, [editavel.id]),
      ).rejects.toThrow(/fk_pucstop_coletas_pucstop/);
    });
  });

  describe('BL-50: coleta por ciclo, tetos e XP x moedas', () => {
    let seq = 0;
    async function novoAluno(): Promise<string> {
      const email = `bl50.${++seq}.${Date.now()}@pucminas.edu.br`;
      const [{ id }] = (await ds.query(
        `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
          `VALUES ('Aluno BL50', $1, 'ES', 3, 'apadrinhado', 'aprovado') RETURNING id`,
        [email],
      )) as Array<{ id: number }>;
      ids[email] = id;
      return email;
    }

    /** Coleta já feita (ledger + coleta) num ciclo qualquer, como o servidor grava. */
    async function coletaAnterior(
      email: string,
      pucstopId: string,
      xp: number,
      ciclo: string,
    ) {
      await ds.transaction(async (m) => {
        const qr = m.queryRunner!;
        await travarCarteira(qr, ids[email]);
        const mov = await registrarMovimentacao(qr, {
          usuarioId: ids[email],
          quantidade: xp,
          xp,
          ciclo,
          tipo: 'PUCSTOP_CLAIM',
          referenciaTipo: 'pucstop',
          referenciaId: pucstopId,
          descricao: 'coleta anterior',
          chaveIdempotencia: `teste:${pucstopId}:${ids[email]}:${ciclo}`,
        });
        await qr.query(
          `INSERT INTO gamificacao.pucstop_coletas (usuario_id, pucstop_id, movimentacao_id, xp, xp_configurado, ciclo) ` +
            `VALUES ($1, $2, $3, $4, NULL, $5)`,
          [ids[email], pucstopId, mov.movimentacaoId, xp, ciclo],
        );
      });
    }

    async function carteira(email: string) {
      const [c] = (await ds.query(
        `SELECT saldo, xp_acumulado FROM gamificacao.xp_carteiras WHERE usuario_id = $1`,
        [ids[email]],
      )) as Array<{ saldo: number; xp_acumulado: number }>;
      return c;
    }

    it('o totem volta a dar recompensa no ciclo seguinte; o histórico fica', async () => {
      const aluno = await novoAluno();
      await coletaAnterior(aluno, BIBLIOTECA.id, 50, '2020/1');
      const { body } = await coletar(
        BIBLIOTECA.id,
        aluno,
        await aDistancia(BIBLIOTECA, 1),
      ).expect(201);
      expect(body).toMatchObject({
        xpGanho: 50,
        moedasGanhas: 50,
        ciclo: CICLO,
        xpAcumulado: 100,
        moedas: 100,
      });
      // Mesmo ciclo: não repete.
      const repetida = await coletar(
        BIBLIOTECA.id,
        aluno,
        await aDistancia(BIBLIOTECA, 1),
      ).expect(409);
      expect(repetida.body.motivo).toBe('ja-coletado');
      // O mapa mostra só a coleta deste ciclo; as duas ficam no banco.
      const { body: minhas } = await http()
        .get('/me/pucstops')
        .set('Authorization', token(aluno))
        .expect(200);
      expect(minhas).toEqual([
        expect.objectContaining({ pucstopId: BIBLIOTECA.id, ciclo: CICLO }),
      ]);
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM gamificacao.pucstop_coletas WHERE usuario_id = $1`,
        [ids[aluno]],
      );
      expect(n).toBe(2);
    });

    it('teto de 400 XP de totens no ciclo: crédito parcial e depois coleta sem XP', async () => {
      const aluno = await novoAluno();
      await coletaAnterior(aluno, INATIVO.id, 380, CICLO);
      const { body: parcial } = await coletar(
        BIBLIOTECA.id,
        aluno,
        await aDistancia(BIBLIOTECA, 1),
      ).expect(201);
      expect(parcial).toMatchObject({
        xpConfigurado: 50,
        xpGanho: 20,
        moedasGanhas: 20,
        limiteAtingido: true,
        xpAcumulado: 400,
        moedas: 400,
      });
      const { body: zero } = await coletar(
        MEDICINA.id,
        aluno,
        await aDistancia(MEDICINA, 1),
      ).expect(201);
      expect(zero).toMatchObject({
        xpConfigurado: 40,
        xpGanho: 0,
        moedasGanhas: 0,
        limiteAtingido: true,
        xpAcumulado: 400,
        moedas: 400,
      });
      // A coleta fica registrada, sem movimentação.
      const [coleta] = await ds.query(
        `SELECT xp, xp_configurado, movimentacao_id FROM gamificacao.pucstop_coletas WHERE usuario_id = $1 AND pucstop_id = $2`,
        [ids[aluno], MEDICINA.id],
      );
      expect(coleta).toEqual({
        xp: 0,
        xp_configurado: 40,
        movimentacao_id: null,
      });
      const { body: resumo } = await http()
        .get('/me/xp')
        .set('Authorization', token(aluno))
        .expect(200);
      expect(resumo.limites.totens).toEqual({ ganho: 400, limite: 400 });
      expect(resumo.nivel).toMatchObject({ numero: 4, nome: 'Descoberta' });
    });

    it('coletas simultâneas perto do teto nunca passam de 400', async () => {
      const aluno = await novoAluno();
      await coletaAnterior(aluno, INATIVO.id, 380, CICLO);
      const respostas = await Promise.all(
        await Promise.all(
          ATIVOS.map(async (p) => coletar(p.id, aluno, await aDistancia(p, 1))),
        ),
      );
      expect(respostas.map((r) => r.status)).toEqual(ATIVOS.map(() => 201));
      const ganhos = respostas.reduce(
        (s, r) => s + (r.body as { xpGanho: number }).xpGanho,
        0,
      );
      expect(ganhos).toBe(20);
      const [{ total }] = await ds.query(
        `SELECT sum(xp)::int AS total FROM gamificacao.pucstop_coletas WHERE usuario_id = $1 AND ciclo = $2`,
        [ids[aluno], CICLO],
      );
      expect(total).toBe(400);
      expect(await carteira(aluno)).toEqual({ saldo: 400, xp_acumulado: 400 });
    });

    it('resgate e estorno mexem só nas moedas; XP e nível ficam', async () => {
      const aluno = await novoAluno();
      await coletaAnterior(aluno, BIBLIOTECA.id, 50, '2020/1');
      await coletaAnterior(aluno, MEDICINA.id, 40, '2020/1');
      await ds.transaction(async (m) => {
        const qr = m.queryRunner!;
        await travarCarteira(qr, ids[aluno]);
        await registrarMovimentacao(qr, {
          usuarioId: ids[aluno],
          quantidade: -60,
          tipo: 'RECOMPENSA',
          referenciaTipo: 'RESGATE',
          referenciaId: 'r-bl50',
          descricao: 'Resgate',
          chaveIdempotencia: `resgate-bl50-${ids[aluno]}`,
        });
      });
      expect(await carteira(aluno)).toEqual({ saldo: 30, xp_acumulado: 90 });
      // Estorno no formato da branch Arthur_gv (RECOMPENSA positivo).
      await ds.transaction(async (m) => {
        const qr = m.queryRunner!;
        await travarCarteira(qr, ids[aluno]);
        await registrarMovimentacao(qr, {
          usuarioId: ids[aluno],
          quantidade: 60,
          tipo: 'RECOMPENSA',
          referenciaTipo: 'RESGATE',
          referenciaId: 'r-bl50',
          descricao: 'Estorno',
          chaveIdempotencia: `estorno-bl50-${ids[aluno]}`,
        });
      });
      expect(await carteira(aluno)).toEqual({ saldo: 90, xp_acumulado: 90 });
      // Moedas nunca negativas.
      await expect(
        ds.transaction(async (m) => {
          const qr = m.queryRunner!;
          await travarCarteira(qr, ids[aluno]);
          await registrarMovimentacao(qr, {
            usuarioId: ids[aluno],
            quantidade: -91,
            tipo: 'RECOMPENSA',
            referenciaTipo: 'RESGATE',
            referenciaId: 'r2',
            descricao: 'Resgate',
            chaveIdempotencia: `resgate2-bl50-${ids[aluno]}`,
          });
        }),
      ).rejects.toThrow(/Moedas insuficientes/);
      // Resgate não pode carregar XP.
      await expect(
        ds.query(
          `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, xp_quantidade, tipo, descricao, chave_idempotencia, saldo_apos) ` +
            `VALUES ($1, -1, -1, 'RECOMPENSA', 'x', $2, 89)`,
          [ids[aluno], `invalido-${ids[aluno]}`],
        ),
      ).rejects.toThrow(/ck_xp_movimentacoes_xp_recompensa/);
    });

    it('ajuste administrativo fica entre -200 e +200 e corrige XP e moedas', async () => {
      const aluno = await novoAluno();
      await coletaAnterior(aluno, BIBLIOTECA.id, 50, '2020/1');
      const ajustar = (quantidade: number, chave: string) =>
        ds.transaction(async (m) => {
          const qr = m.queryRunner!;
          await travarCarteira(qr, ids[aluno]);
          await registrarMovimentacao(qr, {
            usuarioId: ids[aluno],
            quantidade,
            tipo: 'AJUSTE_ADMIN',
            referenciaTipo: 'AJUSTE',
            referenciaId: chave,
            descricao: 'Correção de fraude',
            chaveIdempotencia: `ajuste-${chave}-${ids[aluno]}`,
          });
        });
      await expect(ajustar(201, 'a')).rejects.toThrow(/limitado a 200/);
      await expect(ajustar(-201, 'b')).rejects.toThrow(/limitado a 200/);
      await ajustar(-20, 'c');
      expect(await carteira(aluno)).toEqual({ saldo: 30, xp_acumulado: 30 });
      // O XP acumulado também nunca fica negativo.
      await expect(ajustar(-31, 'd')).rejects.toThrow();
    });

    it('versão antiga do backend (sem xp_quantidade): o gatilho mantém o XP', async () => {
      const aluno = await novoAluno();
      await coletaAnterior(aluno, BIBLIOTECA.id, 50, '2020/1');
      await ds.query(
        `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, tipo, descricao, chave_idempotencia, saldo_apos) ` +
          `VALUES ($1, 30, 'PUCSTOP_CLAIM', 'versão antiga', $2, 80)`,
        [ids[aluno], `antiga-${ids[aluno]}`],
      );
      await ds.query(
        `UPDATE gamificacao.xp_carteiras SET saldo = 80 WHERE usuario_id = $1`,
        [ids[aluno]],
      );
      expect(await carteira(aluno)).toEqual({ saldo: 80, xp_acumulado: 80 });
    });

    it('CRUD aceita só 10/20/30/40/50 e o orçamento mostra o potencial', async () => {
      for (const xp of [0, 5, 15, 35, 60, 100, 1000])
        await editar(BIBLIOTECA.id, { xp }).expect(400);
      await expect(
        ds.query(`UPDATE mapa.pucstops SET xp = 45 WHERE id = $1`, [
          BIBLIOTECA.id,
        ]),
      ).rejects.toThrow(/ck_pucstops_xp/);
      const { body } = await http()
        .get('/coordenacao/pucstops/orcamento')
        .set('Authorization', coordenador())
        .expect(200);
      const [{ ativos, inativos, potencial }] = await ds.query(
        `SELECT count(*) FILTER (WHERE ativo)::int AS ativos, count(*) FILTER (WHERE NOT ativo)::int AS inativos, ` +
          `COALESCE(sum(xp) FILTER (WHERE ativo), 0)::int AS potencial FROM mapa.pucstops`,
      );
      expect(body).toMatchObject({
        ativos,
        inativos,
        xpPotencial: potencial,
        moedasPotenciais: potencial,
        recompensaMedia: Math.round((potencial / ativos) * 10) / 10,
        limitePorCiclo: 400,
        excedeLimite: potencial > 400,
        ciclo: CICLO,
        opcoes: [10, 20, 30, 40, 50],
        padrao: 30,
      });
      // Distribuição por faixa soma os ativos; inativos ficam de fora.
      expect(body.distribuicao.map((d: { xp: number }) => d.xp)).toEqual([
        10, 20, 30, 40, 50,
      ]);
      expect(
        body.distribuicao.reduce(
          (s: number, d: { totens: number }) => s + d.totens,
          0,
        ),
      ).toBe(ativos);

      // Estimativa de emissão: participantes elegíveis (uma vez cada) ×
      // menor valor entre o potencial e o teto.
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ($1, 'Ciclo', 'andamento') ON CONFLICT DO NOTHING`,
        [CICLO],
      );
      await ds.query(
        `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ` +
          `('elegivel.a@pucminas.edu.br', $1, 'apadrinhado', 'em_andamento'), ` +
          `('elegivel.b@pucminas.edu.br', $1, 'candidato', 'aprovado'), ` +
          `('elegivel.b@pucminas.edu.br', $1, 'padrinho', 'em_andamento'), ` +
          `('pendente@pucminas.edu.br', $1, 'candidato', 'pendente'), ` +
          `('antigo@pucminas.edu.br', '2020/1', 'apadrinhado', 'em_andamento')`,
        [CICLO],
      );
      const { body: comAlunos } = await http()
        .get('/coordenacao/pucstops/orcamento')
        .set('Authorization', coordenador())
        .expect(200);
      expect(comAlunos.participantesElegiveis).toBe(2);
      expect(comAlunos.emissaoMaximaEstimada).toBe(
        2 * Math.min(potencial, 400),
      );
      await http()
        .get('/coordenacao/pucstops/orcamento')
        .set('Authorization', token('camila@pucminas.edu.br'))
        .expect(403);
    });

    it('GET /gamificacao/niveis é a tabela única dos níveis', async () => {
      const { body } = await http().get('/gamificacao/niveis').expect(200);
      expect(body).toHaveLength(10);
      expect(body[9]).toEqual({
        numero: 10,
        nome: 'Lenda da PUC',
        xpMinimo: 2600,
      });
    });
  });

  describe('migration', () => {
    it('BL-50 reconstrói o XP do ledger, classifica coletas por semestre e normaliza totens', async () => {
      const banco = 'pucstops_bl50_backfill';
      await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
      await admin(`CREATE DATABASE ${banco}`);
      criados.push(banco);
      const antigo = new DataSource({
        type: 'postgres',
        url: urlDo(banco),
        schema: 'feed',
        migrations: MIGRATIONS.filter(
          (m) => m !== GamificacaoNiveisMoedasCiclos1794000000000,
        ),
        migrationsTableName: 'migrations',
        installExtensions: false,
      });
      await antigo.initialize();
      try {
        await antigo.query('CREATE SCHEMA IF NOT EXISTS feed');
        await antigo.runMigrations({ transaction: 'all' });
        const [{ id: uid }] = await antigo.query(
          `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
            `VALUES ('Legado', 'legado@pucminas.edu.br', 'ES', 3, 'apadrinhado', 'aprovado') RETURNING id`,
        );
        const totem = async (nome: string, xp: number) =>
          (
            await antigo.query(
              `INSERT INTO mapa.pucstops (nome, localizacao, raio_metros, xp) ` +
                `VALUES ($1, ST_SetSRID(ST_MakePoint(-43.99, -19.92), 4326), 30, $2) RETURNING id`,
              [nome, xp],
            )
          )[0].id as string;
        const t15 = await totem('Quinze', 15);
        const t100 = await totem('Cem', 100);
        const t25 = await totem('Vinte e cinco', 25);
        const t30 = await totem('Trinta', 30);
        // Histórico: 300 XP de totens (um no fim de junho, outro em julho,
        // em Brasília), resgate de 200, estorno de 50 e ajuste de +20.
        const mov = async (
          quantidade: number,
          tipo: string,
          saldo: number,
          chave: string,
          criadoEm: string,
        ) =>
          (
            await antigo.query(
              `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, tipo, descricao, chave_idempotencia, saldo_apos, criado_em) ` +
                `VALUES ($1, $2, $3, 'legado', $4, $5, $6) RETURNING id`,
              [uid, quantidade, tipo, chave, saldo, criadoEm],
            )
          )[0].id as string;
        const m1 = await mov(
          150,
          'PUCSTOP_CLAIM',
          150,
          'k1',
          '2026-06-30T23:30:00-03:00',
        );
        const m2 = await mov(
          150,
          'PUCSTOP_CLAIM',
          300,
          'k2',
          '2026-07-01T00:30:00-03:00',
        );
        await mov(-200, 'RECOMPENSA', 100, 'k3', '2026-08-01T10:00:00-03:00');
        await mov(50, 'RECOMPENSA', 150, 'k4', '2026-08-02T10:00:00-03:00');
        await mov(20, 'AJUSTE_ADMIN', 170, 'k5', '2026-08-03T10:00:00-03:00');
        await antigo.query(
          `INSERT INTO gamificacao.xp_carteiras (usuario_id, saldo) VALUES ($1, 170)`,
          [uid],
        );
        await antigo.query(
          `INSERT INTO gamificacao.pucstop_coletas (usuario_id, pucstop_id, movimentacao_id, xp, coletado_em) VALUES ` +
            `($1, $2, $3, 150, '2026-06-30T23:30:00-03:00'), ($1, $4, $5, 150, '2026-07-01T00:30:00-03:00')`,
          [uid, t15, m1, t100, m2],
        );

        const qr = antigo.createQueryRunner();
        try {
          await qr.startTransaction();
          await new GamificacaoNiveisMoedasCiclos1794000000000().up(qr);
          await qr.commitTransaction();
        } finally {
          await qr.release();
        }

        // XP = ganhos de atividade + ajustes (300 + 20); resgate e estorno fora.
        expect(
          await antigo.query(
            `SELECT saldo, xp_acumulado FROM gamificacao.xp_carteiras WHERE usuario_id = $1`,
            [uid],
          ),
        ).toEqual([{ saldo: 170, xp_acumulado: 320 }]);
        // Ledger intacto.
        expect(
          (
            await antigo.query(
              `SELECT count(*)::int AS n, sum(quantidade)::int AS soma FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1`,
              [uid],
            )
          )[0],
        ).toEqual({ n: 5, soma: 170 });
        // Coletas no semestre da própria data (fuso de Brasília).
        expect(
          await antigo.query(
            `SELECT pucstop_id, ciclo, xp, xp_configurado FROM gamificacao.pucstop_coletas WHERE usuario_id = $1 ORDER BY coletado_em`,
            [uid],
          ),
        ).toEqual([
          { pucstop_id: t15, ciclo: '2026/1', xp: 150, xp_configurado: 150 },
          { pucstop_id: t100, ciclo: '2026/2', xp: 150, xp_configurado: 150 },
        ]);
        // Totens: opção mais próxima (meio para cima), limitada a 10–50.
        const totens = Object.fromEntries(
          (
            (await antigo.query(`SELECT id, xp FROM mapa.pucstops`)) as Array<{
              id: string;
              xp: number;
            }>
          ).map((t) => [t.id, t.xp]),
        );
        expect([totens[t15], totens[t100], totens[t25], totens[t30]]).toEqual([
          20, 50, 30, 30,
        ]);
        // Coletas continuam só-inserção depois da migração.
        await expect(
          antigo.query(`UPDATE gamificacao.pucstop_coletas SET xp = 1`),
        ).rejects.toThrow(/somente inserção/);

        // Rollback (sem dados que o esquema antigo não represente).
        const qr2 = antigo.createQueryRunner();
        try {
          await qr2.startTransaction();
          await new GamificacaoNiveisMoedasCiclos1794000000000().down(qr2);
          await qr2.commitTransaction();
        } finally {
          await qr2.release();
        }
        const [{ n }] = await antigo.query(
          `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'gamificacao' AND column_name IN ('xp_acumulado', 'xp_quantidade', 'ciclo', 'xp_configurado')`,
        );
        expect(n).toBe(0);
      } finally {
        await antigo.destroy();
      }
    });

    it('BL-50 recusa migrar histórico em que o XP ficaria negativo', async () => {
      const banco = 'pucstops_bl50_inconsistente';
      await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
      await admin(`CREATE DATABASE ${banco}`);
      criados.push(banco);
      const antigo = new DataSource({
        type: 'postgres',
        url: urlDo(banco),
        schema: 'feed',
        migrations: MIGRATIONS.filter(
          (m) => m !== GamificacaoNiveisMoedasCiclos1794000000000,
        ),
        migrationsTableName: 'migrations',
        installExtensions: false,
      });
      await antigo.initialize();
      try {
        await antigo.query('CREATE SCHEMA IF NOT EXISTS feed');
        await antigo.runMigrations({ transaction: 'all' });
        const [{ id: uid }] = await antigo.query(
          `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
            `VALUES ('X', 'x@pucminas.edu.br', 'ES', 3, 'apadrinhado', 'aprovado') RETURNING id`,
        );
        await antigo.query(
          `INSERT INTO gamificacao.xp_movimentacoes (usuario_id, quantidade, tipo, descricao, chave_idempotencia, saldo_apos) ` +
            `VALUES ($1, 100, 'RECOMPENSA', 'crédito estranho', 'z1', 100), ($1, -50, 'AJUSTE_ADMIN', 'ajuste', 'z2', 50)`,
          [uid],
        );
        const qr = antigo.createQueryRunner();
        try {
          await qr.startTransaction();
          await expect(
            new GamificacaoNiveisMoedasCiclos1794000000000().up(qr),
          ).rejects.toThrow(/Histórico inconsistente/);
          await qr.rollbackTransaction();
        } finally {
          await qr.release();
        }
      } finally {
        await antigo.destroy();
      }
    });

    it('sem versão ativa do mapa: campus e criação dão 503; rollback e nova subida', async () => {
      const migration = new PucStopsEXpGlobal1792279161187();
      const qr = ds.createQueryRunner();
      try {
        await expect(migration.down(qr)).rejects.toThrow(/Rollback recusado/);
      } finally {
        await qr.release();
      }

      const vazio = await bancoMigrado('vazio');
      try {
        const servico = new PucStopsAdminService(vazio);
        await expect(servico.campus()).rejects.toThrow(/sem versão ativa/);
        await expect(
          servico.criar(
            { nome: 'x', ...noPredio('P26'), xp: 10, raioMetros: 20 },
            null,
          ),
        ).rejects.toThrow(/sem versão ativa/);
        expect(await new PucStopsService(vazio).listar()).toEqual([]);

        await vazio.undoLastMigration(); // BL-50
        await vazio.undoLastMigration(); // PucStops e XP
        const [{ n }] = await vazio.query(
          `SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'gamificacao'`,
        );
        expect(n).toBe(0);
        expect(
          await vazio.query(`SELECT to_regclass('mapa.pucstops') AS t`),
        ).toEqual([{ t: null }]);
        // As tabelas do mapa continuam.
        expect(
          await vazio.query(`SELECT to_regclass('mapa.versoes')::text AS t`),
        ).toEqual([{ t: 'mapa.versoes' }]);
        expect(await vazio.runMigrations({ transaction: 'all' })).toHaveLength(
          2,
        );
      } finally {
        await vazio.destroy();
      }
    });
  });
});
