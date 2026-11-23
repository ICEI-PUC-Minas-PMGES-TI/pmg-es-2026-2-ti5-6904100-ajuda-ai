/**
 * Entrega/cancelamento de resgates (F29) e saldo/ajustes de XP (F26) contra
 * PostgreSQL REAL. Pulado sem MAPA_TEST_DB_URL; mesmo procedimento de
 * test/recompensas.integration.spec.ts (banco `resgates_xp_api`, apagado ao fim).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { DataSource, type MigrationInterface } from 'typeorm';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { registrarMovimentacao } from '../src/gamificacao/gamificacao.js';
import { LojinhaController } from '../src/gamificacao/lojinha/lojinha.controller.js';
import { LojinhaService } from '../src/gamificacao/lojinha/lojinha.service.js';
import { RecompensasAdminController } from '../src/gamificacao/recompensas/recompensas-admin.controller.js';
import { RecompensasAdminService } from '../src/gamificacao/recompensas/recompensas-admin.service.js';
import { ResgatesAdminController } from '../src/gamificacao/resgates/resgates-admin.controller.js';
import { ResgatesAdminService } from '../src/gamificacao/resgates/resgates-admin.service.js';
import { XpAdminController } from '../src/gamificacao/xp/xp-admin.controller.js';
import { XpAdminService } from '../src/gamificacao/xp/xp-admin.service.js';
import { XpController } from '../src/gamificacao/xp/xp.controller.js';
import { XpService } from '../src/gamificacao/xp/xp.service.js';
import { BaselineFeed1791900000000 } from '../src/migrations/1791900000000-BaselineFeed.js';
import { UsuariosERequisitosPadrinho1791944105933 } from '../src/migrations/1791944105933-UsuariosERequisitosPadrinho.js';
import { HabilitaPostgisESchemaMapa1792263378656 } from '../src/migrations/1792263378656-HabilitaPostgisESchemaMapa.js';
import { CriaTabelasMapa1792263378657 } from '../src/migrations/1792263378657-CriaTabelasMapa.js';
import { PucStopsEXpGlobal1792279161187 } from '../src/migrations/1792279161187-PucStopsEXpGlobal.js';
import { LojinhaResgates1792800000000 } from '../src/migrations/1792800000000-LojinhaResgates.js';
import { LojinhaRecompensas1792900000000 } from '../src/migrations/1792900000000-LojinhaRecompensas.js';
import { CodigoResgates1793500000000 } from '../src/migrations/1793500000000-CodigoResgates.js';
import { GamificacaoNiveisMoedasCiclos1794000000000 } from '../src/migrations/1794000000000-GamificacaoNiveisMoedasCiclos.js';
import { permissoesPeloToken } from './helpers/permissoes.js';
import { EntregaResgatesEAjustesXp1794200000000 } from '../src/migrations/1794200000000-EntregaResgatesEAjustesXp.js';
import { ProgramaRecompensasFk1794100000000 } from '../src/migrations/1794100000000-ProgramaRecompensasFk.js';
import { ResgatesProgramaDaTroca1794300000000 } from '../src/migrations/1794300000000-ResgatesProgramaDaTroca.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-de-teste-resgates-xp';
const BANCO = 'resgates_xp_api';
const MIGRATIONS: Array<new () => MigrationInterface> = [
  BaselineFeed1791900000000,
  UsuariosERequisitosPadrinho1791944105933,
  HabilitaPostgisESchemaMapa1792263378656,
  CriaTabelasMapa1792263378657,
  PucStopsEXpGlobal1792279161187,
  LojinhaResgates1792800000000,
  LojinhaRecompensas1792900000000,
  CodigoResgates1793500000000,
  GamificacaoNiveisMoedasCiclos1794000000000,
  ProgramaRecompensasFk1794100000000,
  EntregaResgatesEAjustesXp1794200000000,
  ResgatesProgramaDaTroca1794300000000,
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

interface ResgateAdmin {
  id: string;
  codigo: string;
  situacao: string;
  participante: { id: number; nome: string; email: string };
  recompensa: { id: string; nome: string };
  programa: { codigo: string | null; inferido: boolean };
  custoXp: number;
  resgatadoEm: string;
  entregueEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  responsavel: { id: number | null; email: string | null } | null;
}

interface PaginaResgates {
  itens: ResgateAdmin[];
  proximoCursor: string | null;
  contagem: Record<string, number>;
}

describe.skipIf(!URL_TESTE)(
  'Entrega de resgates (F29) e ajustes de XP (F26) com banco real',
  () => {
    let ds: DataSource;
    let app: INestApplication;
    let jwt: JwtService;
    let alunoId = 0;
    let outroId = 0;
    let coordId = 0;
    const http = () => request(app.getHttpServer());

    const coord = () =>
      `Bearer ${jwt.sign({ sub: String(coordId), email: 'coord@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;
    /** Coordenador mockado: fora de `usuarios`. */
    const mock = () =>
      `Bearer ${jwt.sign({ sub: '3', email: 'renata@pucminas.edu.br', perfil: 'coordenador', escopo: 'acesso' })}`;
    const aluno = () =>
      `Bearer ${jwt.sign({ sub: String(alunoId), email: 'aluno@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' })}`;
    const outro = () =>
      `Bearer ${jwt.sign({ sub: String(outroId), email: 'outro@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' })}`;

    async function creditar(usuarioId: number, quantidade: number) {
      await ds.transaction(async (m) => {
        await registrarMovimentacao(m.queryRunner!, {
          usuarioId,
          quantidade,
          tipo: 'PUCSTOP_CLAIM',
          referenciaTipo: null,
          referenciaId: null,
          descricao: 'crédito de teste',
          chaveIdempotencia: `teste-credito-${randomUUID()}`,
        });
      });
    }

    /** Recompensa publicada, com estoque limitado. */
    async function recompensa(
      custoXp = 100,
      estoqueInicial = 5,
      extra: object = {},
    ): Promise<string> {
      const { body } = await http()
        .post('/coordenacao/recompensas')
        .set('Authorization', mock())
        .send({
          nome: `Caneca ${randomUUID().slice(0, 6)}`,
          descricao: 'Caneca do programa.',
          custoXp,
          condicoesRetirada: 'Retirar na coordenação.',
          estoqueIlimitado: false,
          estoqueInicial,
          publicar: true,
          ...extra,
        })
        .expect(201);
      return (body as { id: string }).id;
    }

    async function resgatar(id: string, auth = aluno()): Promise<string> {
      const visto = await http()
        .get(`/me/lojinha/${id}`)
        .set('Authorization', auth)
        .expect(200);
      const { versao, custoXp } = visto.body as {
        versao: number;
        custoXp: number;
      };
      const { body } = await http()
        .post(`/me/lojinha/${id}/resgatar`)
        .set('Authorization', auth)
        .send({ chaveIdempotencia: randomUUID(), versao, custoXp })
        .expect(201);
      return (body as { id: string }).id;
    }

    const estoque = async (id: string) =>
      (
        (
          await http()
            .get(`/coordenacao/recompensas/${id}`)
            .set('Authorization', mock())
            .expect(200)
        ).body as { estoque: { comprometido: number; disponivel: number } }
      ).estoque;
    const saldo = async (auth = aluno()) =>
      (await http().get('/me/xp').set('Authorization', auth).expect(200))
        .body as { saldo: number; moedas: number; xpAcumulado: number };
    const entregar = (id: string, auth = coord()) =>
      http()
        .post(`/coordenacao/resgates/${id}/entregar`)
        .set('Authorization', auth);
    const cancelar = (
      id: string,
      motivo: unknown = 'Aluno desistiu',
      auth = coord(),
    ) =>
      http()
        .post(`/coordenacao/resgates/${id}/cancelar`)
        .set('Authorization', auth)
        .send({ motivo });
    const listar = async (consulta = '') =>
      (
        await http()
          .get(`/coordenacao/resgates${consulta}`)
          .set('Authorization', coord())
          .expect(200)
      ).body as PaginaResgates;
    const ids = (pagina: PaginaResgates) => pagina.itens.map((r) => r.id);

    /** O saldo materializado é sempre a soma do ledger. */
    async function conferirLedger(usuarioId: number) {
      const [linha] = (await ds.query(
        `SELECT c.saldo, (SELECT COALESCE(sum(quantidade), 0)::int FROM gamificacao.xp_movimentacoes WHERE usuario_id = $1) AS soma ` +
          `FROM gamificacao.xp_carteiras c WHERE c.usuario_id = $1`,
        [usuarioId],
      )) as Array<{ saldo: number; soma: number }>;
      expect(linha.saldo).toBe(linha.soma);
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
      outroId = await inserir('Outra Aluna', 'outro@pucminas.edu.br');
      coordId = await inserir('Coordenação', 'coord@pucminas.edu.br');
      for (const email of ['aluno@pucminas.edu.br', 'outro@pucminas.edu.br']) {
        await ds.query(
          `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ($1, '2026/2', 'apadrinhado', 'em_andamento')`,
          [email],
        );
      }
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ('2026/2', 'Programa 2026/2', 'inscricoes')`,
      );

      const modulo = await Test.createTestingModule({
        imports: [JwtModule.register({ secret: SEGREDO })],
        controllers: [
          RecompensasAdminController,
          LojinhaController,
          ResgatesAdminController,
          XpController,
          XpAdminController,
        ],
        providers: [
          RecompensasAdminService,
          LojinhaService,
          ResgatesAdminService,
          XpService,
          XpAdminService,
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
      await creditar(alunoId, 1000);
      await creditar(outroId, 1000);
    });

    afterAll(async () => {
      await app?.close();
      await ds?.destroy();
      if (URL_TESTE)
        await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    });

    describe('F29: acompanhamento, entrega e cancelamento', () => {
      it('lista com participante, recompensa, custo, data e situação; filtra por situação e programa', async () => {
        const id = await recompensa(120, 5, { programaCodigo: '2026/2' });
        const resgateId = await resgatar(id);
        const pendentes = await listar('?situacao=aguardando_entrega');
        const item = pendentes.itens.find((r) => r.id === resgateId)!;
        expect(item).toMatchObject({
          situacao: 'aguardando_entrega',
          participante: { id: alunoId, nome: 'Aluno Teste' },
          recompensa: { id },
          programa: { codigo: '2026/2', inferido: false },
          custoXp: 120,
          entregueEm: null,
          canceladoEm: null,
          responsavel: null,
        });
        expect(Date.parse(item.resgatadoEm)).not.toBeNaN();
        expect(pendentes.contagem.aguardando_entrega).toBeGreaterThanOrEqual(1);

        expect(ids(await listar('?programa=2026%2F2'))).toEqual([resgateId]);
        expect(ids(await listar('?situacao=entregue'))).not.toContain(
          resgateId,
        );
        // Busca por código (sem diferenciar maiúsculas) e por recompensa.
        expect(
          ids(await listar(`?busca=${item.codigo.toLowerCase()}`)),
        ).toEqual([resgateId]);
        expect(ids(await listar('?busca=caneca'))).toContain(resgateId);

        for (const invalida of [
          '?situacao=perdido',
          '?cursor=@@',
          `?cursor=${Buffer.from('ontem|x').toString('base64url')}`,
          '?limite=0',
          '?limite=201',
          '?programa=2026%2F2&semPrograma=true',
        ]) {
          await http()
            .get(`/coordenacao/resgates${invalida}`)
            .set('Authorization', coord())
            .expect(400);
        }
      });

      it('pendente seguido de 200 entregas continua na fila, na busca e na contagem; o cursor percorre tudo', async () => {
        const [{ id: filaId }] = (await ds.query(
          `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
            `VALUES ('Fila Teste', 'fila@pucminas.edu.br', 'ES', 2, 'apadrinhado', 'aprovado') RETURNING id`,
        )) as Array<{ id: number }>;
        await ds.query(
          `INSERT INTO feed.participacoes (usuario_id, programa, papel, status) VALUES ('fila@pucminas.edu.br', '2026/2', 'apadrinhado', 'em_andamento')`,
        );
        await creditar(filaId, 1000);
        const fila = () =>
          `Bearer ${jwt.sign({ sub: String(filaId), email: 'fila@pucminas.edu.br', perfil: 'apadrinhado', escopo: 'acesso' })}`;
        const brinde = await recompensa(1, 300);

        const pendente = await resgatar(brinde, fila());
        for (let i = 0; i < 200; i++) {
          await entregar(await resgatar(brinde, fila())).expect(200);
        }

        // Sem nenhum outro filtro: a situação é aplicada antes do limite.
        expect(
          ids(await listar('?situacao=aguardando_entrega&limite=200')),
        ).toContain(pendente);
        const { codigo } = (
          await http()
            .get(`/coordenacao/resgates/${pendente}`)
            .set('Authorization', coord())
            .expect(200)
        ).body as ResgateAdmin;
        expect(ids(await listar(`?busca=${codigo}`))).toEqual([pendente]);

        const doBrinde = `recompensaId=${brinde}`;
        const pendentes = await listar(
          `?${doBrinde}&situacao=aguardando_entrega`,
        );
        expect(ids(pendentes)).toEqual([pendente]);
        expect(pendentes.contagem).toEqual({
          todos: 201,
          aguardando_entrega: 1,
          entregue: 200,
          cancelado: 0,
        });

        const vistos: string[] = [];
        let cursor: string | null = null;
        let paginas = 0;
        do {
          const pagina = await listar(
            `?${doBrinde}&limite=50${cursor ? `&cursor=${cursor}` : ''}`,
          );
          vistos.push(...ids(pagina));
          cursor = pagina.proximoCursor;
          paginas++;
        } while (cursor);
        expect(paginas).toBe(5);
        expect(new Set(vistos).size).toBe(201);
        expect(vistos.at(-1)).toBe(pendente);
      }, 180_000);

      it('o programa da troca fica no resgate: editar a recompensa não move o histórico; aberta conta no programa do aluno', async () => {
        await ds.query(
          `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ('2027/1', 'Programa 2027/1', 'inscricoes') ON CONFLICT DO NOTHING`,
        );
        const restrita = await recompensa(10, 5, { programaCodigo: '2026/2' });
        const antigo = await resgatar(restrita);
        const visto = await http()
          .get(`/coordenacao/recompensas/${restrita}`)
          .set('Authorization', mock())
          .expect(200);
        await http()
          .patch(`/coordenacao/recompensas/${restrita}`)
          .set('Authorization', mock())
          .send({
            programaCodigo: '2027/1',
            atualizadoEm: (visto.body as { atualizadoEm: string }).atualizadoEm,
          })
          .expect(200);
        expect(ids(await listar('?programa=2026%2F2'))).toContain(antigo);
        expect(ids(await listar('?programa=2027%2F1'))).not.toContain(antigo);

        const aberta = await recompensa(10, 5);
        const daAberta = await resgatar(aberta);
        const detalhe = (
          await http()
            .get(`/coordenacao/resgates/${daAberta}`)
            .set('Authorization', coord())
            .expect(200)
        ).body as ResgateAdmin;
        expect(detalhe.programa).toEqual({ codigo: '2026/2', inferido: false });
        expect(ids(await listar('?programa=2026%2F2'))).toContain(daAberta);
        expect(ids(await listar('?semPrograma=true'))).not.toContain(daAberta);
      });

      it('motivo é medido depois de normalizado: curto vira 400, nunca 500', async () => {
        const id = await resgatar(await recompensa(10, 5));
        // ' a ' passava no MinLength(3) e estourava o CHECK; '😀a' tem
        // length 3 em UTF-16, mas char_length 2 no PostgreSQL.
        for (const motivo of [' a ', '  ab  ', '\n\tab\n', '😀a', 'a😀']) {
          await cancelar(id, motivo).expect(400);
        }
        const ok = await cancelar(id, '  Sem retirada  ').expect(200);
        expect((ok.body as ResgateAdmin).motivoCancelamento).toBe(
          'Sem retirada',
        );
      });

      it('conflito no UNIQUE responde 409 sem pedir outra conexão ao pool', async () => {
        const id = await resgatar(await recompensa(10, 5));
        await entregar(id).expect(200);
        const url = new URL(URL_TESTE!);
        url.pathname = `/${BANCO}`;
        // Pool de UMA conexão: se o tratamento do conflito pedir outra
        // (this.db.query) enquanto segura o QueryRunner, estoura o timeout.
        const pequeno = new DataSource({
          type: 'postgres',
          url: url.toString(),
          schema: 'feed',
          installExtensions: false,
          extra: { max: 1, connectionTimeoutMillis: 2000 },
        });
        await pequeno.initialize();
        try {
          const servico = new ResgatesAdminService(pequeno) as unknown as {
            emTransacao(
              id: string,
              tipo: string,
              corpo: () => Promise<void>,
            ): Promise<void>;
          };
          const violacao = Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'uq_resgate_desfechos_resgate',
          });
          await expect(
            servico.emTransacao(id, 'cancelado', () =>
              Promise.reject(violacao),
            ),
          ).rejects.toMatchObject({
            status: 409,
            response: { motivo: 'resgate-entregue' },
          });
        } finally {
          await pequeno.destroy();
        }
      });

      it('aluno não acessa as rotas da coordenação', async () => {
        await http()
          .get('/coordenacao/resgates')
          .set('Authorization', aluno())
          .expect(403);
      });

      it('entrega registra responsável e data; não entrega nem cancela de novo', async () => {
        const id = await recompensa(100, 3);
        const resgateId = await resgatar(id);
        const antes = await estoque(id);
        const { body } = await entregar(resgateId).expect(200);
        expect(body).toMatchObject({
          situacao: 'entregue',
          responsavel: { id: coordId, email: 'coord@pucminas.edu.br' },
          canceladoEm: null,
        });
        expect(Date.parse((body as ResgateAdmin).entregueEm!)).not.toBeNaN();
        // A unidade entregue continua comprometida (saiu do estoque).
        expect(await estoque(id)).toEqual(antes);

        const denovo = await entregar(resgateId).expect(409);
        expect(denovo.body).toMatchObject({ motivo: 'resgate-entregue' });
        await cancelar(resgateId).expect(409);
        const n = (await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.resgate_desfechos WHERE resgate_id = $1`,
          [resgateId],
        )) as Array<{ n: number }>;
        expect(n[0].n).toBe(1);
      });

      it('cancelamento exige motivo, devolve o XP e a unidade, uma vez só', async () => {
        const id = await recompensa(150, 2);
        const inicial = await saldo();
        const resgateId = await resgatar(id);
        expect((await saldo()).saldo).toBe(inicial.saldo - 150);
        expect((await estoque(id)).disponivel).toBe(1);

        await cancelar(resgateId, '').expect(400);
        await cancelar(resgateId, null).expect(400);

        const { body } = await cancelar(
          resgateId,
          '  Recompensa danificada  ',
          mock(),
        ).expect(200);
        expect(body).toMatchObject({
          situacao: 'cancelado',
          motivoCancelamento: 'Recompensa danificada',
          responsavel: { id: null, email: 'renata@pucminas.edu.br' },
        });
        expect((await saldo()).saldo).toBe(inicial.saldo);
        expect(await estoque(id)).toMatchObject({
          comprometido: 0,
          disponivel: 2,
        });

        const denovo = await cancelar(resgateId).expect(409);
        expect(denovo.body).toMatchObject({ motivo: 'resgate-cancelado' });
        await entregar(resgateId).expect(409);
        expect((await saldo()).saldo).toBe(inicial.saldo);
        await conferirLedger(alunoId);

        const extrato = await http()
          .get('/me/xp/movimentacoes')
          .set('Authorization', aluno())
          .expect(200);
        expect(
          (
            extrato.body as Array<{
              quantidade: number;
              descricao: string;
              referencia: unknown;
            }>
          )[0],
        ).toMatchObject({
          quantidade: 150,
          referencia: { tipo: 'RESGATE', id: resgateId },
        });
      });

      it('cancelamentos simultâneos estornam uma vez só', async () => {
        const id = await recompensa(90, 4);
        const resgateId = await resgatar(id);
        const antes = (await saldo()).saldo;
        const respostas = await Promise.all(
          Array.from({ length: 4 }, () => cancelar(resgateId)),
        );
        expect(respostas.map((r) => r.status).sort()).toEqual([
          200, 409, 409, 409,
        ]);
        expect((await saldo()).saldo).toBe(antes + 90);
        expect((await estoque(id)).comprometido).toBe(0);
        await conferirLedger(alunoId);
      });

      it('entrega e cancelamento simultâneos: só um desfecho', async () => {
        const id = await recompensa(80, 4);
        const resgateId = await resgatar(id);
        const antes = (await saldo()).saldo;
        const [a, b] = await Promise.all([
          entregar(resgateId),
          cancelar(resgateId),
        ]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        const depois = (await saldo()).saldo;
        expect(depois).toBe(b.status === 200 ? antes + 80 : antes);
        await conferirLedger(alunoId);
      });

      it('aluno vê a situação só nos próprios resgates', async () => {
        const id = await recompensa(50, 5);
        const meu = await resgatar(id);
        const dela = await resgatar(id, outro());
        await entregar(meu).expect(200);
        await cancelar(dela, 'Sem retirada no prazo').expect(200);

        const historico = await http()
          .get('/me/lojinha/resgates')
          .set('Authorization', aluno())
          .expect(200);
        const ids = (historico.body as Array<{ id: string }>).map((r) => r.id);
        expect(ids).toContain(meu);
        expect(ids).not.toContain(dela);
        expect(
          (historico.body as Array<{ id: string; situacao: string }>).find(
            (r) => r.id === meu,
          ),
        ).toMatchObject({ situacao: 'entregue' });

        const comprovante = await http()
          .get(`/me/lojinha/resgates/${dela}`)
          .set('Authorization', outro())
          .expect(200);
        expect(comprovante.body).toMatchObject({
          situacao: 'cancelado',
          motivoCancelamento: 'Sem retirada no prazo',
        });
        await http()
          .get(`/me/lojinha/resgates/${dela}`)
          .set('Authorization', aluno())
          .expect(404);
      });

      it('desfechos não podem ser editados nem apagados', async () => {
        await expect(
          ds.query(`UPDATE gamificacao.resgate_desfechos SET motivo = 'x'`),
        ).rejects.toThrow();
        await expect(
          ds.query(`DELETE FROM gamificacao.resgate_desfechos`),
        ).rejects.toThrow();
      });

      it('404 para resgate inexistente', async () => {
        await entregar(randomUUID()).expect(404);
        await cancelar(randomUUID()).expect(404);
        await http()
          .get(`/coordenacao/resgates/${randomUUID()}`)
          .set('Authorization', coord())
          .expect(404);
      });
    });

    describe('F26: saldo, extrato e ajustes de XP', () => {
      it('XP acumulado separado das moedas; resgate e estorno só mexem nas moedas', async () => {
        // Resgates gastaram moedas; o XP acumulado (nível) não cai.
        const r = await saldo();
        expect(r.xpAcumulado).toBe(1000);
        expect(r.moedas).toBe(r.saldo);
        expect(r.saldo).toBeLessThan(1000);
      });

      it('ajuste credita com motivo e responsável, preservando os lançamentos', async () => {
        const antes = await saldo(outro());
        const chave = randomUUID();
        const envio = () =>
          http()
            .post(`/coordenacao/xp/${outroId}/ajustes`)
            .set('Authorization', coord())
            .send({
              quantidade: 40,
              motivo: 'Participação no mutirão',
              chaveIdempotencia: chave,
            });
        const { body } = await envio().expect(201);
        expect(body).toMatchObject({
          saldo: antes.saldo + 40,
          xpAcumulado: antes.xpAcumulado + 40,
          ajuste: {
            quantidade: 40,
            motivo: 'Participação no mutirão',
            responsavel: { id: coordId, email: 'coord@pucminas.edu.br' },
            saldoApos: antes.saldo + 40,
          },
        });
        // Repetir o mesmo envio não lança de novo.
        const repetido = await envio().expect(201);
        expect((repetido.body as { ajuste: { id: string } }).ajuste.id).toBe(
          (body as { ajuste: { id: string } }).ajuste.id,
        );
        const depois = await saldo(outro());
        expect(depois.saldo).toBe(antes.saldo + 40);
        expect(depois.xpAcumulado).toBe(antes.xpAcumulado + 40);
        await conferirLedger(outroId);
      });

      it('mesma chave em outro participante: 409', async () => {
        const chave = randomUUID();
        await http()
          .post(`/coordenacao/xp/${outroId}/ajustes`)
          .set('Authorization', coord())
          .send({ quantidade: 5, motivo: 'Bônus', chaveIdempotencia: chave })
          .expect(201);
        await http()
          .post(`/coordenacao/xp/${alunoId}/ajustes`)
          .set('Authorization', coord())
          .send({ quantidade: 5, motivo: 'Bônus', chaveIdempotencia: chave })
          .expect(409);
      });

      it('mesma chave com outro motivo ou quantidade: 409; mesmos dados (motivo normalizado) devolvem o ajuste já feito', async () => {
        const chave = randomUUID();
        const enviar = (corpo: object) =>
          http()
            .post(`/coordenacao/xp/${outroId}/ajustes`)
            .set('Authorization', coord())
            .send({ chaveIdempotencia: chave, ...corpo });
        const primeiro = await enviar({
          quantidade: 7,
          motivo: 'Monitoria extra',
        }).expect(201);
        const ajuste = (
          primeiro.body as { ajuste: { id: string; chaveIdempotencia: string } }
        ).ajuste;
        expect(ajuste.chaveIdempotencia).toBe(chave);

        const outroMotivo = await enviar({
          quantidade: 7,
          motivo: 'Outro motivo',
        }).expect(409);
        expect(outroMotivo.body).toMatchObject({ motivo: 'chave-reutilizada' });
        await enviar({ quantidade: 8, motivo: 'Monitoria extra' }).expect(409);

        const repetido = await enviar({
          quantidade: 7,
          motivo: '  Monitoria extra ',
        }).expect(201);
        expect((repetido.body as { ajuste: { id: string } }).ajuste.id).toBe(
          ajuste.id,
        );
        const [{ n }] = (await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.xp_movimentacoes WHERE chave_idempotencia = $1`,
          [`ajuste:${chave}`],
        )) as Array<{ n: number }>;
        expect(n).toBe(1);
        await conferirLedger(outroId);
      });

      it('corrida com a mesma chave: participantes diferentes dão 201 e 409 (nunca 500); o mesmo pedido credita uma vez', async () => {
        for (let rodada = 0; rodada < 5; rodada++) {
          const corpo = {
            quantidade: 3,
            motivo: 'Corrida',
            chaveIdempotencia: randomUUID(),
          };
          const respostas = await Promise.all(
            [outroId, alunoId].map((u) =>
              http()
                .post(`/coordenacao/xp/${u}/ajustes`)
                .set('Authorization', coord())
                .send(corpo),
            ),
          );
          expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
        }

        const corpo = {
          quantidade: 2,
          motivo: 'Reenvio',
          chaveIdempotencia: randomUUID(),
        };
        const respostas = await Promise.all(
          Array.from({ length: 6 }, () =>
            http()
              .post(`/coordenacao/xp/${outroId}/ajustes`)
              .set('Authorization', coord())
              .send(corpo),
          ),
        );
        expect(respostas.map((r) => r.status)).toEqual(Array(6).fill(201));
        expect(
          new Set(
            respostas.map(
              (r) => (r.body as { ajuste: { id: string } }).ajuste.id,
            ),
          ).size,
        ).toBe(1);
        const [{ n }] = (await ds.query(
          `SELECT count(*)::int AS n FROM gamificacao.xp_movimentacoes WHERE chave_idempotencia = $1`,
          [`ajuste:${corpo.chaveIdempotencia}`],
        )) as Array<{ n: number }>;
        expect(n).toBe(1);
        await conferirLedger(outroId);
        await conferirLedger(alunoId);
      });

      it('débito não deixa o saldo negativo', async () => {
        const [{ id: pobreId }] = (await ds.query(
          `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
            `VALUES ('Pouco Saldo', 'pouco@pucminas.edu.br', 'ES', 2, 'apadrinhado', 'aprovado') RETURNING id`,
        )) as Array<{ id: number }>;
        await creditar(pobreId, 30);
        const r = await http()
          .post(`/coordenacao/xp/${pobreId}/ajustes`)
          .set('Authorization', coord())
          .send({
            quantidade: -31,
            motivo: 'Correção de crédito duplicado',
            chaveIdempotencia: randomUUID(),
          })
          .expect(422);
        expect(r.body).toMatchObject({ motivo: 'saldo-insuficiente' });
        const ok = await http()
          .post(`/coordenacao/xp/${pobreId}/ajustes`)
          .set('Authorization', coord())
          .send({
            quantidade: -10,
            motivo: 'Correção de crédito duplicado',
            chaveIdempotencia: randomUUID(),
          })
          .expect(201);
        expect(ok.body).toMatchObject({ saldo: 20, xpAcumulado: 20 });
      });

      it('valida quantidade, motivo e participante', async () => {
        const enviar = (usuario: number, corpo: object) =>
          http()
            .post(`/coordenacao/xp/${usuario}/ajustes`)
            .set('Authorization', coord())
            .send({ chaveIdempotencia: randomUUID(), ...corpo });
        await enviar(outroId, { quantidade: 0, motivo: 'Zero' }).expect(400);
        await enviar(outroId, { quantidade: 10, motivo: '  ' }).expect(400);
        // Medido depois de normalizado e em pontos de código (como o CHECK).
        await enviar(outroId, { quantidade: 10, motivo: ' a ' }).expect(400);
        await enviar(outroId, { quantidade: 10, motivo: '😀a' }).expect(400);
        await enviar(outroId, { quantidade: 10 }).expect(400);
        await enviar(outroId, { quantidade: 1.5, motivo: 'Meio' }).expect(400);
        // Teto individual do ajuste (LIMITES.ajusteAdmin = 200).
        await enviar(outroId, { quantidade: 201, motivo: 'Demais' }).expect(
          400,
        );
        await enviar(outroId, { quantidade: -201, motivo: 'Demais' }).expect(
          400,
        );
        await enviar(999999, { quantidade: 10, motivo: 'Ninguém' }).expect(404);
        await http()
          .post(`/coordenacao/xp/${outroId}/ajustes`)
          .set('Authorization', aluno())
          .send({
            quantidade: 10,
            motivo: 'Eu mesmo',
            chaveIdempotencia: randomUUID(),
          })
          .expect(403);
      });

      it('coordenação consulta saldo, extrato e ajustes do participante', async () => {
        const { body } = await http()
          .get(`/coordenacao/xp/${outroId}`)
          .set('Authorization', coord())
          .expect(200);
        const extrato = body as {
          usuario: { id: number };
          saldo: number;
          moedas: number;
          xpAcumulado: number;
          nivel: { numero: number };
          movimentacoes: Array<{ tipo: string; saldoApos: number }>;
          ajustes: Array<{ motivo: string }>;
        };
        expect(extrato.usuario.id).toBe(outroId);
        expect(extrato.moedas).toBe(extrato.saldo);
        expect(extrato.nivel.numero).toBeGreaterThanOrEqual(1);
        expect(extrato.movimentacoes[0].saldoApos).toBe(extrato.saldo);
        expect(extrato.movimentacoes.map((m) => m.tipo)).toContain(
          'AJUSTE_ADMIN',
        );
        expect(extrato.ajustes.map((a) => a.motivo)).toContain(
          'Participação no mutirão',
        );

        const lista = await http()
          .get('/coordenacao/xp?busca=outra')
          .set('Authorization', coord())
          .expect(200);
        expect(lista.body).toEqual([
          expect.objectContaining({
            usuario: expect.objectContaining({ id: outroId }),
            moedas: extrato.saldo,
            xpAcumulado: extrato.xpAcumulado,
            nivel: expect.objectContaining({ numero: extrato.nivel.numero }),
          }),
        ]);
        await http()
          .get('/coordenacao/xp/999999')
          .set('Authorization', coord())
          .expect(404);
      });

      it('ajustes não podem ser editados nem apagados', async () => {
        await expect(
          ds.query(`UPDATE gamificacao.xp_ajustes SET quantidade = 1`),
        ).rejects.toThrow();
        await expect(
          ds.query(`DELETE FROM gamificacao.xp_ajustes`),
        ).rejects.toThrow();
      });
    });

    it('rollback da migration recusa descartar histórico', async () => {
      const qr = ds.createQueryRunner();
      try {
        await expect(
          new EntregaResgatesEAjustesXp1794200000000().down(qr),
        ).rejects.toThrow(/Rollback recusado/);
      } finally {
        await qr.release();
      }
    });
  },
);
