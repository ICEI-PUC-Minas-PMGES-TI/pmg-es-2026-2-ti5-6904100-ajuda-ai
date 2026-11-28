import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { LIMITES } from '../src/gamificacao/economia.js';
import { SCHEMA_GAMIFICACAO } from '../src/gamificacao/gamificacao.js';
import { RegrasXpController } from '../src/gamificacao/regras-xp/regras-xp.controller.js';
import { RegrasXpService } from '../src/gamificacao/regras-xp/regras-xp.service.js';
import { RegrasXp1795300000000 } from '../src/migrations/1795300000000-RegrasXp.js';
import { RegrasXpPorPrograma1795900000000 } from '../src/migrations/1795900000000-RegrasXpPorPrograma.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const BANCO = `regras_xp_api_${process.pid}`;
const SEGREDO = 'segredo-jwt-integracao-regras-xp';
const ROTA = '/coordenacao/regras-xp';
const COORDENADORA = 'renata@pucminas.edu.br';
const OUTRA_COORDENADORA = 'beatriz@pucminas.edu.br';

async function admin(sql: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: URL_TESTE });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

describe.skipIf(!URL_TESTE)('Regras de XP com banco real', () => {
  let dados: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  let servico: RegrasXpService;
  let endereco: string;
  let bancoCriado = false;
  const http = () => request(endereco);
  const auth = (email = COORDENADORA, perfil = 'coordenador') =>
    `Bearer ${jwt.sign({ sub: email, email, perfil, escopo: 'acesso' })}`;

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${BANCO}`);
    bancoCriado = true;
    const url = new URL(URL_TESTE!);
    url.pathname = `/${BANCO}`;
    dados = new DataSource({
      type: 'postgres',
      url: url.toString(),
      migrations: [RegrasXp1795300000000, RegrasXpPorPrograma1795900000000],
    });
    await dados.initialize();
    await dados.query(`CREATE SCHEMA "${SCHEMA_GAMIFICACAO}"`);
    await dados.query(
      `CREATE SCHEMA feed; CREATE TABLE feed.programas (codigo varchar(20) PRIMARY KEY);
       INSERT INTO feed.programas VALUES ('2026/1'), ('2026/2')`,
    );
    await dados.runMigrations({ transaction: 'all' });

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [RegrasXpController],
      providers: [
        RegrasXpService,
        JwtAuthGuard,
        RolesGuard,
        { provide: DataSource, useValue: dados },
      ],
    }).compile();
    jwt = modulo.get(JwtService);
    servico = modulo.get(RegrasXpService);
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    endereco = await app.getUrl();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dados?.isInitialized) await dados.destroy();
    if (bancoCriado) await admin(`DROP DATABASE ${BANCO} WITH (FORCE)`);
  });

  it('cria rascunho, ativa, edita e reutiliza a regra desativada com o histórico intacto', async () => {
    const entrada = {
      acao: 'ENCONTRO_REALIZADO',
      valorXp: 40,
      elegibilidade: 'todos',
      limiteRepeticoes: 2,
      combinavelCom: ['MISSAO_VISITA'],
    };
    const criada = await http()
      .post(ROTA)
      .set('Authorization', auth())
      .send(entrada)
      .expect(201);
    const { id } = criada.body as { id: number };
    const rota = `${ROTA}/${id}`;
    const status = (ativo: boolean) =>
      http()
        .patch(`${rota}/status`)
        .set('Authorization', auth())
        .send({ ativo })
        .expect(200);

    expect(criada.body).toMatchObject({
      acao: entrada.acao,
      ativo: false,
      versaoAtual: 1,
      criadoPor: COORDENADORA,
      versao: { versao: 1, valorXp: 40, criadoPor: COORDENADORA },
    });
    await expect(servico.valorVigente(entrada.acao)).resolves.toBeNull();
    expect((await status(true)).body).toMatchObject({
      ativo: true,
      versaoAtual: 1,
    });
    await expect(servico.valorVigente(entrada.acao)).resolves.toEqual({
      regraId: id,
      versao: 1,
      valorXp: 40,
      elegibilidade: 'todos',
    });
    const duplicada = await http()
      .post(ROTA)
      .set('Authorization', auth())
      .send(entrada)
      .expect(409);
    expect(duplicada.body.motivo).toBe('acao-duplicada');

    const editada = await http()
      .patch(rota)
      .set('Authorization', auth(OUTRA_COORDENADORA))
      .send({ valorXp: 60, elegibilidade: 'padrinho', limiteRepeticoes: null })
      .expect(200);
    expect(editada.body.versao).toMatchObject({
      versao: 2,
      valorXp: 60,
      limiteRepeticoes: null,
      combinavelCom: entrada.combinavelCom,
      criadoPor: OUTRA_COORDENADORA,
    });
    const lista = await http()
      .get(ROTA)
      .set('Authorization', auth())
      .expect(200);
    expect(lista.body).toContainEqual(
      expect.objectContaining({
        id,
        acao: entrada.acao,
        ativo: true,
        versaoAtual: 2,
        versao: editada.body.versao,
      }),
    );
    await expect(servico.valorVigente(entrada.acao)).resolves.toEqual({
      regraId: id,
      versao: 2,
      valorXp: 60,
      elegibilidade: 'padrinho',
    });

    await status(false);
    await expect(servico.valorVigente(entrada.acao)).resolves.toBeNull();
    const reutilizada = await http()
      .post(ROTA)
      .set('Authorization', auth(OUTRA_COORDENADORA))
      .send({ acao: entrada.acao, valorXp: 20, elegibilidade: 'apadrinhado' })
      .expect(201);
    expect(reutilizada.body).toMatchObject({
      id,
      ativo: false,
      versaoAtual: 3,
      criadoPor: COORDENADORA,
      versao: {
        versao: 3,
        valorXp: 20,
        limiteRepeticoes: null,
        combinavelCom: [],
      },
    });
    const detalhe = await http()
      .get(rota)
      .set('Authorization', auth())
      .expect(200);
    expect(detalhe.body.versoes).toEqual([
      reutilizada.body.versao,
      editada.body.versao,
      criada.body.versao,
    ]);
  });

  it('regra do ciclo tem prioridade sobre a geral e desativar volta à geral', async () => {
    const acao = 'POR_CICLO';
    const criar = (corpo: Record<string, unknown>) =>
      http()
        .post(ROTA)
        .set('Authorization', auth())
        .send({ acao, elegibilidade: 'todos', ...corpo });
    const geral = (await criar({ valorXp: 10 }).expect(201)).body;
    const doCiclo = (
      await criar({ valorXp: 40, programa: '2026/2' }).expect(201)
    ).body;
    expect([geral.programa, doCiclo.programa]).toEqual([null, '2026/2']);
    for (const regra of [geral, doCiclo]) {
      await http()
        .patch(`${ROTA}/${regra.id}/status`)
        .set('Authorization', auth())
        .send({ ativo: true })
        .expect(200);
    }
    const vigente = async (programa: string) =>
      (await servico.configuracoesVigentes([acao], dados, programa)).map(
        (r) => [r.regraId, r.valorXp],
      );
    expect(await vigente('2026/2')).toEqual([[doCiclo.id, 40]]);
    expect(await vigente('2026/1')).toEqual([[geral.id, 10]]);

    const repetida = await criar({ valorXp: 50, programa: '2026/2' }).expect(
      409,
    );
    expect(repetida.body.motivo).toBe('acao-duplicada');
    await criar({ valorXp: 50, programa: '2025/2' }).expect(404);
    const invalido = await criar({ valorXp: 50, programa: '2026-2' }).expect(
      400,
    );
    expect(JSON.stringify(invalido.body.message)).toContain('AAAA/1');

    await http()
      .patch(`${ROTA}/${doCiclo.id}/status`)
      .set('Authorization', auth())
      .send({ ativo: false })
      .expect(200);
    expect(await vigente('2026/2')).toEqual([[geral.id, 10]]);

    const lista = (
      await http().get(ROTA).set('Authorization', auth()).expect(200)
    ).body as Array<{ id: number; acao: string; programa: string | null }>;
    expect(
      lista.filter((r) => r.acao === acao).map((r) => [r.id, r.programa]),
    ).toEqual([
      [geral.id, null],
      [doCiclo.id, '2026/2'],
    ]);
    const qr = dados.createQueryRunner();
    try {
      await expect(
        new RegrasXpPorPrograma1795900000000().down(qr),
      ).rejects.toThrow(
        'regras de XP de ciclos específicos seriam descartadas',
      );
    } finally {
      await qr.release();
    }
  });

  it('protege as rotas e retorna os erros padrão de validação e ausência', async () => {
    await http().get(ROTA).expect(401);
    await http()
      .get(ROTA)
      .set('Authorization', auth('ana@pucminas.edu.br', 'padrinho'))
      .expect(403);
    await http()
      .get(`${ROTA}/2147483647`)
      .set('Authorization', auth())
      .expect(404);
    await http()
      .patch(`${ROTA}/2147483647`)
      .set('Authorization', auth())
      .send({ valorXp: 10, elegibilidade: 'todos' })
      .expect(404);
    await http()
      .patch(`${ROTA}/2147483647/status`)
      .set('Authorization', auth())
      .send({ ativo: true })
      .expect(404);
    await http()
      .patch(`${ROTA}/1/status`)
      .set('Authorization', auth())
      .send({ ativo: 'true' })
      .expect(400);
    await http()
      .post(ROTA)
      .set('Authorization', auth())
      .send({ acao: 'VISITA', valorXp: 0, elegibilidade: 'todos' })
      .expect(400);
    await http()
      .post(ROTA)
      .set('Authorization', auth())
      .send({
        acao: 'MISSAO_VISITA',
        valorXp: LIMITES.porMissao + 1,
        elegibilidade: 'todos',
      })
      .expect(400);
    await http()
      .post(ROTA)
      .set('Authorization', auth())
      .send({
        acao: 'VISITA',
        valorXp: 10,
        elegibilidade: 'todos',
        limiteRepeticoes: 0,
      })
      .expect(400);
    await http().delete(`${ROTA}/1`).set('Authorization', auth()).expect(404);
  });

  it('serializa duas edições simultâneas da mesma regra', async () => {
    const criada = await http()
      .post(ROTA)
      .set('Authorization', auth())
      .send({ acao: 'VISITA', valorXp: 10, elegibilidade: 'todos' })
      .expect(201);
    const rota = `${ROTA}/${criada.body.id}`;
    const editadas = await Promise.all(
      [20, 30].map((valorXp) =>
        http()
          .patch(rota)
          .set('Authorization', auth())
          .send({ valorXp, elegibilidade: 'todos' })
          .expect(200),
      ),
    );
    expect(editadas.map((r) => r.body.versaoAtual).sort()).toEqual([2, 3]);
    const detalhe = await http()
      .get(rota)
      .set('Authorization', auth())
      .expect(200);
    expect(
      detalhe.body.versoes.map((v: { versao: number }) => v.versao),
    ).toEqual([3, 2, 1]);
    expect(
      detalhe.body.versoes.map((v: { valorXp: number }) => v.valorXp).sort(),
    ).toEqual([10, 20, 30]);
  });
});
