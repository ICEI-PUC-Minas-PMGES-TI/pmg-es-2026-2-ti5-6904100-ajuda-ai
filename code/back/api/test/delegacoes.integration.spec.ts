import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import {
  DataSource,
  getMetadataArgsStorage,
  type MigrationInterface,
} from 'typeorm';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { DelegacaoGuard } from '../src/coordenacao/delegacoes/delegacao.guard.js';
import {
  DelegacoesController,
  MinhasDelegacoesController,
} from '../src/coordenacao/delegacoes/delegacoes.controller.js';
import { DelegacoesService } from '../src/coordenacao/delegacoes/delegacoes.service.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const BANCO = `delegacoes_api_${process.pid}`;
const SEGREDO = 'segredo-jwt-integracao-delegacoes';
const ROTA = '/coordenacao/alunos';
const COORDENADORA = 'renata@pucminas.edu.br';
const CICLO = ParticipacoesService.programaAtual();

const MIGRATIONS = Object.entries(
  import.meta.glob<Record<string, unknown>>('../src/migrations/*.ts', {
    eager: true,
  }),
)
  .filter(([arquivo]) => !arquivo.endsWith('.spec.ts'))
  .flatMap(([, modulo]) =>
    Object.values(modulo).filter(
      (v): v is new () => MigrationInterface =>
        typeof v === 'function' && /\d{13}$/.test(v.name),
    ),
  )
  .sort((a, b) => Number(a.name.slice(-13)) - Number(b.name.slice(-13)));

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
  const cliente = new pg.Client({ connectionString: URL_TESTE });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

describe.skipIf(!URL_TESTE)('Delegações com banco real', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  let servico: DelegacoesService;
  let guard: DelegacaoGuard;
  let endereco: string;
  let bancoCriado = false;
  let participante = 0;
  let soMapa = 0;

  const http = () => request(endereco);
  const coord = () =>
    `Bearer ${jwt.sign({ sub: '900001', email: COORDENADORA, perfil: 'coordenador', escopo: 'acesso' })}`;

  async function novoUsuario(
    nome: string,
    comParticipacao: boolean,
  ): Promise<number> {
    const email = `${nome.toLowerCase()}@pucminas.edu.br`;
    const [{ id }] = (await ds.query(
      `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
        `VALUES ($1, $2, 'Engenharia de Software', 3, 'padrinho', 'aprovado') RETURNING id`,
      [nome, email],
    )) as Array<{ id: number }>;
    if (comParticipacao) {
      await ds.query(
        `INSERT INTO feed.participacoes (usuario_id, programa, papel, status, respostas) ` +
          `VALUES ($1, $2, 'padrinho', 'em_andamento', $3)`,
        [email, CICLO, JSON.stringify({ nome })],
      );
    }
    return id;
  }

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${BANCO}`);
    bancoCriado = true;
    const url = new URL(URL_TESTE!);
    url.pathname = `/${BANCO}`;
    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      schema: 'feed',
      entities: ENTIDADES,
      migrations: MIGRATIONS,
      migrationsTableName: 'migrations',
      installExtensions: false,
    });
    await ds.initialize();
    await ds.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
    await ds.runMigrations({ transaction: 'all' });

    participante = await novoUsuario('Thiago', true);
    soMapa = await novoUsuario('Visitante', false);

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [DelegacoesController, MinhasDelegacoesController],
      providers: [
        DelegacoesService,
        DelegacaoGuard,
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    jwt = modulo.get(JwtService);
    servico = modulo.get(DelegacoesService);
    guard = modulo.get(DelegacaoGuard);
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    endereco = await app.getUrl();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (ds?.isInitialized) await ds.destroy();
    if (bancoCriado) await admin(`DROP DATABASE ${BANCO} WITH (FORCE)`);
  });

  it('lista inclusive quem não participa do ciclo vigente', async () => {
    const { body } = await http()
      .get(ROTA)
      .set('Authorization', coord())
      .expect(200);

    const nomes = (body as Array<{ nome: string }>).map((a) => a.nome);
    expect(nomes).toContain('Thiago');
    expect(nomes).toContain('Visitante');
    const visitante = (
      body as Array<{ nome: string; participacaoAtual: unknown }>
    ).find((a) => a.nome === 'Visitante');
    expect(visitante?.participacaoAtual).toBeNull();
  });

  it('busca por nome e por e-mail', async () => {
    const porNome = await http()
      .get(`${ROTA}?busca=thia`)
      .set('Authorization', coord())
      .expect(200);
    expect(porNome.body).toHaveLength(1);

    const porEmail = await http()
      .get(`${ROTA}?busca=visitante@pucminas`)
      .set('Authorization', coord())
      .expect(200);
    expect(porEmail.body).toHaveLength(1);
  });

  it('mostra uma linha por aluno e prioriza a participação em andamento', async () => {
    await ds.query(
      `INSERT INTO feed.participacoes (usuario_id, programa, papel, status, respostas)
       VALUES ($1, $2, 'candidato', 'pendente', '{}')`,
      ['thiago@pucminas.edu.br', CICLO],
    );
    const esperado = {
      id: participante,
      participacaoAtual: { papel: 'padrinho', status: 'em_andamento' },
    };
    const lista = await http()
      .get(`${ROTA}?busca=thiago`)
      .set('Authorization', coord())
      .expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject(esperado);
    const detalhe = await http()
      .get(`${ROTA}/${participante}`)
      .set('Authorization', coord())
      .expect(200);
    expect(detalhe.body).toMatchObject(esperado);
  });

  it('concede, recusa duplicata, revoga e guarda a auditoria inteira', async () => {
    await http()
      .post(`${ROTA}/${participante}/delegacoes`)
      .set('Authorization', coord())
      .send({ funcionalidade: 'mapa' })
      .expect(201);

    const duplicada = await http()
      .post(`${ROTA}/${participante}/delegacoes`)
      .set('Authorization', coord())
      .send({ funcionalidade: 'mapa' })
      .expect(409);
    expect(duplicada.body).toMatchObject({ motivo: 'ja-delegado' });

    const revogada = await http()
      .delete(`${ROTA}/${participante}/delegacoes/mapa`)
      .set('Authorization', coord())
      .expect(200);
    expect(revogada.body.delegacoes).toEqual([]);

    await http()
      .post(`${ROTA}/${participante}/delegacoes`)
      .set('Authorization', coord())
      .send({ funcionalidade: 'mapa' })
      .expect(201);

    const detalhe = await http()
      .get(`${ROTA}/${participante}`)
      .set('Authorization', coord())
      .expect(200);
    const historico = detalhe.body.historicoDelegacoes as Array<{
      concedidoPor: string;
      revogadoPor: string | null;
    }>;
    expect(historico).toHaveLength(2);
    expect(historico.every((d) => d.concedidoPor === COORDENADORA)).toBe(true);
    expect(
      historico.filter((d) => d.revogadoPor === COORDENADORA),
    ).toHaveLength(1);
  });

  it('revogar delegação inexistente é 404, não sucesso', async () => {
    await http()
      .delete(`${ROTA}/${soMapa}/delegacoes/chats`)
      .set('Authorization', coord())
      .expect(404);
  });

  it('recusa funcionalidade fora da lista', async () => {
    await http()
      .post(`${ROTA}/${participante}/delegacoes`)
      .set('Authorization', coord())
      .send({ funcionalidade: 'feed' })
      .expect(400);
    await http()
      .delete(`${ROTA}/${participante}/delegacoes/feed`)
      .set('Authorization', coord())
      .expect(404);
  });

  it('só a coordenação concede ou revoga', async () => {
    const aluno = `Bearer ${jwt.sign({ sub: String(participante), email: 'thiago@pucminas.edu.br', perfil: 'padrinho', escopo: 'acesso' })}`;
    await http().get(ROTA).set('Authorization', aluno).expect(403);
    await http()
      .post(`${ROTA}/${soMapa}/delegacoes`)
      .set('Authorization', aluno)
      .send({ funcionalidade: 'mapa' })
      .expect(403);
  });

  it('a delegação vale na rota marcada e some ao ser revogada', async () => {
    const token = jwt.sign({
      sub: String(participante),
      email: 'thiago@pucminas.edu.br',
      perfil: 'padrinho',
      escopo: 'acesso',
    });
    const minhas = () =>
      http().get('/me/delegacoes').set('Authorization', `Bearer ${token}`);
    await minhas().expect(200, ['mapa']);
    const pedido = (funcionalidade: string | undefined) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              sub: String(participante),
              email: 'thiago@pucminas.edu.br',
              perfil: 'padrinho',
            },
          }),
        }),
        getHandler: () => funcionalidade,
        getClass: () => funcionalidade,
      }) as never;
    const reflector = app.get(Reflector);
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation(
      (_chave, alvos) => (alvos as unknown[])[0] as never,
    );

    await expect(guard.canActivate(pedido('mapa'))).resolves.toBe(true);
    await expect(guard.canActivate(pedido('chats'))).rejects.toMatchObject({
      status: 403,
    });
    await expect(guard.canActivate(pedido(undefined))).rejects.toMatchObject({
      status: 403,
    });

    await servico.revogar(participante, 'mapa', COORDENADORA);
    await expect(guard.canActivate(pedido('mapa'))).rejects.toMatchObject({
      status: 403,
    });
    vi.restoreAllMocks();
    await minhas().expect(200, []);
  });
});
