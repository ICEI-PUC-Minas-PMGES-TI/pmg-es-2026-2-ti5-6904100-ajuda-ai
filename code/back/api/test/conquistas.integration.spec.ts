/// <reference types="vite/client" />
/**
 * Conquistas (F32) contra PostgreSQL/PostGIS REAL: todas as migrations do
 * projeto, rotas HTTP com o ValidationPipe do main.ts, ledger de XP e
 * notificações de verdade. Pulado sem MAPA_TEST_DB_URL (banco
 * `conquistas_api`, apagado ao fim):
 *
 *   MAPA_TEST_DB_URL=postgres://postgres:postgres@localhost:55432/postgres \
 *     npx vitest run test/conquistas.integration.spec.ts
 */
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import {
  DataSource,
  getMetadataArgsStorage,
  type MigrationInterface,
} from 'typeorm';
import type { AccessTokenPayload } from '../src/auth/authenticated-request.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import {
  ConquistasAdminController,
  ConquistasController,
} from '../src/gamificacao/conquistas/conquistas.controller.js';
import { ConquistasAdminService } from '../src/gamificacao/conquistas/conquistas-admin.service.js';
import { ConquistasService } from '../src/gamificacao/conquistas/conquistas.service.js';
import { LIMITES } from '../src/gamificacao/economia.js';
import { registrarMovimentacao } from '../src/gamificacao/gamificacao.js';
import { XpController } from '../src/gamificacao/xp/xp.controller.js';
import { XpService } from '../src/gamificacao/xp/xp.service.js';
import { NotificacoesService } from '../src/notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../src/participacoes/permissoes-aluno.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import { permissoesPeloToken } from './helpers/permissoes.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-de-teste-conquistas';
const BANCO = 'conquistas_api';
const CICLO = ParticipacoesService.programaAtual();
const [ANO, SEMESTRE] = CICLO.split('/').map(Number);
const CICLO_ANTERIOR = SEMESTRE === 1 ? `${ANO - 1}/2` : `${ANO}/1`;

const MIGRATIONS = Object.entries(
  // Sem os .spec.ts: importados aqui, os testes deles rodariam junto.
  import.meta.glob<Record<string, unknown>>(
    ['../src/migrations/*.ts', '!../src/migrations/*.spec.ts'],
    { eager: true },
  ),
)
  .flatMap(([, modulo]) =>
    Object.values(modulo).filter(
      (v): v is new () => MigrationInterface =>
        typeof v === 'function' && /\d{13}$/.test(v.name),
    ),
  )
  .sort((a, b) => Number(a.name.slice(-13)) - Number(b.name.slice(-13)));

/** Entidades reais, para as permissões de verdade (participação e ciclo). */
const ENTIDADES = Object.values(
  import.meta.glob<Record<string, unknown>>('../src/**/*.entity.ts', {
    eager: true,
  }),
)
  .flatMap((modulo) => Object.values(modulo))
  .filter((v): v is Function =>
    getMetadataArgsStorage().tables.some((t) => t.target === v),
  );

async function admin(sql: string): Promise<void> {
  const c = new pg.Client({ connectionString: URL_TESTE });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

interface Conquista {
  id: string;
  nome: string;
  criterio: string;
  criterioTexto: string;
  meta: number;
  publico: string;
  programaCodigo: string | null;
  xp: number;
  estado: string;
  desbloqueios: number;
  podeExcluir: boolean;
  atualizadoEm: string;
}

interface Colecao {
  ciclo: string;
  obtidas: Array<{
    id: string;
    contexto: string;
    xpCreditado: number;
    arquivada: boolean;
    criterioTexto: string;
  }>;
  disponiveis: Array<{
    id: string;
    criterioTexto: string;
    progresso: { atual: number; meta: number };
  }>;
  novas: Array<{ id: string; contexto: string }>;
}

const idsNovas = (v: Colecao) => v.novas.map((n) => n.id);

describe.skipIf(!URL_TESTE)('Conquistas (F32) com banco real', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  let servico: ConquistasService;
  let permissoesAluno: PermissoesAlunoService;
  const ids = {
    apadrinhado: 0,
    padrinho: 0,
    outro: 0,
    feed: 0,
    sino: 0,
    semestres: 0,
    cascata: 0,
    virada: 0,
    aviso: 0,
    encerra: 0,
  };
  const http = () => request(app.getHttpServer());

  const coord = () =>
    `Bearer ${jwt.sign({ sub: '3', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;
  const token = (quem: keyof typeof ids, perfil: string) =>
    `Bearer ${jwt.sign({ sub: String(ids[quem]), email: `${quem}@pucminas.edu.br`, perfil, escopo: 'acesso' })}`;
  const apadrinhado = () => token('apadrinhado', 'apadrinhado');
  const padrinho = () => token('padrinho', 'padrinho');
  const outro = () => token('outro', 'apadrinhado');

  const criar = (corpo: object) =>
    http()
      .post('/coordenacao/conquistas')
      .set('Authorization', coord())
      .send(corpo);
  const nova = async (corpo: object = {}) =>
    (
      await criar({
        nome: `Conquista ${randomUUID().slice(0, 8)}`,
        descricao: 'Reconhece quem participa.',
        criterio: 'MISSOES_CONCLUIDAS',
        meta: 2,
        publicar: true,
        ...corpo,
      }).expect(201)
    ).body as Conquista;
  const detalhe = async (id: string) =>
    (
      await http()
        .get(`/coordenacao/conquistas/${id}`)
        .set('Authorization', coord())
        .expect(200)
    ).body as Conquista;
  const confirmar = (
    auth: string,
    vistas: Array<{ id: string; contexto: string }>,
  ) =>
    http()
      .post('/me/conquistas/vistas')
      .set('Authorization', auth)
      .send({ vistas });
  const colecao = async (auth: string) =>
    (await http().get('/me/conquistas').set('Authorization', auth).expect(200))
      .body as Colecao;

  /** Missão real do ciclo e `n` conclusões do aluno (como `concluir()` grava). */
  async function concluirMissoes(usuarioId: number, n: number, ciclo = CICLO) {
    for (let i = 0; i < n; i++) {
      const [{ id }] = (await ds.query(
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo) VALUES ($1, 'desc', 'UNICA', 10, $2) RETURNING id`,
        [`Missão ${randomUUID().slice(0, 6)}`, ciclo],
      )) as Array<{ id: string }>;
      await ds.query(
        `INSERT INTO gamificacao.missoes_conclusoes (missao_id, usuario_id, ciclo, xp_configurado, xp_creditado) VALUES ($1, $2, $3, 10, 0)`,
        [id, usuarioId, ciclo],
      );
    }
  }

  async function creditarXp(usuarioId: number, xp: number) {
    await ds.transaction(async (m) => {
      await registrarMovimentacao(m.queryRunner!, {
        usuarioId,
        quantidade: xp,
        tipo: 'MISSAO',
        ciclo: CICLO,
        referenciaTipo: null,
        referenciaId: null,
        descricao: 'crédito de teste',
        chaveIdempotencia: `teste-${randomUUID()}`,
      });
    });
  }

  const desbloqueios = async (conquistaId: string, usuarioId: number) =>
    (
      (await ds.query(
        `SELECT count(*)::int AS n FROM gamificacao.conquistas_desbloqueios WHERE conquista_id = $1 AND usuario_id = $2`,
        [conquistaId, usuarioId],
      )) as Array<{ n: number }>
    )[0].n;

  beforeAll(async () => {
    await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${BANCO}`);
    const url = new URL(URL_TESTE!);
    url.pathname = `/${BANCO}`;
    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      schema: 'feed',
      migrations: MIGRATIONS,
      migrationsTableName: 'migrations',
      installExtensions: false,
    });
    await ds.initialize();
    await ds.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
    await ds.runMigrations({ transaction: 'all' });
    for (const quem of Object.keys(ids) as Array<keyof typeof ids>) {
      ids[quem] = (
        (await ds.query(
          `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
            `VALUES ($1, $2, 'Engenharia de Software', 3, 'apadrinhado', 'aprovado') RETURNING id`,
          [quem, `${quem}@pucminas.edu.br`],
        )) as Array<{ id: number }>
      )[0].id;
    }
    for (const codigo of [CICLO, CICLO_ANTERIOR]) {
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ($1, $2, 'andamento')`,
        [codigo, `Programa ${codigo}`],
      );
    }

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [
        ConquistasAdminController,
        ConquistasController,
        XpController,
      ],
      providers: [
        ConquistasAdminService,
        ConquistasService,
        NotificacoesService,
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
    servico = modulo.get(ConquistasService);
    permissoesAluno = modulo.get(PermissoesAlunoService);
  });

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
    if (URL_TESTE) await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
  });

  describe('cadastro pela coordenação', () => {
    it('cria em rascunho, lista, consulta e informa os critérios suportados', async () => {
      const { body } = await criar({
        nome: '  Explorador  ',
        descricao: 'Coletou totens pelo campus.',
        imagemUrl: 'https://exemplo.com/medalha.png',
        criterio: 'PUCSTOPS_COLETADOS',
        meta: 3,
      }).expect(201);
      const c = body as Conquista;
      expect(c).toMatchObject({
        nome: 'Explorador',
        estado: 'rascunho',
        publico: 'TODOS',
        programaCodigo: null,
        xp: 0,
        desbloqueios: 0,
        podeExcluir: true,
        criterioTexto: 'Coletar 3 PucStops no semestre.',
      });
      const rascunhos = (
        await http()
          .get('/coordenacao/conquistas?estado=rascunho')
          .set('Authorization', coord())
          .expect(200)
      ).body as Conquista[];
      expect(rascunhos.map((r) => r.id)).toContain(c.id);
      expect((await detalhe(c.id)).nome).toBe('Explorador');
      const criterios = (
        await http()
          .get('/coordenacao/conquistas/criterios')
          .set('Authorization', coord())
          .expect(200)
      ).body as Array<{ criterio: string; metaMin: number; metaMax: number }>;
      expect(criterios.map((x) => x.criterio)).toEqual([
        'MISSOES_CONCLUIDAS',
        'PUCSTOPS_COLETADOS',
        'FEED_PUBLICACOES',
        'FEED_COMENTARIOS',
        'NIVEL_ALCANCADO',
      ]);
    });

    it('aluno não administra conquistas (403)', async () => {
      await http()
        .get('/coordenacao/conquistas')
        .set('Authorization', apadrinhado())
        .expect(403);
    });

    it.each([
      ['critério inexistente', { criterio: 'LOGIN_DIARIO', meta: 1 }],
      ['meta acima da faixa', { criterio: 'MISSOES_CONCLUIDAS', meta: 51 }],
      ['nível 1 (todos já têm)', { criterio: 'NIVEL_ALCANCADO', meta: 1 }],
      ['nível acima do máximo', { criterio: 'NIVEL_ALCANCADO', meta: 11 }],
      [
        'apadrinhado não publica no feed',
        { criterio: 'FEED_PUBLICACOES', meta: 1, publico: 'APADRINHADOS' },
      ],
      [
        'XP acima do teto',
        {
          criterio: 'MISSOES_CONCLUIDAS',
          meta: 1,
          xp: LIMITES.porConquista + 1,
        },
      ],
      [
        'programa inexistente',
        { criterio: 'MISSOES_CONCLUIDAS', meta: 1, programaCodigo: '1999/1' },
      ],
      [
        'imagem sem https',
        {
          criterio: 'MISSOES_CONCLUIDAS',
          meta: 1,
          imagemUrl: 'http://x.com/a.png',
        },
      ],
    ])('recusa %s (400)', async (_, regra) => {
      await criar({ nome: 'Inválida', descricao: 'x', ...regra }).expect(400);
    });

    it('publicada: critério, meta, público, programa e XP ficam congelados; nome muda', async () => {
      const c = await nova({ meta: 5 });
      expect(c.estado).toBe('publicada');
      const congelado = await http()
        .patch(`/coordenacao/conquistas/${c.id}`)
        .set('Authorization', coord())
        .send({ atualizadoEm: c.atualizadoEm, meta: 3, xp: 10 })
        .expect(409);
      expect(congelado.body).toMatchObject({
        motivo: 'conquista-publicada',
        campos: ['meta', 'xp'],
      });
      const editada = (
        await http()
          .patch(`/coordenacao/conquistas/${c.id}`)
          .set('Authorization', coord())
          .send({ atualizadoEm: c.atualizadoEm, nome: 'Novo nome' })
          .expect(200)
      ).body as Conquista;
      expect(editada).toMatchObject({ nome: 'Novo nome', meta: 5 });
      // Tela desatualizada (atualizadoEm antigo): 409, sem sobrescrever.
      const velha = await http()
        .patch(`/coordenacao/conquistas/${c.id}`)
        .set('Authorization', coord())
        .send({ atualizadoEm: c.atualizadoEm, nome: 'Por cima' })
        .expect(409);
      expect(velha.body).toMatchObject({ motivo: 'conquista-alterada' });
    });

    it('rascunho edita tudo, mas a regra continua validada', async () => {
      const r = (
        await criar({
          nome: 'R',
          descricao: 'd',
          criterio: 'MISSOES_CONCLUIDAS',
          meta: 2,
        }).expect(201)
      ).body as Conquista;
      await http()
        .patch(`/coordenacao/conquistas/${r.id}`)
        .set('Authorization', coord())
        .send({ atualizadoEm: r.atualizadoEm, criterio: 'NIVEL_ALCANCADO' })
        // meta 2 vale para nível: aceita.
        .expect(200);
      const atual = await detalhe(r.id);
      await http()
        .patch(`/coordenacao/conquistas/${r.id}`)
        .set('Authorization', coord())
        .send({ atualizadoEm: atual.atualizadoEm, meta: 20 })
        .expect(400);
    });
  });

  describe('desbloqueio e coleção do aluno', () => {
    it('mostra o critério e o progresso; só desbloqueia com a meta cumprida, uma vez', async () => {
      const c = await nova({ meta: 2 });
      let vista = await colecao(apadrinhado());
      expect(vista.disponiveis.find((d) => d.id === c.id)).toMatchObject({
        criterioTexto: 'Concluir 2 missões no semestre.',
        progresso: { atual: 0, meta: 2 },
      });
      expect(vista.obtidas.map((o) => o.id)).not.toContain(c.id);

      await concluirMissoes(ids.apadrinhado, 1);
      vista = await colecao(apadrinhado());
      expect(vista.disponiveis.find((d) => d.id === c.id)?.progresso).toEqual({
        atual: 1,
        meta: 2,
      });
      expect(await desbloqueios(c.id, ids.apadrinhado)).toBe(0);

      await concluirMissoes(ids.apadrinhado, 1);
      vista = await colecao(apadrinhado());
      expect(idsNovas(vista)).toContain(c.id);
      expect(vista.obtidas.find((o) => o.id === c.id)).toMatchObject({
        contexto: CICLO,
        xpCreditado: 0,
        arquivada: false,
      });
      expect(vista.disponiveis.map((d) => d.id)).not.toContain(c.id);

      // A tela exibiu o aviso e confirmou.
      await confirmar(apadrinhado(), [{ id: c.id, contexto: CICLO }]).expect(
        200,
      );
      // Consultas seguintes (inclusive simultâneas) não desbloqueiam de novo.
      const repetidas = await Promise.all(
        Array.from({ length: 5 }, () => colecao(apadrinhado())),
      );
      expect(repetidas.every((r) => !idsNovas(r).includes(c.id))).toBe(true);
      expect(await desbloqueios(c.id, ids.apadrinhado)).toBe(1);

      const avisos = (await ds.query(
        `SELECT titulo, link FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = 'CONQUISTA_DESBLOQUEADA' AND chave = $2`,
        [ids.apadrinhado, `conquista:${c.id}:${CICLO}`],
      )) as Array<{ titulo: string; link: string }>;
      expect(avisos).toEqual([
        { titulo: 'Conquista desbloqueada!', link: '/conquistas' },
      ]);
    });

    it('rascunho nunca desbloqueia', async () => {
      const r = (
        await criar({
          nome: 'Rascunho',
          descricao: 'd',
          criterio: 'MISSOES_CONCLUIDAS',
          meta: 1,
        }).expect(201)
      ).body as Conquista;
      await concluirMissoes(ids.outro, 1);
      const vista = await colecao(outro());
      expect(vista.disponiveis.map((d) => d.id)).not.toContain(r.id);
      expect(await desbloqueios(r.id, ids.outro)).toBe(0);
    });

    it('XP só pela regra explícita, uma vez, como CONQUISTA e sem tocar no crédito da missão', async () => {
      const c = await nova({ meta: 1, xp: 20 });
      await concluirMissoes(ids.padrinho, 1);
      const movimentosMissaoAntes = (
        (await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1 AND tipo = 'MISSAO'`,
          [ids.padrinho],
        )) as Array<{ n: number }>
      )[0].n;
      await Promise.all(Array.from({ length: 4 }, () => colecao(padrinho())));
      const creditos = (await ds.query(
        `SELECT tipo, xp_quantidade, quantidade, chave_idempotencia FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1 AND referencia_id = $2`,
        [ids.padrinho, c.id],
      )) as Array<{
        tipo: string;
        xp_quantidade: number;
        quantidade: number;
        chave_idempotencia: string;
      }>;
      expect(creditos).toEqual([
        {
          tipo: 'CONQUISTA',
          xp_quantidade: 20,
          quantidade: 20,
          chave_idempotencia: `conquista:${c.id}:${ids.padrinho}:${CICLO}`,
        },
      ]);
      const movimentosMissaoDepois = (
        (await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1 AND tipo = 'MISSAO'`,
          [ids.padrinho],
        )) as Array<{ n: number }>
      )[0].n;
      expect(movimentosMissaoDepois).toBe(movimentosMissaoAntes);
      const obtida = (await colecao(padrinho())).obtidas.find(
        (o) => o.id === c.id,
      );
      expect(obtida?.xpCreditado).toBe(20);
    });

    it('arquivar preserva quem já obteve; com uso não exclui; sem uso exclui', async () => {
      const c = await nova({ meta: 1 });
      await concluirMissoes(ids.outro, 1);
      expect(idsNovas(await colecao(outro()))).toContain(c.id);
      await http()
        .post(`/coordenacao/conquistas/${c.id}/arquivar`)
        .set('Authorization', coord())
        .expect(200);
      const vista = await colecao(outro());
      expect(vista.obtidas.find((o) => o.id === c.id)).toMatchObject({
        arquivada: true,
      });
      expect(vista.disponiveis.map((d) => d.id)).not.toContain(c.id);
      const usada = await http()
        .delete(`/coordenacao/conquistas/${c.id}`)
        .set('Authorization', coord())
        .expect(409);
      expect(usada.body).toMatchObject({ motivo: 'conquista-em-uso' });
      expect((await detalhe(c.id)).podeExcluir).toBe(false);

      const semUso = await nova({ meta: 50 });
      await http()
        .delete(`/coordenacao/conquistas/${semUso.id}`)
        .set('Authorization', coord())
        .expect(204);
      await http()
        .get(`/coordenacao/conquistas/${semUso.id}`)
        .set('Authorization', coord())
        .expect(404);
    });

    it('respeita o público e o programa', async () => {
      const soPadrinhos = await nova({ meta: 1, publico: 'PADRINHOS' });
      const outroCiclo = await nova({
        meta: 1,
        programaCodigo: CICLO_ANTERIOR,
      });
      const desteCiclo = await nova({ meta: 1, programaCodigo: CICLO });
      await concluirMissoes(ids.apadrinhado, 1);
      const vista = await colecao(apadrinhado());
      const vistos = [...vista.disponiveis, ...vista.obtidas].map((x) => x.id);
      expect(vistos).not.toContain(soPadrinhos.id);
      expect(vistos).not.toContain(outroCiclo.id);
      expect(vista.obtidas.map((o) => o.id)).toContain(desteCiclo.id);
      expect(await desbloqueios(soPadrinhos.id, ids.apadrinhado)).toBe(0);
      expect((await colecao(padrinho())).obtidas.map((o) => o.id)).toContain(
        soPadrinhos.id,
      );
    });

    it('missões de outro semestre não contam no progresso do ciclo', async () => {
      const c = await nova({ meta: 40 });
      const antes = (await colecao(outro())).disponiveis.find(
        (d) => d.id === c.id,
      )!.progresso.atual;
      await concluirMissoes(ids.outro, 3, CICLO_ANTERIOR);
      const depois = (await colecao(outro())).disponiveis.find(
        (d) => d.id === c.id,
      )!.progresso.atual;
      expect(depois).toBe(antes);
    });

    it('nível alcançado vale para a carreira (contexto GERAL) e sai também ao ler o XP', async () => {
      const c = await nova({ criterio: 'NIVEL_ALCANCADO', meta: 2 });
      expect(await desbloqueios(c.id, ids.outro)).toBe(0);
      await creditarXp(ids.outro, 60); // nível 2 começa em 50 XP
      await http().get('/me/xp').set('Authorization', outro()).expect(200);
      expect(await desbloqueios(c.id, ids.outro)).toBe(1);
      const obtida = (await colecao(outro())).obtidas.find(
        (o) => o.id === c.id,
      );
      expect(obtida).toMatchObject({
        contexto: 'GERAL',
        criterioTexto: 'Chegar ao nível 2.',
      });
    });

    it('o banco barra alteração e remoção de desbloqueios', async () => {
      await expect(
        ds.query(
          `UPDATE gamificacao.conquistas_desbloqueios SET progresso = 99`,
        ),
      ).rejects.toThrow();
      await expect(
        ds.query(`DELETE FROM gamificacao.conquistas_desbloqueios`),
      ).rejects.toThrow();
      await expect(
        ds.query(`TRUNCATE gamificacao.conquistas_desbloqueios CASCADE`),
      ).rejects.toThrow();
    });

    it('quem não participa do ciclo vê só as obtidas, sem desbloquear', async () => {
      const c = await nova({ meta: 1 });
      const exAluno = `Bearer ${jwt.sign({ sub: String(ids.outro), email: 'outro@pucminas.edu.br', perfil: 'aluno', escopo: 'acesso' })}`;
      const vista = await colecao(exAluno);
      expect(vista.disponiveis).toEqual([]);
      expect(idsNovas(vista)).not.toContain(c.id);
      expect(await desbloqueios(c.id, ids.outro)).toBe(0);
      expect(vista.obtidas.length).toBeGreaterThan(0);
    });
  });

  /** Correções da auditoria do F32: cada teste reproduz o cenário relatado. */
  describe('cenários da auditoria', () => {
    const acessoApadrinhado = {
      participante: true,
      papel: 'apadrinhado' as const,
      podePublicar: false,
    };
    const xpDe = async (usuarioId: number) =>
      (
        (await ds.query(
          `SELECT COALESCE((SELECT xp_acumulado FROM gamificacao.xp_carteiras WHERE usuario_id = $1), 0)::int AS xp`,
          [usuarioId],
        )) as Array<{ xp: number }>
      )[0].xp;
    const avisosDe = async (usuarioId: number, conquistaId: string) =>
      (
        (await ds.query(
          `SELECT count(*)::int AS n FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = 'CONQUISTA_DESBLOQUEADA' AND chave LIKE $2`,
          [usuarioId, `conquista:${conquistaId}:%`],
        )) as Array<{ n: number }>
      )[0].n;

    it('comentário no fim do semestre conta no ciclo da atividade, mesmo conferido no semestre seguinte', async () => {
      const c = await nova({ criterio: 'FEED_COMENTARIOS', meta: 1, xp: 15 });
      // Post de um colega no semestre que acabou e o comentário do aluno nele.
      const [{ id: post }] = (await ds.query(
        `INSERT INTO feed.publicacoes (autor, iniciais, descricao_autor, categoria, texto, owner_id, programa_codigo) ` +
          `VALUES ('Padrinho', 'PA', 'Padrinho do programa', 'Geral', 'Bem-vindos ao semestre!', 'padrinho@pucminas.edu.br', $1) RETURNING id`,
        [CICLO_ANTERIOR],
      )) as Array<{ id: number }>;
      await ds.query(
        `INSERT INTO feed.comentarios (publicacao_id, autor_id, texto) VALUES ($1, 'feed@pucminas.edu.br', 'Obrigado, até logo!')`,
        [post],
      );
      const aluno = token('feed', 'apadrinhado');
      // O cenário relatado: só a consulta do semestre novo não registra nada.
      await colecao(aluno);
      expect(await desbloqueios(c.id, ids.feed)).toBe(0);
      // A conferência disparada pelo feed usa o ciclo da publicação.
      const novas = await servico.aposAtividadeNoFeed(
        jwt.verify(aluno.slice(7)),
        CICLO_ANTERIOR,
      );
      expect(novas).toEqual([{ id: c.id, contexto: CICLO_ANTERIOR }]);
      const [registro] = (await ds.query(
        `SELECT d.contexto, d.xp_creditado, m.ciclo FROM gamificacao.conquistas_desbloqueios d ` +
          `JOIN gamificacao.xp_movimentacoes m ON m.id = d.movimentacao_id WHERE d.conquista_id = $1 AND d.usuario_id = $2`,
        [c.id, ids.feed],
      )) as Array<{ contexto: string; xp_creditado: number; ciclo: string }>;
      expect(registro).toEqual({
        contexto: CICLO_ANTERIOR,
        xp_creditado: 15,
        ciclo: CICLO_ANTERIOR,
      });
      // Coordenação (sem conta de aluno) não confere nada nem falha.
      await expect(
        servico.aposAtividadeNoFeed(jwt.verify(coord().slice(7)), CICLO),
      ).resolves.toEqual([]);
    });

    /** Post de um colega no `ciclo` e um comentário válido de `quem` nele. */
    async function comentarNoCiclo(quem: keyof typeof ids, ciclo: string) {
      const [{ id: post }] = (await ds.query(
        `INSERT INTO feed.publicacoes (autor, iniciais, descricao_autor, categoria, texto, owner_id, programa_codigo) ` +
          `VALUES ('Padrinho', 'PA', 'Padrinho do programa', 'Geral', 'Encontro no fim do semestre!', 'padrinho@pucminas.edu.br', $1) RETURNING id`,
        [ciclo],
      )) as Array<{ id: number }>;
      await ds.query(
        `INSERT INTO feed.comentarios (publicacao_id, autor_id, texto) VALUES ($1, $2, 'Estarei lá, obrigado!')`,
        [post, `${quem}@pucminas.edu.br`],
      );
    }

    it('virada do semestre: a elegibilidade é a do ciclo da atividade, não a do semestre novo', async () => {
      const c = await nova({ criterio: 'FEED_COMENTARIOS', meta: 1, xp: 10 });
      await comentarNoCiclo('virada', CICLO_ANTERIOR);
      // Participou do semestre que acabou; no novo, ainda não tem participação.
      const espiao = vi
        .spyOn(permissoesAluno, 'doUsuario')
        .mockImplementation(async (_usuario, _manager, programa = CICLO) =>
          PermissoesAlunoService.derivar(
            programa,
            programa === CICLO_ANTERIOR
              ? ({
                  papel: 'apadrinhado',
                  status: 'em_andamento',
                  terminoEm: null,
                } as never)
              : null,
            programa === CICLO_ANTERIOR ? 'apadrinhado_ativo' : 'nenhuma',
          ),
        );
      try {
        const novas = await servico.aposAtividadeNoFeed(
          jwt.verify(token('virada', 'apadrinhado').slice(7)),
          CICLO_ANTERIOR,
        );
        expect(novas).toContainEqual({ id: c.id, contexto: CICLO_ANTERIOR });
        expect(espiao).toHaveBeenCalledWith(
          expect.anything(),
          undefined,
          CICLO_ANTERIOR,
        );
      } finally {
        espiao.mockRestore();
      }
      expect(await desbloqueios(c.id, ids.virada)).toBe(1);
      const [{ xp }] = (await ds.query(
        `SELECT xp_creditado AS xp FROM gamificacao.conquistas_desbloqueios WHERE conquista_id = $1 AND usuario_id = $2`,
        [c.id, ids.virada],
      )) as Array<{ xp: number }>;
      expect(xp).toBe(10);
    });

    it('desbloqueio pelo feed aparece como nova ao abrir a coleção, uma vez só', async () => {
      const c = await nova({ criterio: 'FEED_COMENTARIOS', meta: 1 });
      await comentarNoCiclo('aviso', CICLO);
      const aluno = token('aviso', 'apadrinhado');
      // Como o controller do feed faz depois do commit do comentário.
      expect(
        await servico.aposAtividadeNoFeed(jwt.verify(aluno.slice(7)), CICLO),
      ).toContainEqual({ id: c.id, contexto: CICLO });
      const nova_ = { id: c.id, contexto: CICLO };
      const vista = await colecao(aluno);
      expect(vista.obtidas.map((o) => o.id)).toContain(c.id);
      expect(vista.novas).toContainEqual(nova_);
      // Resposta perdida (o cliente não exibiu nem confirmou): volta.
      expect((await colecao(aluno)).novas).toContainEqual(nova_);
      // A tela exibiu e confirmou; repetir a confirmação não falha.
      expect((await confirmar(aluno, [nova_]).expect(200)).body).toEqual({
        marcadas: 1,
      });
      expect((await confirmar(aluno, [nova_]).expect(200)).body).toEqual({
        marcadas: 0,
      });
      const [a, b] = await Promise.all([colecao(aluno), colecao(aluno)]);
      expect([...a.novas, ...b.novas].filter((n) => n.id === c.id)).toEqual([]);
      // O banco barra apagar a marca de visto (só de inserção).
      await expect(
        ds.query(`DELETE FROM gamificacao.conquistas_desbloqueios_vistos`),
      ).rejects.toThrow();
    });

    it('falha ao montar a coleção não consome o aviso "Nova!"', async () => {
      const c = await nova({ meta: 1 });
      const aluno = token('aviso', 'apadrinhado');
      await concluirMissoes(ids.aviso, 1);
      // Desbloqueia (como depois de concluir a missão) e a coleção falha.
      await servico.sincronizarComSeguranca(ids.aviso, {
        participante: true,
        papel: 'apadrinhado',
        podePublicar: false,
      });
      const falha = vi
        .spyOn(
          servico as unknown as { obtidas: () => Promise<unknown> },
          'obtidas',
        )
        .mockRejectedValueOnce(new Error('falha simulada na leitura'));
      try {
        await http()
          .get('/me/conquistas')
          .set('Authorization', aluno)
          .expect(500);
      } finally {
        falha.mockRestore();
      }
      // Nova tentativa: o aviso continua lá, até a tela confirmar.
      expect((await colecao(aluno)).novas).toContainEqual({
        id: c.id,
        contexto: CICLO,
      });
    });

    it('confirmar vistas: só os desbloqueios do próprio aluno; corpo inválido é 400', async () => {
      const c = await nova({ meta: 1 });
      await concluirMissoes(ids.encerra, 1);
      await servico.sincronizarComSeguranca(ids.encerra, {
        participante: true,
        papel: 'apadrinhado',
        podePublicar: false,
      });
      // Outro aluno tenta marcar o desbloqueio alheio: nada muda.
      expect(
        (await confirmar(outro(), [{ id: c.id, contexto: CICLO }]).expect(200))
          .body,
      ).toEqual({ marcadas: 0 });
      expect(
        idsNovas(await colecao(token('encerra', 'apadrinhado'))),
      ).toContain(c.id);
      await confirmar(outro(), [{ id: 'x', contexto: CICLO }]).expect(400);
      await confirmar(outro(), [{ id: c.id, contexto: 'qualquer' }]).expect(
        400,
      );
      await http()
        .post('/me/conquistas/vistas')
        .set('Authorization', outro())
        .send({})
        .expect(400);
    });

    it('confirmar vistas aceita lotes de até 200 (limite que web e app respeitam)', async () => {
      const lote = (n: number) =>
        Array.from({ length: n }, () => ({
          id: randomUUID(),
          contexto: CICLO,
        }));
      expect((await confirmar(outro(), lote(200)).expect(200)).body).toEqual({
        marcadas: 0,
      });
      await confirmar(outro(), lote(201)).expect(400);
    });

    it('encerramento real do ciclo entre o comentário e a conferência não tira a conquista', async () => {
      // Permissões de verdade: participação e etapa do ciclo lidas do banco.
      const url = new URL(URL_TESTE!);
      url.pathname = `/${BANCO}`;
      const dsReal = new DataSource({
        type: 'postgres',
        url: url.toString(),
        schema: 'feed',
        entities: ENTIDADES,
      });
      await dsReal.initialize();
      const permissoesReais = new PermissoesAlunoService(
        new ParticipacoesService(
          dsReal.getRepository(ParticipacaoEntity),
          dsReal.getRepository(ProgramaEntity),
          dsReal,
        ),
        new ProgramasService(dsReal.getRepository(ProgramaEntity)),
      );
      const real = new ConquistasService(
        ds,
        app.get(NotificacoesService),
        permissoesReais,
      );
      const c = await nova({ criterio: 'FEED_COMENTARIOS', meta: 1, xp: 10 });
      await ds.query(
        `INSERT INTO feed.participacoes (usuario_id, programa, papel, status, inicio_em, termino_em, respostas) ` +
          `VALUES ('encerra@pucminas.edu.br', $1, 'apadrinhado', 'em_andamento', now() - interval '30 days', NULL, '{}')`,
        [CICLO],
      );
      // Contas reais têm perfil 'nenhuma' no token: nada vem do JWT.
      const usuario = jwt.verify<AccessTokenPayload>(
        token('encerra', 'nenhuma').slice(7),
      );
      try {
        // O controller lê a elegibilidade quando o feed aceita a ação...
        const aceita = await real.elegibilidadeNoFeed(usuario);
        expect(aceita).toMatchObject({ programa: CICLO, participante: true });
        await comentarNoCiclo('encerra', CICLO); // ...o comentário é gravado...
        // ...e a coordenação encerra o ciclo antes da conferência.
        await ds.query(
          `UPDATE feed.programas SET etapa_atual = 'encerramento' WHERE codigo = $1`,
          [CICLO],
        );
        // Resolvendo agora, o encerramento descarta a participação.
        expect((await permissoesReais.doUsuario(usuario)).participante).toBe(
          false,
        );
        expect(await real.aposAtividadeNoFeed(usuario, CICLO)).toEqual([]);
        expect(await desbloqueios(c.id, ids.encerra)).toBe(0);
        // Com a elegibilidade de quando a ação foi aceita: desbloqueia.
        expect(
          await real.aposAtividadeNoFeed(usuario, CICLO, aceita),
        ).toContainEqual({
          id: c.id,
          contexto: CICLO,
        });
        const [{ xp }] = (await ds.query(
          `SELECT xp_creditado AS xp FROM gamificacao.conquistas_desbloqueios WHERE conquista_id = $1 AND usuario_id = $2`,
          [c.id, ids.encerra],
        )) as Array<{ xp: number }>;
        expect(xp).toBe(10);
      } finally {
        await ds.query(
          `UPDATE feed.programas SET etapa_atual = 'andamento' WHERE codigo = $1`,
          [CICLO],
        );
        await dsReal.destroy();
      }
    });

    it('se o aviso falha, o desbloqueio e o XP são desfeitos e a próxima consulta refaz tudo', async () => {
      const c = await nova({ meta: 1, xp: 20 });
      await concluirMissoes(ids.sino, 1);
      await ds.query(`
        CREATE FUNCTION feed.falha_aviso_teste() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.tipo = 'CONQUISTA_DESBLOQUEADA' THEN RAISE EXCEPTION 'falha simulada do aviso'; END IF;
          RETURN NEW;
        END $$`);
      await ds.query(
        `CREATE TRIGGER falha_aviso_teste BEFORE INSERT ON feed.notificacoes FOR EACH ROW EXECUTE FUNCTION feed.falha_aviso_teste()`,
      );
      try {
        // Como depois de concluir uma missão: a falha só gera log.
        await expect(
          servico.sincronizarComSeguranca(ids.sino, acessoApadrinhado),
        ).resolves.toEqual([]);
        expect(await desbloqueios(c.id, ids.sino)).toBe(0);
        expect(await xpDe(ids.sino)).toBe(0);
      } finally {
        await ds.query(`DROP TRIGGER falha_aviso_teste ON feed.notificacoes`);
        await ds.query(`DROP FUNCTION feed.falha_aviso_teste()`);
      }
      const vista = await colecao(token('sino', 'apadrinhado'));
      expect(idsNovas(vista)).toContain(c.id);
      expect(await desbloqueios(c.id, ids.sino)).toBe(1);
      expect(await avisosDe(ids.sino, c.id)).toBe(1);
      // Um crédito só desta conquista (outras publicadas também valem para ele).
      expect(
        await ds.query(
          `SELECT quantidade FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1 AND tipo = 'CONQUISTA' AND referencia_id = $2`,
          [ids.sino, c.id],
        ),
      ).toEqual([{ quantidade: 20 }]);
    });

    it('mesma conquista em dois semestres: a novidade vem com o contexto, uma vez', async () => {
      const c = await nova({ meta: 1 });
      await concluirMissoes(ids.semestres, 1, CICLO_ANTERIOR);
      expect(
        await servico.sincronizar(
          ids.semestres,
          acessoApadrinhado,
          CICLO_ANTERIOR,
        ),
      ).toContainEqual({ id: c.id, contexto: CICLO_ANTERIOR });
      // O aluno viu (e a tela confirmou) o aviso daquele semestre.
      expect(
        (await colecao(token('semestres', 'apadrinhado'))).novas.filter(
          (n) => n.id === c.id,
        ),
      ).toEqual([{ id: c.id, contexto: CICLO_ANTERIOR }]);
      await confirmar(token('semestres', 'apadrinhado'), [
        { id: c.id, contexto: CICLO_ANTERIOR },
      ]).expect(200);
      await concluirMissoes(ids.semestres, 1);
      const vista = await colecao(token('semestres', 'apadrinhado'));
      expect(
        vista.obtidas
          .filter((o) => o.id === c.id)
          .map((o) => o.contexto)
          .sort(),
      ).toEqual([CICLO_ANTERIOR, CICLO].sort());
      expect(vista.novas.filter((n) => n.id === c.id)).toEqual([
        { id: c.id, contexto: CICLO },
      ]);
    });

    it('imagem com HTTPS:// maiúsculo é aceita e gravada em minúsculas (o CHECK do banco exige)', async () => {
      const criada = (
        await criar({
          nome: 'Medalha maiúscula',
          descricao: 'URL com protocolo em maiúsculas.',
          imagemUrl: 'HTTPS://exemplo.com/Medalha.PNG',
          criterio: 'MISSOES_CONCLUIDAS',
          meta: 3,
        }).expect(201)
      ).body as Conquista & { imagemUrl: string };
      expect(criada.imagemUrl).toBe('https://exemplo.com/Medalha.PNG');
      const editada = (
        await http()
          .patch(`/coordenacao/conquistas/${criada.id}`)
          .set('Authorization', coord())
          .send({
            atualizadoEm: criada.atualizadoEm,
            imagemUrl: 'HtTpS://exemplo.com/outra.png',
          })
          .expect(200)
      ).body as Conquista & { imagemUrl: string };
      expect(editada.imagemUrl).toBe('https://exemplo.com/outra.png');
      await criar({
        nome: 'Sem https',
        descricao: 'Recusada.',
        imagemUrl: 'http://exemplo.com/m.png',
        criterio: 'MISSOES_CONCLUIDAS',
        meta: 3,
      }).expect(400);
    });

    it('cadeia de níveis de 50 a 500 XP libera a conquista do nível 5 na mesma consulta', async () => {
      await creditarXp(ids.cascata, 50); // nível 2
      const criadas = [
        ...(await Promise.all(
          [1, 2].map(() =>
            nova({ criterio: 'NIVEL_ALCANCADO', meta: 2, xp: 50 }),
          ),
        )), // -> 150, nível 3
        ...(await Promise.all(
          [1, 2, 3].map(() =>
            nova({ criterio: 'NIVEL_ALCANCADO', meta: 3, xp: 50 }),
          ),
        )), // -> 300, nível 4
        ...(await Promise.all(
          [1, 2, 3, 4].map(() =>
            nova({ criterio: 'NIVEL_ALCANCADO', meta: 4, xp: 50 }),
          ),
        )), // -> 500, nível 5
      ];
      const nivel5 = await nova({ criterio: 'NIVEL_ALCANCADO', meta: 5 });
      try {
        const vista = await colecao(token('cascata', 'apadrinhado'));
        expect(await xpDe(ids.cascata)).toBe(500);
        expect(idsNovas(vista)).toContain(nivel5.id);
        expect(vista.obtidas.map((o) => o.id)).toContain(nivel5.id);
        expect(vista.disponiveis.map((d) => d.id)).not.toContain(nivel5.id);
        for (const c of criadas)
          expect(await desbloqueios(c.id, ids.cascata)).toBe(1);
      } finally {
        // Não deixa a cadeia valendo para os outros testes.
        for (const c of [...criadas, nivel5]) {
          await http()
            .post(`/coordenacao/conquistas/${c.id}/arquivar`)
            .set('Authorization', coord())
            .expect(200);
        }
      }
    });
  });
});
