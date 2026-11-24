/**
 * Missões e notificações contra PostgreSQL REAL. Pulado sem MAPA_TEST_DB_URL;
 * mesmo procedimento de test/pucstops-xp.integration.spec.ts (banco
 * `missoes_api`, apagado ao fim).
 *
 * Cobre o que os specs com banco simulado não alcançam: migrations, índices
 * únicos parciais, `ON CONFLICT`, gatilhos de só inserção, paginação do sino
 * e o uso do pool quando vários alunos sobem de nível ao mesmo tempo.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource, type MigrationInterface } from 'typeorm';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { MissoesAdminController } from '../src/gamificacao/missoes/missoes-admin.controller.js';
import { MissoesAdminService } from '../src/gamificacao/missoes/missoes-admin.service.js';
import { MissoesController } from '../src/gamificacao/missoes/missoes.controller.js';
import { MissoesService } from '../src/gamificacao/missoes/missoes.service.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { GamificacaoNiveisMoedasCiclos1794000000000 } from '../src/migrations/1794000000000-GamificacaoNiveisMoedasCiclos.js';
import { CriaMissoes1794700000000 } from '../src/migrations/1794700000000-CriaMissoes.js';
import { CriaNotificacoes1794800000000 } from '../src/migrations/1794800000000-CriaNotificacoes.js';
import { ConclusoesMissaoSemTruncate1794900000000 } from '../src/migrations/1794900000000-ConclusoesMissaoSemTruncate.js';
import { NotificacoesController } from '../src/notificacoes/notificacoes.controller.js';
import { NotificacoesService } from '../src/notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { permissoesPeloToken } from './helpers/permissoes.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-de-teste-missoes';
const BANCO = 'missoes_api';
const CICLO = ParticipacoesService.programaAtual();
/** Pool pequeno de propósito: menor que o número de requisições simultâneas. */
const POOL = 3;
const SIMULTANEOS = 8;
const MIGRATIONS: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
  GamificacaoNiveisMoedasCiclos1794000000000,
  CriaMissoes1794700000000,
  CriaNotificacoes1794800000000,
  ConclusoesMissaoSemTruncate1794900000000,
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

describe.skipIf(!URL_TESTE)('Missões e notificações com banco real', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  const http = () => request(app.getHttpServer());
  const alunos: Array<{ id: number; email: string }> = [];

  const aluno = (i: number) =>
    `Bearer ${jwt.sign({ sub: String(alunos[i].id), email: alunos[i].email, perfil: 'apadrinhado', escopo: 'acesso' })}`;
  const coord = () =>
    `Bearer ${jwt.sign({ sub: '999', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;

  async function criarMissao(corpo: object): Promise<string> {
    const r = await http()
      .post('/coordenacao/missoes')
      .set('Authorization', coord())
      .send({ descricao: 'Faça a atividade.', ativar: true, ...corpo })
      .expect(201);
    return r.body.id as string;
  }

  const concluir = (i: number, missaoId: string) =>
    http()
      .post(`/me/missoes/${missaoId}/concluir`)
      .set('Authorization', aluno(i))
      .timeout(10_000);

  async function contar(sql: string, params: unknown[] = []): Promise<number> {
    const [{ n }] = (await ds.query(sql, params)) as Array<{ n: number }>;
    return Number(n);
  }

  beforeAll(async () => {
    await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${BANCO}`);
    ds = new DataSource({
      type: 'postgres',
      url: urlDo(BANCO),
      schema: 'feed',
      migrations: MIGRATIONS,
      migrationsTableName: 'migrations',
      installExtensions: false,
      extra: { max: POOL },
    });
    await ds.initialize();
    await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
    await ds.runMigrations({ transaction: 'all' });

    for (let i = 0; i < SIMULTANEOS + 6; i++) {
      const email = `aluno${i}@pucminas.edu.br`;
      const [{ id }] = (await ds.query(
        `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
          `VALUES ($1, $2, 'Engenharia de Software', 3, 'apadrinhado', 'aprovado') RETURNING id`,
        [`Aluno ${i}`, email],
      )) as Array<{ id: number }>;
      alunos.push({ id, email });
    }

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [
        MissoesController,
        MissoesAdminController,
        NotificacoesController,
      ],
      providers: [
        MissoesService,
        MissoesAdminService,
        NotificacoesService,
        JwtAuthGuard,
        RolesGuard,
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
    if (URL_TESTE) await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
  });

  describe('criação de missão', () => {
    it('sem o ciclo aberto em Programas: 400', async () => {
      await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({
          titulo: 'Antes do ciclo',
          descricao: 'x',
          tipo: 'UNICA',
          xp: 10,
        })
        .expect(400);
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ($1, $2, 'andamento')`,
        [CICLO, `Programa ${CICLO}`],
      );
    });

    it('aluno não acessa a rota da coordenação', async () => {
      await http()
        .get('/coordenacao/missoes')
        .set('Authorization', aluno(0))
        .expect(403);
    });
  });

  describe('conclusão', () => {
    it('credita pelo ledger e a segunda vez responde 409', async () => {
      const id = await criarMissao({
        titulo: 'Visite a biblioteca',
        tipo: 'UNICA',
        xp: 30,
      });
      const r = await concluir(0, id).expect(201);
      expect(r.body).toMatchObject({
        xp: 30,
        moedas: 30,
        limitado: false,
        saldoMoedas: 30,
      });
      const repetida = await concluir(0, id).expect(409);
      expect(repetida.body.motivo).toBe('ja-concluida');
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1 AND tipo = 'MISSAO'`,
          [alunos[0].id],
        ),
      ).toBe(1);
    });

    it('cliques simultâneos do mesmo aluno: um crédito só', async () => {
      const id = await criarMissao({
        titulo: 'Clique duplo',
        tipo: 'UNICA',
        xp: 20,
      });
      const respostas = await Promise.all(
        Array.from({ length: 5 }, () => concluir(1, id)),
      );
      const status = respostas.map((r) => r.status).sort();
      expect(status).toEqual([201, 409, 409, 409, 409]);
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE usuario_id = $1 AND missao_id = $2`,
          [alunos[1].id, id],
        ),
      ).toBe(1);
    });

    it('teto semanal corta a segunda missão semanal', async () => {
      const a = await criarMissao({
        titulo: 'Semanal A',
        tipo: 'SEMANAL',
        xp: 40,
      });
      const b = await criarMissao({
        titulo: 'Semanal B',
        tipo: 'SEMANAL',
        xp: 40,
      });
      await concluir(2, a).expect(201);
      const r = await concluir(2, b).expect(201);
      expect(r.body).toMatchObject({ xp: 20, limitado: true, teto: 'semanal' });
    });

    it('conclusões não podem ser apagadas, nem com TRUNCATE', async () => {
      await expect(
        ds.query('DELETE FROM gamificacao.missoes_conclusoes'),
      ).rejects.toThrow();
      await expect(
        ds.query('TRUNCATE gamificacao.missoes_conclusoes'),
      ).rejects.toThrow();
    });
  });

  describe('subida de nível', () => {
    it(`${SIMULTANEOS} alunos sobem de nível ao mesmo tempo com pool de ${POOL}: ninguém trava`, async () => {
      const id = await criarMissao({
        titulo: 'Sobe de nível',
        tipo: 'UNICA',
        xp: 60,
      });
      const inicio = 4;
      const respostas = await Promise.all(
        Array.from({ length: SIMULTANEOS }, (_, k) => concluir(inicio + k, id)),
      );
      for (const r of respostas) {
        expect(r.status).toBe(201);
        expect(r.body.subiuDeNivel).toBe(true);
      }
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE tipo = 'NIVEL_SUBIU' AND usuario_id = ANY($1)`,
          [alunos.slice(inicio, inicio + SIMULTANEOS).map((a) => a.id)],
        ),
      ).toBe(SIMULTANEOS);
    }, 30_000);
  });

  describe('sino', () => {
    async function inserirNotificacoes(usuarioId: number, n: number) {
      for (let i = 0; i < n; i++) {
        await ds.query(
          `INSERT INTO feed.notificacoes (usuario_id, tipo, titulo, mensagem, chave, criado_em) ` +
            `VALUES ($1, 'NIVEL_SUBIU', $2, 'teste', $3, now() - make_interval(mins => $4))`,
          [usuarioId, `Aviso ${i}`, `teste:${i}`, n - i],
        );
      }
    }

    it('cria o aviso das missões visíveis só uma vez', async () => {
      const lista = async () =>
        (
          await http()
            .get('/me/notificacoes?limite=50')
            .set('Authorization', aluno(3))
            .expect(200)
        ).body as { itens: Array<{ tipo: string }> };
      const primeira = await lista();
      const missoes = primeira.itens.filter(
        (n) => n.tipo === 'MISSAO_NOVA',
      ).length;
      expect(missoes).toBeGreaterThan(0);
      const segunda = await lista();
      expect(segunda.itens.filter((n) => n.tipo === 'MISSAO_NOVA').length).toBe(
        missoes,
      );
    });

    it('pagina por `antes` sem perder nem repetir notificação', async () => {
      const usuario = alunos[alunos.length - 1];
      await inserirNotificacoes(usuario.id, 25);
      const auth = `Bearer ${jwt.sign({ sub: String(usuario.id), email: usuario.email, perfil: 'coordenador', escopo: 'acesso' })}`;
      const p1 = (
        await http()
          .get('/me/notificacoes?limite=20')
          .set('Authorization', auth)
          .expect(200)
      ).body as {
        itens: Array<{ id: string }>;
        temMais: boolean;
        naoLidas: number;
      };
      expect(p1.itens).toHaveLength(20);
      expect(p1.temMais).toBe(true);
      expect(p1.naoLidas).toBe(25);
      const p2 = (
        await http()
          .get(`/me/notificacoes?limite=20&antes=${p1.itens.at(-1)!.id}`)
          .set('Authorization', auth)
          .expect(200)
      ).body as { itens: Array<{ id: string }>; temMais: boolean };
      expect(p2.itens).toHaveLength(5);
      expect(p2.temMais).toBe(false);
      const ids = new Set([...p1.itens, ...p2.itens].map((n) => n.id));
      expect(ids.size).toBe(25);

      // `antes` de outro usuário não vaza nada.
      await http()
        .get(`/me/notificacoes?antes=${p1.itens[0].id}`)
        .set('Authorization', aluno(0))
        .expect(404);
    });

    it('"marcar todas" com ateId deixa não lido o que chegou depois', async () => {
      const usuario = alunos[alunos.length - 2];
      await inserirNotificacoes(usuario.id, 3);
      const auth = `Bearer ${jwt.sign({ sub: String(usuario.id), email: usuario.email, perfil: 'coordenador', escopo: 'acesso' })}`;
      const vistas = (
        await http()
          .get('/me/notificacoes')
          .set('Authorization', auth)
          .expect(200)
      ).body as { itens: Array<{ id: string }> };
      // Chega um aviso depois da última leitura.
      await ds.query(
        `INSERT INTO feed.notificacoes (usuario_id, tipo, titulo, mensagem, chave) VALUES ($1, 'NIVEL_SUBIU', 'Novo', 'novo', 'teste:novo')`,
        [usuario.id],
      );
      const r = await http()
        .patch('/me/notificacoes/lidas')
        .set('Authorization', auth)
        .send({ ateId: vistas.itens[0].id })
        .expect(200);
      expect(r.body).toEqual({ atualizadas: 3, naoLidas: 1 });

      // `ateId` de outro usuário: 404, e nada muda.
      await http()
        .patch('/me/notificacoes/lidas')
        .set('Authorization', aluno(0))
        .send({ ateId: vistas.itens[0].id })
        .expect(404);
      // Sem corpo, continua marcando todas (compatível com clientes antigos).
      const todas = await http()
        .patch('/me/notificacoes/lidas')
        .set('Authorization', auth)
        .expect(200);
      expect(todas.body).toEqual({ atualizadas: 1, naoLidas: 0 });
    });
  });

  describe('migrations', () => {
    it('rollback das notificações é recusado quando há dados', async () => {
      const qr = ds.createQueryRunner();
      try {
        await expect(
          new CriaNotificacoes1794800000000().down(qr),
        ).rejects.toThrow(/Rollback recusado/);
      } finally {
        await qr.release();
      }
      expect(
        await contar(`SELECT count(*) AS n FROM feed.notificacoes`),
      ).toBeGreaterThan(0);
    });
  });
});
