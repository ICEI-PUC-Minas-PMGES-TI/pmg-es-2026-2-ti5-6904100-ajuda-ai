/**
 * Celebração de nível (migration CelebracoesNivel + GET/POST /me/xp) contra
 * PostgreSQL/PostGIS REAL e descartável. Pulado sem MAPA_TEST_DB_URL; mesmo
 * procedimento de test/mapa-banco.integration.spec.ts (bancos `celebracoes_*`
 * criados no servidor indicado e apagados ao fim). Use a mesma versão do
 * Supabase (PostgreSQL 17):
 *
 *   docker run -d --rm --name celebracao-teste -p 127.0.0.1:55433:5432 \
 *     -e POSTGRES_PASSWORD=teste postgis/postgis:17-3.5-alpine \
 *     -c 'search_path="$user", public, extensions'
 *   MAPA_TEST_DB_URL=postgres://postgres:teste@localhost:55433/postgres \
 *     npx vitest run test/celebracoes.integration
 *
 * Roteiro: banco com dados ANTES da migration → migration (backfill) → subida
 * real por totem → confirmação → vários níveis → concorrência → correção de
 * XP → down/up. Em todas as etapas, XP, moedas, ledger e coletas são
 * conferidos contra uma fotografia: a celebração nunca mexe neles.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource, type MigrationInterface } from 'typeorm';
import { permissoesPeloToken } from './helpers/permissoes.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { NIVEIS, nivelDe } from '../src/gamificacao/economia.js';
import { registrarMovimentacao } from '../src/gamificacao/gamificacao.js';
import { PucStopsAdminController } from '../src/gamificacao/pucstops/pucstops-admin.controller.js';
import { PucStopsAdminService } from '../src/gamificacao/pucstops/pucstops-admin.service.js';
import { PucStopsController } from '../src/gamificacao/pucstops/pucstops.controller.js';
import { PucStopsService } from '../src/gamificacao/pucstops/pucstops.service.js';
import { XpController } from '../src/gamificacao/xp/xp.controller.js';
import { XpService } from '../src/gamificacao/xp/xp.service.js';
import { importarSnapshot } from '../src/mapa/importacao/importar-snapshot.js';
import { validarSnapshot } from '../src/mapa/importacao/snapshot.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { GamificacaoNiveisMoedasCiclos1794000000000 } from '../src/migrations/1794000000000-GamificacaoNiveisMoedasCiclos.js';
import { CelebracoesNivel1794100000000 } from '../src/migrations/1794100000000-CelebracoesNivel.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-de-teste-celebracoes';
/** Estado do Supabase hoje: tudo até a BL-50, sem CelebracoesNivel. */
const MIGRATIONS_ATE_HOJE: Array<new () => MigrationInterface> = [
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

function noPredio(id: string) {
  const predio = mapa.predios.find((p) => p.id === id)!;
  const [longitude, latitude] = predio.localizacao.coordinates;
  return { latitude, longitude };
}

/** Contas e XP que já existem antes da migration (como no Supabase). */
const CONTAS = {
  veterano: { email: 'veterano@pucminas.edu.br', xp: 600 }, // nível 5
  quase: { email: 'quase@pucminas.edu.br', xp: 40 }, // nível 1, a 10 do 2
  novato: { email: 'novato@pucminas.edu.br', xp: 0 }, // sem carteira
  saltador: { email: 'saltador@pucminas.edu.br', xp: 0 },
  concorrente: { email: 'concorrente@pucminas.edu.br', xp: 140 }, // nível 2
  limite: { email: 'limite@pucminas.edu.br', xp: 50 }, // exatamente nível 2
} as const;
type Conta = keyof typeof CONTAS;

const criados: string[] = [];
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

describe.skipIf(!URL_TESTE)('Celebração de nível com PostgreSQL real', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  const ids = {} as Record<Conta, number>;
  const totens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const token = (conta: Conta) =>
    `Bearer ${jwt.sign({ sub: String(ids[conta]), email: CONTAS[conta].email, perfil: 'apadrinhado', escopo: 'acesso' })}`;
  const coordenador = () =>
    `Bearer ${jwt.sign({ sub: '999', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;

  const resumo = async (conta: Conta) =>
    (await http().get('/me/xp').set('Authorization', token(conta)).expect(200))
      .body;
  const confirmar = (conta: Conta, nivel: number) =>
    http()
      .post('/me/xp/celebracoes')
      .set('Authorization', token(conta))
      .send({ nivel });

  /** Ajuste pelo domínio (como o seed e a coordenação): ±200 por vez. */
  async function ajustar(conta: Conta, total: number, marca: string) {
    let resto = total;
    let n = 0;
    while (resto !== 0) {
      const parte = Math.sign(resto) * Math.min(200, Math.abs(resto));
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await registrarMovimentacao(qr, {
          usuarioId: ids[conta],
          quantidade: parte,
          tipo: 'AJUSTE_ADMIN',
          referenciaTipo: 'TESTE',
          referenciaId: marca,
          descricao: 'Teste de celebração',
          chaveIdempotencia: `teste:${marca}:${conta}:${n++}`,
        });
        await qr.commitTransaction();
      } catch (e) {
        await qr.rollbackTransaction();
        throw e;
      } finally {
        await qr.release();
      }
      resto -= parte;
    }
  }

  /** Fotografia de tudo que a celebração NÃO pode tocar. */
  async function fotografia() {
    const [linha] = (await ds.query(
      `SELECT ` +
        `(SELECT json_agg(c ORDER BY usuario_id) FROM gamificacao.xp_carteiras c) AS carteiras, ` +
        `(SELECT json_agg(m ORDER BY id) FROM gamificacao.xp_movimentacoes m) AS ledger, ` +
        `(SELECT json_agg(p ORDER BY id) FROM gamificacao.pucstop_coletas p) AS coletas, ` +
        `(SELECT json_agg(u ORDER BY id) FROM feed.usuarios u) AS usuarios`,
    )) as Array<Record<string, unknown>>;
    return JSON.stringify(linha);
  }

  async function celebrados(): Promise<Record<number, number>> {
    const linhas = (await ds.query(
      `SELECT usuario_id, nivel_celebrado FROM gamificacao.celebracoes_nivel`,
    )) as Array<{ usuario_id: number; nivel_celebrado: number }>;
    return Object.fromEntries(
      linhas.map((l) => [l.usuario_id, l.nivel_celebrado]),
    );
  }

  /** Invariante: o nível celebrado nunca passa do nível real. */
  async function semCelebracaoAcimaDoReal() {
    const [{ n }] = (await ds.query(
      `SELECT count(*)::int AS n FROM gamificacao.celebracoes_nivel cn ` +
        `LEFT JOIN gamificacao.xp_carteiras c ON c.usuario_id = cn.usuario_id ` +
        `WHERE cn.nivel_celebrado > (CASE ${NIVEIS.slice(1)
          .reverse()
          .map(
            (n) =>
              `WHEN COALESCE(c.xp_acumulado, 0) >= ${n.xpMinimo} THEN ${n.numero}`,
          )
          .join(' ')} ELSE 1 END)`,
    )) as Array<{ n: number }>;
    expect(n).toBe(0);
  }

  async function migrar(sentido: 'up' | 'down') {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await new CelebracoesNivel1794100000000()[sentido](qr);
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  beforeAll(async () => {
    const banco = 'celebracoes_api';
    await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${banco}`);
    criados.push(banco);
    ds = new DataSource({
      type: 'postgres',
      url: urlDo(banco),
      schema: 'feed',
      migrations: MIGRATIONS_ATE_HOJE,
      migrationsTableName: 'migrations',
      installExtensions: false,
      extra: { max: 30 },
    });
    await ds.initialize();
    await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
    await ds.runMigrations({ transaction: 'all' });
    for (const conta of Object.keys(CONTAS) as Conta[]) {
      const [{ id }] = await ds.query(
        `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
          `VALUES ($1, $2, 'Engenharia de Software', 3, 'apadrinhado', 'aprovado') RETURNING id`,
        [conta, CONTAS[conta].email],
      );
      ids[conta] = id;
    }
    await importarSnapshot(ds, mapa, { ativar: true });

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [PucStopsController, XpController, PucStopsAdminController],
      providers: [
        PucStopsService,
        PucStopsAdminService,
        XpService,
        JwtAuthGuard,
        RolesGuard,
        permissoesPeloToken(),
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    jwt = modulo.get(JwtService);

    for (const [nome, predio, xp] of [
      ['Biblioteca', 'P26', 30],
      ['ICEI', 'P34', 50],
      ['Cantina', 'P16', 10],
    ] as const) {
      const { body } = await http()
        .post('/coordenacao/pucstops')
        .set('Authorization', coordenador())
        .send({ nome, ...noPredio(predio), xp, raioMetros: 30 })
        .expect(201);
      totens[nome] = body.id;
    }
    // XP já existente antes da migration.
    for (const conta of Object.keys(CONTAS) as Conta[])
      if (CONTAS[conta].xp) await ajustar(conta, CONTAS[conta].xp, 'antes');
  });

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
    if (!URL_TESTE) return;
    for (const banco of criados)
      await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
  });

  const coletar = (conta: Conta, totem: string, predio: string) =>
    http()
      .post(`/mapa/pucstops/${totens[totem]}/claim`)
      .set('Authorization', token(conta))
      .send(noPredio(predio));

  it('antes da migration: /me/xp funciona sem celebração; confirmar dá 503', async () => {
    const r = await resumo('veterano');
    expect(r.nivel.numero).toBe(5);
    expect(r.celebracao).toBeNull();
    await confirmar('veterano', 5).expect(503);
  });

  it('migration: cria só a tabela nova, preenche o nível atual e não toca em mais nada', async () => {
    const antes = await fotografia();
    await migrar('up');
    expect(await fotografia()).toBe(antes);

    const colunas = (await ds.query(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns ` +
        `WHERE table_schema = 'gamificacao' AND table_name = 'celebracoes_nivel' ORDER BY ordinal_position`,
    )) as Array<Record<string, string>>;
    expect(colunas.map((c) => c.column_name)).toEqual([
      'usuario_id',
      'nivel_celebrado',
      'atualizado_em',
    ]);
    // Backfill: só quem tem XP ≥ 50, com o nível que nivelDe calcula.
    expect(await celebrados()).toEqual({
      [ids.veterano]: 5,
      [ids.concorrente]: 2,
      [ids.limite]: 2,
    });
    // Ninguém recebe animação de conquista antiga.
    for (const conta of Object.keys(CONTAS) as Conta[])
      expect((await resumo(conta)).celebracao).toBeNull();
  });

  it('subida real por totem: detecta, persiste até confirmar e nunca repete', async () => {
    const antes = (await resumo('quase')).xpAcumulado;
    const { body: coleta } = await coletar('quase', 'Biblioteca', 'P26').expect(
      201,
    );
    expect(coleta).toMatchObject({ xpGanho: 30, subiuDeNivel: true });
    expect(coleta.nivel.numero).toBe(2);

    // Recarregar antes de confirmar: a conquista continua pendente (o
    // cliente guarda que já exibiu; o servidor não perde a conquista).
    for (let i = 0; i < 2; i++) {
      const r = await resumo('quase');
      expect(r.xpAcumulado).toBe(antes + 30);
      expect(r.celebracao).toEqual({
        de: 1,
        para: 2,
        nome: 'Curiosidade',
        niveisAvancados: 1,
      });
    }

    const foto = await fotografia();
    expect((await confirmar('quase', 2).expect(200)).body).toEqual({
      nivelCelebrado: 2,
    });
    expect((await resumo('quase')).celebracao).toBeNull();
    // Repetir e pedir acima do real não muda nada.
    expect((await confirmar('quase', 2).expect(200)).body.nivelCelebrado).toBe(2);
    expect((await confirmar('quase', 10).expect(200)).body.nivelCelebrado).toBe(
      2,
    );
    expect((await confirmar('quase', 1).expect(200)).body.nivelCelebrado).toBe(2);
    expect(await fotografia()).toBe(foto);

    // Coleta repetida (409) não gera nova conquista.
    await coletar('quase', 'Biblioteca', 'P26').expect(409);
    expect((await resumo('quase')).celebracao).toBeNull();
  });

  it('coleta sem subir de nível: nada a celebrar', async () => {
    const { body } = await coletar('quase', 'Cantina', 'P16').expect(201);
    expect(body.subiuDeNivel).toBe(false);
    expect((await resumo('quase')).celebracao).toBeNull();
  });

  it('vários níveis de uma vez: uma celebração, do nível final', async () => {
    await ajustar('saltador', 520, 'salto');
    const r = await resumo('saltador');
    expect(r.nivel.numero).toBe(5);
    expect(r.celebracao).toEqual({
      de: 1,
      para: 5,
      nome: 'Conexão',
      niveisAvancados: 4,
    });
    await confirmar('saltador', 5).expect(200);
    expect((await resumo('saltador')).celebracao).toBeNull();
  });

  it('confirmações duplicadas e simultâneas: uma linha, nível certo', async () => {
    await ajustar('concorrente', 20, 'conc'); // 140 → 160: nível 3
    expect((await resumo('concorrente')).celebracao?.para).toBe(3);
    const respostas = await Promise.all(
      Array.from({ length: 15 }, () => confirmar('concorrente', 3)),
    );
    for (const r of respostas) {
      expect(r.status).toBe(200);
      expect(r.body.nivelCelebrado).toBe(3);
    }
    const [{ n }] = (await ds.query(
      `SELECT count(*)::int AS n FROM gamificacao.celebracoes_nivel WHERE usuario_id = $1`,
      [ids.concorrente],
    )) as Array<{ n: number }>;
    expect(n).toBe(1);
  });

  it('coletas e confirmação ao mesmo tempo: nunca celebra acima do XP real', async () => {
    // concorrente: 160 XP (nível 3). Duas coletas (+50 +30 = 240) e a
    // confirmação de um nível ainda não alcançado, tudo junto.
    await Promise.all([
      coletar('concorrente', 'ICEI', 'P34'),
      coletar('concorrente', 'Biblioteca', 'P26'),
      confirmar('concorrente', 4),
      confirmar('concorrente', 4),
    ]);
    await semCelebracaoAcimaDoReal();
    const r = await resumo('concorrente');
    expect(r.xpAcumulado).toBe(240);
    expect(r.nivel.numero).toBe(3);
    expect(r.celebracao).toBeNull();
  });

  it('XP reduzido por correção e recuperado: sem celebração repetida', async () => {
    await ajustar('veterano', -200, 'correcao'); // 600 → 400: nível 4
    expect((await resumo('veterano')).celebracao).toBeNull();
    await ajustar('veterano', 200, 'recupera'); // volta ao 5
    expect((await resumo('veterano')).celebracao).toBeNull();
    expect((await celebrados())[ids.veterano]).toBe(5);
  });

  it('usuário sem carteira: nível 1, sem celebração, confirmar não passa do 1', async () => {
    expect((await resumo('novato')).celebracao).toBeNull();
    expect((await confirmar('novato', 3).expect(200)).body.nivelCelebrado).toBe(
      1,
    );
    expect((await resumo('novato')).xpAcumulado).toBe(0);
  });

  it('corpo inválido: 400, nada gravado', async () => {
    const antes = await celebrados();
    for (const corpo of [{}, { nivel: 0 }, { nivel: 'x' }, { nivel: 2.5 }, { nivel: 2, xp: 10 }])
      await http()
        .post('/me/xp/celebracoes')
        .set('Authorization', token('limite'))
        .send(corpo)
        .expect(400);
    await http().post('/me/xp/celebracoes').send({ nivel: 2 }).expect(401);
    expect(await celebrados()).toEqual(antes);
  });

  it('ledger e carteiras continuam coerentes e o nível vem só do XP', async () => {
    const [{ n }] = (await ds.query(
      `SELECT count(*)::int AS n FROM gamificacao.xp_carteiras c WHERE ` +
        `c.saldo <> (SELECT sum(quantidade) FROM gamificacao.xp_movimentacoes m WHERE m.usuario_id = c.usuario_id) OR ` +
        `c.xp_acumulado <> (SELECT sum(COALESCE(xp_quantidade, CASE WHEN tipo = 'RECOMPENSA' THEN 0 ELSE quantidade END)) FROM gamificacao.xp_movimentacoes m WHERE m.usuario_id = c.usuario_id)`,
    )) as Array<{ n: number }>;
    expect(n).toBe(0);
    for (const conta of Object.keys(CONTAS) as Conta[]) {
      const r = await resumo(conta);
      expect(r.nivel).toEqual(nivelDe(r.xpAcumulado));
    }
    await semCelebracaoAcimaDoReal();
  });

  it('down e up (plano de recuperação): XP intacto, API segue funcionando', async () => {
    const foto = await fotografia();
    await migrar('down');
    expect(await fotografia()).toBe(foto);
    const [{ existe }] = (await ds.query(
      `SELECT to_regclass('gamificacao.celebracoes_nivel') IS NOT NULL AS existe`,
    )) as Array<{ existe: boolean }>;
    expect(existe).toBe(false);
    expect((await resumo('veterano')).celebracao).toBeNull();
    await confirmar('veterano', 5).expect(503);

    await migrar('up');
    expect(await fotografia()).toBe(foto);
    // Backfill de novo: ninguém recebe animação por causa da reaplicação.
    for (const conta of Object.keys(CONTAS) as Conta[])
      expect((await resumo(conta)).celebracao).toBeNull();
    await semCelebracaoAcimaDoReal();
  });

  it('migration roda inteira numa transação: se falhar, nada fica para trás', async () => {
    await migrar('down');
    // Simula falha no meio (tabela já existente bloqueia o CREATE).
    await ds.query(
      `CREATE TABLE gamificacao.celebracoes_nivel (usuario_id integer)`,
    );
    await expect(migrar('up')).rejects.toThrow();
    const [{ colunas }] = (await ds.query(
      `SELECT count(*)::int AS colunas FROM information_schema.columns WHERE table_schema = 'gamificacao' AND table_name = 'celebracoes_nivel'`,
    )) as Array<{ colunas: number }>;
    expect(colunas).toBe(1); // a tabela de teste, intacta; nada parcial
    await ds.query(`DROP TABLE gamificacao.celebracoes_nivel`);
    await migrar('up');
  });
});
