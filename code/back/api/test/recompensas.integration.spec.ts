/**
 * Cadastro de recompensas da lojinha (F27) contra PostgreSQL REAL.
 * Pulado sem MAPA_TEST_DB_URL; mesmo procedimento de
 * test/pucstops-xp.integration.spec.ts (banco `recompensas_api`, apagado ao fim).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource, type MigrationInterface } from 'typeorm';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { registrarMovimentacao } from '../src/gamificacao/gamificacao.js';
import { RecompensasAdminController } from '../src/gamificacao/recompensas/recompensas-admin.controller.js';
import { RecompensasAdminService } from '../src/gamificacao/recompensas/recompensas-admin.service.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { LojinhaResgates1792800000000 } from '../src/migrations/1792800000000-LojinhaResgates.js';
import { LojinhaRecompensas1792900000000 } from '../src/migrations/1792900000000-LojinhaRecompensas.js';
import { CodigoResgates1793500000000 } from '../src/migrations/1793500000000-CodigoResgates.js';
import { LojinhaController } from '../src/gamificacao/lojinha/lojinha.controller.js';
import { LojinhaService } from '../src/gamificacao/lojinha/lojinha.service.js';
import { randomUUID } from 'node:crypto';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-de-teste-recompensas';
const BANCO = 'recompensas_api';
const MIGRATIONS: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
  LojinhaResgates1792800000000,
  LojinhaRecompensas1792900000000,
  CodigoResgates1793500000000,
];

async function admin(sql: string): Promise<void> {
  const c = new pg.Client({ connectionString: URL_TESTE });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

interface Recompensa {
  id: string;
  nome: string;
  descricao: string;
  custoXp: number;
  condicoesRetirada: string;
  status: string;
  versao: number;
  disponivelAgora: boolean;
  transacoes: number;
  podeExcluir: boolean;
  criadoPor: number | null;
  criadoPorEmail: string | null;
  limitePorAluno: number | null;
  publico: string;
  programaCodigo: string | null;
  estoque: {
    ilimitado: boolean;
    total: number | null;
    comprometido: number;
    disponivel: number | null;
  };
  versoes: Array<{ versao: number; custoXp: number; descricao: string }>;
  ajustesEstoque: Array<{
    tipo: string;
    quantidade: number | null;
    estoqueAntes: number | null;
    estoqueDepois: number | null;
    motivo: string;
    responsavelId: number | null;
    responsavelEmail: string | null;
  }>;
}

const FUTURO = new Date(Date.now() + 30 * 86_400_000).toISOString();
const PASSADO = new Date(Date.now() - 86_400_000).toISOString();

const base = (extra: object = {}) => ({
  nome: 'Caneca Ajuda-aí',
  descricao: 'Caneca de cerâmica com o logo do programa.',
  custoXp: 300,
  condicoesRetirada: 'Retirar na coordenação do ICEI, seg a sex, 9h–17h.',
  estoqueIlimitado: false,
  estoqueInicial: 10,
  ...extra,
});

describe.skipIf(!URL_TESTE)(
  'Recompensas da lojinha (F27) com banco real',
  () => {
    let ds: DataSource;
    let app: INestApplication;
    let jwt: JwtService;
    let alunoId = 0;
    let coordId = 0;
    const http = () => request(app.getHttpServer());

    /** Coordenador mockado: `sub` "3" e e-mail fora de `usuarios`. */
    const mock = () =>
      `Bearer ${jwt.sign({ sub: '3', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;
    /** Coordenador cadastrado em `usuarios`. */
    const coord = () =>
      `Bearer ${jwt.sign({ sub: String(coordId), email: 'coord@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;
    const aluno = () =>
      `Bearer ${jwt.sign({ sub: String(alunoId), email: 'aluno@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' })}`;

    const criar = (corpo: object, auth = mock()) =>
      http()
        .post('/coordenacao/recompensas')
        .set('Authorization', auth)
        .send(corpo);
    const editar = (id: string, corpo: object, auth = mock()) =>
      http()
        .patch(`/coordenacao/recompensas/${id}`)
        .set('Authorization', auth)
        .send(corpo);
    const acao = (id: string, nome: 'publicar' | 'desativar' | 'arquivar') =>
      http()
        .post(`/coordenacao/recompensas/${id}/${nome}`)
        .set('Authorization', mock());
    const estoque = (id: string, corpo: object, auth = mock()) =>
      http()
        .post(`/coordenacao/recompensas/${id}/estoque`)
        .set('Authorization', auth)
        .send(corpo);
    const detalhe = async (id: string) =>
      (
        await http()
          .get(`/coordenacao/recompensas/${id}`)
          .set('Authorization', mock())
          .expect(200)
      ).body as Recompensa;

    /** Credita XP de teste ao aluno (fora da lojinha). */
    async function creditar(usuarioId: number, quantidade: number) {
      await ds.transaction(async (m) => {
        await registrarMovimentacao(m.queryRunner!, {
          usuarioId,
          quantidade,
          tipo: 'AJUSTE_ADMIN',
          referenciaTipo: null,
          referenciaId: null,
          descricao: 'crédito de teste',
          chaveIdempotencia: `teste-credito-${randomUUID()}`,
        });
      });
    }

    const resgatar = (id: string, auth = aluno(), chave = randomUUID()) =>
      http()
        .post(`/me/lojinha/${id}/resgatar`)
        .set('Authorization', auth)
        .send({ chaveIdempotencia: chave });

    /** Resgate real do aluno pela lojinha (F28): débito e unidade comprometida. */
    async function simularResgate(id: string): Promise<void> {
      await creditar(alunoId, 1000);
      await resgatar(id).expect(201);
    }

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
      await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
      await ds.runMigrations({ transaction: 'all' });
      const inserir = async (nome: string, email: string) =>
        (
          (await ds.query(
            `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
              `VALUES ($1, $2, 'Engenharia de Software', 3, 'apadrinhado', 'aprovado') RETURNING id`,
            [nome, email],
          )) as Array<{ id: number }>
        )[0].id;
      alunoId = await inserir('Aluno Teste', 'aluno@pucminas.edu.br');
      coordId = await inserir(
        'Coordenação Cadastrada',
        'coord@pucminas.edu.br',
      );
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ('2026-2', 'Programa 2026/2', 'inscricoes')`,
      );
      await ds.query(
        `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ('aluno@pucminas.edu.br', '2026-1', 'apadrinhado', 'em_andamento')`,
      );

      const modulo = await Test.createTestingModule({
        imports: [JwtModule.register({ secret: SEGREDO })],
        controllers: [RecompensasAdminController, LojinhaController],
        providers: [
          RecompensasAdminService,
          LojinhaService,
          JwtAuthGuard,
          RolesGuard,
          { provide: DataSource, useValue: ds },
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
      if (URL_TESTE)
        await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    });

    describe('criar, listar e consultar', () => {
      it('cria em rascunho, com versão 1 e registro do estoque inicial', async () => {
        const { body } = await criar(base()).expect(201);
        const r = body as Recompensa;
        expect(r).toMatchObject({
          nome: 'Caneca Ajuda-aí',
          custoXp: 300,
          status: 'rascunho',
          versao: 1,
          disponivelAgora: false,
          transacoes: 0,
          podeExcluir: true,
          publico: 'todos',
          programaCodigo: null,
          criadoPor: null,
          criadoPorEmail: 'renata@pucminas.edu.br',
          estoque: {
            ilimitado: false,
            total: 10,
            comprometido: 0,
            disponivel: 10,
          },
        });
        expect(r.versoes).toHaveLength(1);
        expect(r.ajustesEstoque).toEqual([
          expect.objectContaining({
            tipo: 'inicial',
            quantidade: 10,
            estoqueAntes: null,
            estoqueDepois: 10,
            responsavelEmail: 'renata@pucminas.edu.br',
          }),
        ]);
      });

      it('ilimitado explícito, publicado já, com público, contexto, vigência e limite', async () => {
        const { body } = await criar(
          {
            nome: 'Adesivo',
            descricao: 'Cartela com 5 adesivos.',
            custoXp: 50,
            condicoesRetirada: 'Retirar em qualquer evento do programa.',
            estoqueIlimitado: true,
            publico: 'padrinhos',
            programaCodigo: '2026-2',
            disponivelAte: FUTURO,
            limitePorAluno: 2,
            imagemUrl: 'https://exemplo.com/adesivo.png',
            publicar: true,
          },
          coord(),
        ).expect(201);
        expect(body).toMatchObject({
          status: 'publicada',
          disponivelAgora: true,
          publico: 'padrinhos',
          programaCodigo: '2026-2',
          limitePorAluno: 2,
          criadoPor: coordId,
          estoque: { ilimitado: true, total: null, disponivel: null },
        });
        expect(body.ajustesEstoque[0]).toMatchObject({
          tipo: 'ilimitado',
          responsavelId: coordId,
        });
      });

      it.each([
        ['custo zero', base({ custoXp: 0 })],
        ['custo fracionado', base({ custoXp: 10.5 })],
        ['nome vazio', base({ nome: '   ' })],
        ['sem descrição', base({ descricao: undefined })],
        ['sem condições de retirada', base({ condicoesRetirada: undefined })],
        ['limitado sem estoque inicial', base({ estoqueInicial: undefined })],
        ['estoque negativo', base({ estoqueInicial: -1 })],
        [
          'sem declarar o tipo de estoque',
          base({ estoqueIlimitado: undefined }),
        ],
        ['ilimitado com estoque inicial', base({ estoqueIlimitado: true })],
        ['imagem sem https', base({ imagemUrl: 'http://x.com/a.png' })],
        ['público desconhecido', base({ publico: 'professores' })],
        ['data sem fuso', base({ disponivelDe: '2026-11-10T08:00:00' })],
        [
          'vigência invertida',
          base({ disponivelDe: FUTURO, disponivelAte: PASSADO }),
        ],
        [
          'publicar com vigência vencida',
          base({ disponivelAte: PASSADO, publicar: true }),
        ],
        ['programa inexistente', base({ programaCodigo: 'nao-existe' })],
        ['campo desconhecido', base({ status: 'publicada' })],
      ])('recusa (400): %s', async (_nome, corpo) => {
        const antes = await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.recompensas`,
        );
        await criar(corpo).expect(400);
        const depois = await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.recompensas`,
        );
        expect(depois).toEqual(antes);
      });

      it('somente a coordenação acessa (aluno 403, sem token 401)', async () => {
        await criar(base(), aluno()).expect(403);
        await http().get('/coordenacao/recompensas').expect(401);
      });

      it('lista todas e filtra por status; detalhe 404 para id inexistente', async () => {
        const { body: todas } = await http()
          .get('/coordenacao/recompensas')
          .set('Authorization', mock())
          .expect(200);
        expect((todas as Recompensa[]).map((r) => r.nome)).toEqual([
          'Adesivo',
          'Caneca Ajuda-aí',
        ]);
        const { body: rascunhos } = await http()
          .get('/coordenacao/recompensas?status=rascunho')
          .set('Authorization', mock())
          .expect(200);
        expect((rascunhos as Recompensa[]).map((r) => r.nome)).toEqual([
          'Caneca Ajuda-aí',
        ]);
        await http()
          .get('/coordenacao/recompensas?status=xyz')
          .set('Authorization', mock())
          .expect(400);
        await http()
          .get('/coordenacao/recompensas/00000000-0000-4000-8000-000000000000')
          .set('Authorization', mock())
          .expect(404);
      });
    });

    describe('editar, publicar e desativar', () => {
      let id = '';
      beforeAll(async () => {
        id = (
          (await criar(base({ nome: 'Camiseta' })).expect(201))
            .body as Recompensa
        ).id;
      });

      it('preço/descrição geram nova versão; a anterior fica preservada', async () => {
        const { body } = await editar(id, {
          custoXp: 450,
          descricao: 'Camiseta nova',
        }).expect(200);
        expect(body).toMatchObject({ custoXp: 450, versao: 2 });
        expect(
          (body as Recompensa).versoes.map((v) => [
            v.versao,
            v.custoXp,
            v.descricao,
          ]),
        ).toEqual([
          [2, 450, 'Camiseta nova'],
          [1, 300, 'Caneca de cerâmica com o logo do programa.'],
        ]);
        // Público, limite e contexto não mudam as condições do resgate.
        const { body: outro } = await editar(id, {
          publico: 'apadrinhados',
          limitePorAluno: 1,
          programaCodigo: '2026-2',
        }).expect(200);
        expect(outro).toMatchObject({
          versao: 2,
          publico: 'apadrinhados',
          limitePorAluno: 1,
        });
        const { body: limpo } = await editar(id, {
          limitePorAluno: null,
          programaCodigo: null,
        }).expect(200);
        expect(limpo).toMatchObject({
          limitePorAluno: null,
          programaCodigo: null,
        });
      });

      it('edição inválida é recusada sem alterar nada', async () => {
        await editar(id, {}).expect(400);
        await editar(id, { custoXp: -5 }).expect(400);
        await editar(id, { estoqueInicial: 99 }).expect(400);
        await editar(id, {
          disponivelDe: FUTURO,
          disponivelAte: PASSADO,
        }).expect(400);
        expect(await detalhe(id)).toMatchObject({ custoXp: 450, versao: 2 });
      });

      it('publica, desativa e publica de novo (idempotente)', async () => {
        await acao(id, 'publicar').expect(200);
        const { body } = await acao(id, 'publicar').expect(200);
        expect(body).toMatchObject({
          status: 'publicada',
          disponivelAgora: true,
        });
        await acao(id, 'desativar').expect(200);
        expect(await detalhe(id)).toMatchObject({
          status: 'inativa',
          disponivelAgora: false,
        });
        await acao(id, 'desativar').expect(200);
        await acao(id, 'publicar').expect(200);
      });

      it('vigência futura: publicada, mas ainda não disponível', async () => {
        const amanha = new Date(Date.now() + 86_400_000).toISOString();
        const { body } = await editar(id, { disponivelDe: amanha }).expect(200);
        expect(body).toMatchObject({
          status: 'publicada',
          disponivelAgora: false,
        });
        await editar(id, { disponivelDe: null }).expect(200);
      });

      it('rascunho não pode ser desativado (409)', async () => {
        const outro = (
          (await criar(base({ nome: 'Bloco' })).expect(201)).body as Recompensa
        ).id;
        await acao(outro, 'desativar').expect(409);
      });
    });

    describe('estoque', () => {
      let id = '';
      beforeAll(async () => {
        id = (
          (await criar(base({ nome: 'Ecobag', estoqueInicial: 5 })).expect(201))
            .body as Recompensa
        ).id;
      });

      it('reposição e correção registram responsável e motivo', async () => {
        await estoque(
          id,
          { tipo: 'reposicao', quantidade: 5, motivo: 'Chegou lote novo' },
          coord(),
        ).expect(200);
        const { body } = await estoque(id, {
          tipo: 'correcao',
          quantidade: 8,
          motivo: 'Duas com defeito',
        }).expect(200);
        expect((body as Recompensa).estoque).toEqual({
          ilimitado: false,
          total: 8,
          comprometido: 0,
          disponivel: 8,
        });
        expect((body as Recompensa).ajustesEstoque.slice(0, 2)).toEqual([
          expect.objectContaining({
            tipo: 'correcao',
            estoqueAntes: 10,
            estoqueDepois: 8,
            motivo: 'Duas com defeito',
            responsavelEmail: 'renata@pucminas.edu.br',
          }),
          expect.objectContaining({
            tipo: 'reposicao',
            quantidade: 5,
            estoqueAntes: 5,
            estoqueDepois: 10,
            responsavelId: coordId,
          }),
        ]);
      });

      it('validações do ajuste', async () => {
        await estoque(id, { tipo: 'reposicao', quantidade: 3 }).expect(400);
        await estoque(id, {
          tipo: 'reposicao',
          quantidade: 3,
          motivo: 'ok',
        }).expect(400);
        await estoque(id, {
          tipo: 'reposicao',
          quantidade: 0,
          motivo: 'zero unidades',
        }).expect(400);
        await estoque(id, {
          tipo: 'reposicao',
          motivo: 'sem quantidade',
        }).expect(400);
        await estoque(id, {
          tipo: 'correcao',
          quantidade: 8,
          motivo: 'mesmo total',
        }).expect(400);
        await estoque(id, {
          tipo: 'limitado',
          quantidade: 3,
          motivo: 'já é limitado',
        }).expect(409);
        await estoque(id, {
          tipo: 'inicial',
          quantidade: 3,
          motivo: 'tipo reservado',
        }).expect(400);
        expect((await detalhe(id)).estoque.total).toBe(8);
      });

      it('preserva as quantidades comprometidas com resgates', async () => {
        await acao(id, 'publicar').expect(200);
        await simularResgate(id);
        expect((await detalhe(id)).estoque).toMatchObject({
          comprometido: 1,
          disponivel: 7,
        });
        await ds.query(
          `UPDATE gamificacao.recompensas SET estoque_comprometido = 3 WHERE id = $1`,
          [id],
        );
        const { body } = await estoque(id, {
          tipo: 'correcao',
          quantidade: 2,
          motivo: 'Contagem física',
        }).expect(409);
        expect(body).toMatchObject({ motivo: 'abaixo-do-comprometido' });
        await estoque(id, {
          tipo: 'correcao',
          quantidade: 3,
          motivo: 'Contagem física',
        }).expect(200);
        expect((await detalhe(id)).estoque).toMatchObject({
          total: 3,
          comprometido: 3,
          disponivel: 0,
        });
        // O banco também barra, mesmo fora da API.
        await expect(
          ds.query(
            `UPDATE gamificacao.recompensas SET estoque_total = 1 WHERE id = $1`,
            [id],
          ),
        ).rejects.toThrow(/ck_recompensas_estoque/);
      });

      it('troca entre ilimitado e limitado', async () => {
        const { body } = await estoque(id, {
          tipo: 'ilimitado',
          motivo: 'Item digital',
        }).expect(200);
        expect((body as Recompensa).estoque).toMatchObject({
          ilimitado: true,
          total: null,
        });
        await estoque(id, {
          tipo: 'reposicao',
          quantidade: 1,
          motivo: 'não se aplica',
        }).expect(409);
        await estoque(id, {
          tipo: 'limitado',
          quantidade: 1,
          motivo: 'Abaixo do comprometido',
        }).expect(409);
        const { body: limitado } = await estoque(id, {
          tipo: 'limitado',
          quantidade: 20,
          motivo: 'Volta a ser físico',
        }).expect(200);
        expect((limitado as Recompensa).estoque).toMatchObject({
          total: 20,
          disponivel: 17,
        });
      });
    });

    describe('lojinha do aluno (F28) sobre o cadastro (F27)', () => {
      let outroId = 0;
      const outro = () =>
        `Bearer ${jwt.sign({ sub: String(outroId), email: 'padrinho@pucminas.edu.br', perfil: 'padrinho', escopo: 'acesso' })}`;
      const vitrine = async (auth = aluno()) =>
        (await http().get('/me/lojinha').set('Authorization', auth).expect(200))
          .body as Array<{
          id: string;
          nome: string;
          estoque: number | null;
          resgatesFeitos: number;
        }>;
      const novo = async (extra: object) =>
        (
          (await criar(base({ publicar: true, ...extra })).expect(201))
            .body as Recompensa
        ).id;

      beforeAll(async () => {
        [{ id: outroId }] = (await ds.query(
          `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
            `VALUES ('Padrinho', 'padrinho@pucminas.edu.br', 'ES', 5, 'padrinho', 'aprovado') RETURNING id`,
        )) as Array<{ id: number }>;
        await ds.query(
          `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ('padrinho@pucminas.edu.br', '2026-2', 'padrinho', 'aprovado')`,
        );
      });

      it('mostra só o que está publicado, na vigência, no público e no programa do aluno', async () => {
        const visivel = await novo({ nome: 'Vis 1' });
        const rascunho = await novo({ nome: 'Vis 2', publicar: false });
        const futura = await novo({ nome: 'Vis 3', disponivelDe: FUTURO });
        const padrinhos = await novo({ nome: 'Vis 4', publico: 'padrinhos' });
        const programa = await novo({
          nome: 'Vis 5',
          programaCodigo: '2026-2',
        });
        const doAluno = (await vitrine()).map((r) => r.id);
        expect(doAluno).toContain(visivel);
        for (const id of [rascunho, futura, padrinhos, programa])
          expect(doAluno).not.toContain(id);
        const doPadrinho = (await vitrine(outro())).map((r) => r.id);
        expect(doPadrinho).toEqual(
          expect.arrayContaining([visivel, padrinhos, programa]),
        );
        await creditar(alunoId, 1000);
        await resgatar(padrinhos).expect(404);
        await resgatar(rascunho).expect(404);
      });

      it('resgate compromete estoque e guarda a versão; editar depois não muda o comprovante', async () => {
        const id = await novo({
          nome: 'Garrafa',
          estoqueInicial: 2,
          custoXp: 200,
        });
        await creditar(alunoId, 1000);
        const { body } = await resgatar(id).expect(201);
        expect(body).toMatchObject({
          custoXp: 200,
          versao: 1,
          nome: 'Garrafa',
        });
        expect((await detalhe(id)).estoque).toMatchObject({
          total: 2,
          comprometido: 1,
          disponivel: 1,
        });
        expect((await vitrine()).find((r) => r.id === id)).toMatchObject({
          estoque: 1,
          resgatesFeitos: 1,
        });
        await editar(id, {
          custoXp: 999,
          condicoesRetirada: 'Novas condições',
        }).expect(200);
        const { body: historico } = await http()
          .get('/me/lojinha/resgates')
          .set('Authorization', aluno())
          .expect(200);
        expect(
          historico.find(
            (h: { recompensaId: string }) => h.recompensaId === id,
          ),
        ).toMatchObject({
          versao: 1,
          custoXp: 200,
        });
        expect((await detalhe(id)).transacoes).toBe(1);
      });

      it('limite por aluno, idempotência e saldo insuficiente', async () => {
        const id = await novo({
          nome: 'Chaveiro',
          estoqueIlimitado: true,
          estoqueInicial: undefined,
          limitePorAluno: 1,
          custoXp: 10,
        });
        await creditar(alunoId, 100);
        const chave = randomUUID();
        const primeiro = (await resgatar(id, aluno(), chave).expect(201))
          .body as { id: string };
        const repetido = (await resgatar(id, aluno(), chave).expect(201))
          .body as { id: string };
        expect(repetido.id).toBe(primeiro.id);
        await resgatar(id).expect(409);
        const caro = await novo({ nome: 'Notebook', custoXp: 100000 });
        await resgatar(caro).expect(422);
        expect((await detalhe(caro)).estoque.comprometido).toBe(0);
      });

      it('última unidade com resgates simultâneos: só um leva', async () => {
        const id = await novo({
          nome: 'Última',
          estoqueInicial: 1,
          custoXp: 5,
        });
        const alunos: number[] = [];
        for (let i = 0; i < 6; i++) {
          const [{ id: uid }] = (await ds.query(
            `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
              `VALUES ($1, $2, 'ES', 2, 'apadrinhado', 'aprovado') RETURNING id`,
            [`Aluno ${i}`, `concorrente${i}@pucminas.edu.br`],
          )) as Array<{ id: number }>;
          await ds.query(
            `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ($1, '2026-1', 'apadrinhado', 'em_andamento')`,
            [`concorrente${i}@pucminas.edu.br`],
          );
          await creditar(uid, 50);
          alunos.push(uid);
        }
        const respostas = await Promise.all(
          alunos.map((uid, i) =>
            resgatar(
              id,
              `Bearer ${jwt.sign({ sub: String(uid), email: `concorrente${i}@pucminas.edu.br`, perfil: 'apadrinhado', escopo: 'acesso' })}`,
            ),
          ),
        );
        expect(respostas.map((r) => r.status).sort()).toEqual([
          201, 409, 409, 409, 409, 409,
        ]);
        expect((await detalhe(id)).estoque).toMatchObject({
          comprometido: 1,
          disponivel: 0,
        });
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.xp_movimentacoes WHERE tipo = 'RECOMPENSA' AND usuario_id = ANY($1)`,
          [alunos],
        );
        expect(n).toBe(1);
      });
    });

    describe('consulta, comprovante e elegibilidade do aluno (F28)', () => {
      const token = (email: string, id: number, perfil = 'apadrinhado') =>
        `Bearer ${jwt.sign({ sub: String(id), email, perfil, escopo: 'acesso' })}`;
      const inserirUsuario = async (email: string) =>
        (
          (await ds.query(
            `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
              `VALUES ($1, $1, 'ES', 3, 'apadrinhado', 'aprovado') RETURNING id`,
            [email],
          )) as Array<{ id: number }>
        )[0].id;
      const publicada = async (extra: object = {}) =>
        (
          (await criar(base({ publicar: true, ...extra })).expect(201))
            .body as Recompensa
        ).id;

      it('detalhe, código do comprovante, comprovante e histórico com imagem', async () => {
        const id = await publicada({
          nome: 'Caderno',
          custoXp: 20,
          imagemUrl: 'https://exemplo.com/caderno.png',
        });
        const detalheAluno = await http()
          .get(`/me/lojinha/${id}`)
          .set('Authorization', aluno())
          .expect(200);
        expect(detalheAluno.body).toMatchObject({ id, nome: 'Caderno' });
        await creditar(alunoId, 100);
        const { body: resgate } = await resgatar(id).expect(201);
        expect(resgate.codigo).toMatch(/^[0-9A-F]{10}$/);
        const { body: comprovante } = await http()
          .get(`/me/lojinha/resgates/${resgate.id}`)
          .set('Authorization', aluno())
          .expect(200);
        expect(comprovante).toMatchObject({
          id: resgate.id,
          codigo: resgate.codigo,
          imagemUrl: 'https://exemplo.com/caderno.png',
        });
        const outro = await inserirUsuario('curioso@pucminas.edu.br');
        await http()
          .get(`/me/lojinha/resgates/${resgate.id}`)
          .set('Authorization', token('curioso@pucminas.edu.br', outro))
          .expect(404);
      });

      it('sem participação ativa não vê nem resgata; histórico continua aberto', async () => {
        const id = await publicada({ nome: 'Adesivo', custoXp: 5 });
        const email = 'pendente@pucminas.edu.br';
        const uid = await inserirUsuario(email);
        await ds.query(
          `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ($1, '2026-2', 'candidato', 'pendente')`,
          [email],
        );
        await creditar(uid, 50);
        for (const perfil of ['padrinho', 'apadrinhado']) {
          const auth = token(email, uid, perfil);
          const lista = await http()
            .get('/me/lojinha')
            .set('Authorization', auth)
            .expect(403);
          expect(lista.body.motivo).toBe('sem-participacao');
          await http()
            .get(`/me/lojinha/${id}`)
            .set('Authorization', auth)
            .expect(403);
          await resgatar(id, auth).expect(403);
        }
        const [{ saldo }] = (await ds.query(
          `SELECT saldo FROM gamificacao.xp_carteiras WHERE usuario_id = $1`,
          [uid],
        )) as Array<{ saldo: number }>;
        expect(saldo).toBe(50);

        const ativo = 'encerrando@pucminas.edu.br';
        const ativoId = await inserirUsuario(ativo);
        await ds.query(
          `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ($1, '2026-1', 'apadrinhado', 'em_andamento')`,
          [ativo],
        );
        await creditar(ativoId, 50);
        const { body: feito } = await resgatar(
          id,
          token(ativo, ativoId),
        ).expect(201);
        await ds.query(
          `UPDATE feed.participacoes SET status = 'concluido' WHERE usuario_id = $1`,
          [ativo],
        );
        await http()
          .get('/me/lojinha')
          .set('Authorization', token(ativo, ativoId))
          .expect(403);
        const historico = await http()
          .get('/me/lojinha/resgates')
          .set('Authorization', token(ativo, ativoId))
          .expect(200);
        expect(historico.body[0].id).toBe(feito.id);
      });

      it('recompensa de programa exige participação ativa naquele programa', async () => {
        const id = await publicada({
          nome: 'Camiseta do ciclo',
          programaCodigo: '2026-2',
        });
        const email = 'reprovado@pucminas.edu.br';
        const uid = await inserirUsuario(email);
        await ds.query(
          `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ($1, '2026-1', 'apadrinhado', 'em_andamento'), ($1, '2026-2', 'apadrinhado', 'nao_aprovado')`,
          [email],
        );
        const lista = await http()
          .get('/me/lojinha')
          .set('Authorization', token(email, uid))
          .expect(200);
        expect(lista.body.map((r: { id: string }) => r.id)).not.toContain(id);
        await http()
          .get(`/me/lojinha/${id}`)
          .set('Authorization', token(email, uid))
          .expect(404);
      });
    });

    describe('excluir e arquivar', () => {
      it('sem transações: exclui de vez, com versões e ajustes', async () => {
        const id = (
          (await criar(base({ nome: 'Rascunho descartável' })).expect(201))
            .body as Recompensa
        ).id;
        await editar(id, { custoXp: 10 }).expect(200);
        await http()
          .delete(`/coordenacao/recompensas/${id}`)
          .set('Authorization', mock())
          .expect(200, { excluida: true, id });
        const [{ n }] = await ds.query(
          `SELECT (SELECT count(*) FROM gamificacao.recompensas WHERE id = $1) + ` +
            `(SELECT count(*) FROM gamificacao.recompensa_versoes WHERE recompensa_id = $1) + ` +
            `(SELECT count(*) FROM gamificacao.recompensa_estoque_ajustes WHERE recompensa_id = $1) AS n`,
          [id],
        );
        expect(Number(n)).toBe(0);
      });

      it('com transações: excluir é recusado; arquivar preserva tudo e congela', async () => {
        const id = (
          (await criar(base({ nome: 'Moletom', publicar: true })).expect(201))
            .body as Recompensa
        ).id;
        await simularResgate(id);
        const antes = await detalhe(id);
        expect(antes).toMatchObject({ transacoes: 1, podeExcluir: false });
        const { body } = await http()
          .delete(`/coordenacao/recompensas/${id}`)
          .set('Authorization', mock())
          .expect(409);
        expect(body).toMatchObject({ motivo: 'recompensa-com-transacoes' });

        const { body: arquivada } = await acao(id, 'arquivar').expect(200);
        expect(arquivada).toMatchObject({
          status: 'arquivada',
          disponivelAgora: false,
          transacoes: 1,
        });
        await acao(id, 'arquivar').expect(200);
        await editar(id, { custoXp: 1 }).expect(409);
        await acao(id, 'publicar').expect(409);
        await estoque(id, {
          tipo: 'reposicao',
          quantidade: 1,
          motivo: 'arquivada',
        }).expect(409);
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.resgates WHERE recompensa_id = $1`,
          [id],
        );
        expect(n).toBe(1);
      });

      it('histórico de versões e de estoque não aceita UPDATE', async () => {
        await expect(
          ds.query(`UPDATE gamificacao.recompensa_versoes SET custo_xp = 1`),
        ).rejects.toThrow(/somente inserção/);
        await expect(
          ds.query(
            `UPDATE gamificacao.recompensa_estoque_ajustes SET motivo = 'x'`,
          ),
        ).rejects.toThrow(/somente inserção/);
      });
    });

    it('rollback recusa descartar recompensas cadastradas', async () => {
      const qr = ds.createQueryRunner();
      try {
        await expect(
          new LojinhaRecompensas1792900000000().down(qr),
        ).rejects.toThrow(/Rollback recusado/);
      } finally {
        await qr.release();
      }
    });
  },
);

describe.skipIf(!URL_TESTE)(
  'LojinhaRecompensas converte o catálogo inicial',
  () => {
    const banco = 'recompensas_conversao';
    let ds: DataSource;

    afterAll(async () => {
      await ds?.destroy();
      if (URL_TESTE)
        await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
    });

    it('publicada vira status; estoque restante vira total + comprometido; resgates ficam na v1', async () => {
      await admin(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
      await admin(`CREATE DATABASE ${banco}`);
      const url = new URL(URL_TESTE!);
      url.pathname = `/${banco}`;
      ds = new DataSource({
        type: 'postgres',
        url: url.toString(),
        schema: 'feed',
        migrations: MIGRATIONS.slice(
          0,
          MIGRATIONS.indexOf(LojinhaRecompensas1792900000000),
        ),
        migrationsTableName: 'migrations',
        installExtensions: false,
      });
      await ds.initialize();
      await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
      await ds.runMigrations({ transaction: 'all' });
      const [{ id: uid }] = (await ds.query(
        `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
          `VALUES ('A', 'a@pucminas.edu.br', 'ES', 2, 'apadrinhado', 'aprovado') RETURNING id`,
      )) as Array<{ id: number }>;
      const [{ id: caneca }] = (await ds.query(
        `INSERT INTO gamificacao.recompensas (nome, descricao, custo_xp, estoque, condicoes_retirada, publicada) ` +
          `VALUES ('Caneca', 'Azul', 30, 4, 'Secretaria', true) RETURNING id`,
      )) as Array<{ id: string }>;
      await ds.query(
        `INSERT INTO gamificacao.recompensas (nome, descricao, custo_xp, estoque, condicoes_retirada) VALUES ('Adesivo', 'X', 5, NULL, 'Secretaria')`,
      );
      await ds.transaction(async (m) => {
        await registrarMovimentacao(m.queryRunner!, {
          usuarioId: uid,
          quantidade: 100,
          tipo: 'AJUSTE_ADMIN',
          referenciaTipo: null,
          referenciaId: null,
          descricao: 'crédito',
          chaveIdempotencia: 'c1',
        });
        const mov = await registrarMovimentacao(m.queryRunner!, {
          usuarioId: uid,
          quantidade: -30,
          tipo: 'RECOMPENSA',
          referenciaTipo: 'RESGATE',
          referenciaId: 'r1',
          descricao: 'Resgate: Caneca',
          chaveIdempotencia: 'c2',
        });
        await m.query(
          `INSERT INTO gamificacao.resgates (id, usuario_id, recompensa_id, movimentacao_id, chave_idempotencia, nome, descricao, custo_xp, condicoes_retirada) ` +
            `VALUES ($1, $2, $3, $4, $5, 'Caneca', 'Azul', 30, 'Secretaria')`,
          [randomUUID(), uid, caneca, mov.movimentacaoId, randomUUID()],
        );
      });

      const migracao = new LojinhaRecompensas1792900000000();
      const qr = ds.createQueryRunner();
      try {
        await qr.startTransaction();
        await migracao.up(qr);
        await qr.commitTransaction();
      } finally {
        await qr.release();
      }
      const linhas = await ds.query(
        `SELECT nome, status, estoque_ilimitado, estoque_total, estoque_comprometido, versao FROM gamificacao.recompensas ORDER BY nome`,
      );
      expect(linhas).toEqual([
        {
          nome: 'Adesivo',
          status: 'rascunho',
          estoque_ilimitado: true,
          estoque_total: null,
          estoque_comprometido: 0,
          versao: 1,
        },
        {
          nome: 'Caneca',
          status: 'publicada',
          estoque_ilimitado: false,
          estoque_total: 5,
          estoque_comprometido: 1,
          versao: 1,
        },
      ]);
      const [{ versao }] = await ds.query(
        `SELECT versao FROM gamificacao.resgates`,
      );
      expect(versao).toBe(1);
      const [{ n }] = await ds.query(
        `SELECT (SELECT count(*) FROM gamificacao.recompensa_versoes) + (SELECT count(*) FROM gamificacao.recompensa_estoque_ajustes) AS n`,
      );
      expect(Number(n)).toBe(4);

      // Sem histórico novo, o rollback volta ao formato inicial.
      const qr2 = ds.createQueryRunner();
      try {
        await migracao.down(qr2);
      } finally {
        await qr2.release();
      }
      const voltou = await ds.query(
        `SELECT nome, estoque, publicada FROM gamificacao.recompensas ORDER BY nome`,
      );
      expect(voltou).toEqual([
        { nome: 'Adesivo', estoque: null, publicada: false },
        { nome: 'Caneca', estoque: 4, publicada: true },
      ]);
    });
  },
);
