import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import {
  DataSource,
  getMetadataArgsStorage,
  type MigrationInterface,
} from 'typeorm';
import { EncontrosPresencaService } from '../src/encontros/encontros-presenca.service.js';
import { EncontrosController } from '../src/encontros/encontros.controller.js';
import { EncontrosService } from '../src/encontros/encontros.service.js';
import { ACAO_XP_ENCONTRO } from '../src/encontros/encontros.js';
import {
  SCHEMA_GAMIFICACAO,
  travarCarteira,
} from '../src/gamificacao/gamificacao.js';
import { creditarGanho } from '../src/gamificacao/ganhos.js';
import { MissoesAdminService } from '../src/gamificacao/missoes/missoes-admin.service.js';
import { MissoesService } from '../src/gamificacao/missoes/missoes.service.js';
import { PucStopsAdminService } from '../src/gamificacao/pucstops/pucstops-admin.service.js';
import { RegrasXpService } from '../src/gamificacao/regras-xp/regras-xp.service.js';
import { importarSnapshot } from '../src/mapa/importacao/importar-snapshot.js';
import { validarSnapshot } from '../src/mapa/importacao/snapshot.js';
import { schemaPostgis } from '../src/mapa/postgis.js';
import { CriaEncontros1795400000000 } from '../src/migrations/1795400000000-CriaEncontros.js';
import { LocalDoEncontro1795700000000 } from '../src/migrations/1795700000000-LocalDoEncontro.js';
import { notificacaoEncontroAlterado } from '../src/notificacoes/notificacoes.js';
import { NotificacoesService } from '../src/notificacoes/notificacoes.service.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { permissoesPeloToken } from './helpers/permissoes.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const BANCO = `encontros_api_${process.pid}`;
const CICLO = ParticipacoesService.programaAtual();
const MIN = 60 * 1000;
const COORDENADORA = 'renata@pucminas.edu.br';

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

const MAPA = validarSnapshot(
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

async function admin(sql: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: URL_TESTE });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

describe.skipIf(!URL_TESTE)('Encontros com banco real', () => {
  let ds: DataSource;
  let encontros: EncontrosService;
  let presencas: EncontrosPresencaService;
  let regras: RegrasXpService;
  let bancoCriado = false;
  let padrinho = 0;
  let apadrinhado = 0;
  let outroAluno = 0;
  let terceiro = 0;
  let totem = { id: '', latitude: 0, longitude: 0 };

  async function novoUsuario(
    nome: string,
    papel: 'padrinho' | 'apadrinhado',
  ): Promise<{ id: number; participacao: number }> {
    const email = `${nome.toLowerCase()}@pucminas.edu.br`;
    const [{ id }] = (await ds.query(
      `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
        `VALUES ($1, $2, 'Engenharia de Software', $3, $4, 'aprovado') RETURNING id`,
      [nome, email, papel === 'apadrinhado' ? 1 : 5, papel],
    )) as Array<{ id: number }>;
    const [{ id: participacao }] = (await ds.query(
      `INSERT INTO feed.participacoes (usuario_id, programa, papel, status, respostas) ` +
        `VALUES ($1, $2, $3, 'em_andamento', $4) RETURNING id`,
      [email, CICLO, papel, JSON.stringify({ nome })],
    )) as Array<{ id: number }>;
    return { id, participacao };
  }

  beforeAll(async () => {
    await admin(`CREATE DATABASE ${BANCO}`);
    bancoCriado = true;
    ds = new DataSource({
      type: 'postgres',
      url: urlDo(BANCO),
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
    await importarSnapshot(ds, MAPA, { ativar: true });

    regras = new RegrasXpService(ds);
    const notificacoes = new NotificacoesService(ds);
    encontros = new EncontrosService(ds, notificacoes);
    presencas = new EncontrosPresencaService(
      ds,
      regras,
      notificacoes,
      new MissoesService(ds, notificacoes),
    );

    const pucstops = new PucStopsAdminService(ds);
    const predio = MAPA.predios[0];
    const [longitude, latitude] = predio.localizacao.coordinates;
    const criado = await pucstops.criar(
      {
        nome: 'PucStop do Encontro',
        latitude,
        longitude,
        xp: 10,
        raioMetros: 30,
      },
      null,
    );
    totem = { id: criado.id, latitude, longitude };

    const p = await novoUsuario('Thiago', 'padrinho');
    const a = await novoUsuario('Camila', 'apadrinhado');
    const o = await novoUsuario('Bruno', 'apadrinhado');
    const t = await novoUsuario('Carla', 'apadrinhado');
    padrinho = p.id;
    apadrinhado = a.id;
    outroAluno = o.id;
    terceiro = t.id;

    const [{ id: programaId }] = (await ds.query(
      `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ($1, $1, 'andamento') RETURNING id`,
      [CICLO],
    )) as Array<{ id: number }>;
    await ds.query(
      `INSERT INTO feed.matching_vinculos (programa_id, padrinho_participacao_id, apadrinhado_participacao_id, origem) ` +
        `VALUES ($1, $2, $3, 'manual')`,
      [programaId, p.participacao, a.participacao],
    );
    await ds.query(
      `INSERT INTO feed.matching_vinculos (programa_id, padrinho_participacao_id, apadrinhado_participacao_id, origem) ` +
        `VALUES ($1, $2, $3, 'manual')`,
      [programaId, p.participacao, t.participacao],
    );
  });

  async function creditosDoCiclo(usuarioId: number): Promise<number> {
    const [{ total }] = (await ds.query(
      `SELECT count(*)::int AS total FROM "${SCHEMA_GAMIFICACAO}"."xp_movimentacoes" ` +
        `WHERE "usuario_id" = $1 AND "referencia_tipo" = $2`,
      [usuarioId, ACAO_XP_ENCONTRO],
    )) as Array<{ total: number }>;
    return total;
  }

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    if (bancoCriado) await admin(`DROP DATABASE ${BANCO} WITH (FORCE)`);
  });

  const agora = () => Date.now();
  const noLocal = () => ({
    latitude: totem.latitude,
    longitude: totem.longitude,
    accuracy: 8,
  });

  function dadosDoEncontro(deslocamentoMin = -10) {
    const inicio = agora() + deslocamentoMin * MIN;
    return {
      pucstopId: totem.id,
      inicio: new Date(inicio).toISOString(),
      fim: new Date(inicio + 60 * MIN).toISOString(),
      apadrinhadoIds: [apadrinhado],
    };
  }

  it('protege encontros agendados e seus convites no rollback sem presenças', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro(120));
    const qr = ds.createQueryRunner();
    try {
      await expect(new CriaEncontros1795400000000().down(qr)).rejects.toThrow(
        'encontros e seus convites ou presenças seriam descartados',
      );
      await expect(new LocalDoEncontro1795700000000().down(qr)).rejects.toThrow(
        'locais aceitos nos encontros seriam descartados',
      );
      expect((await encontros.detalhe(padrinho, criado.id)).convites).toEqual([
        expect.objectContaining({ usuarioId: apadrinhado, presenteEm: null }),
      ]);
    } finally {
      await qr.release();
    }
  });

  it('recusa convidar quem não tem vínculo com o padrinho', async () => {
    await expect(
      encontros.criar(padrinho, {
        ...dadosDoEncontro(),
        apadrinhadoIds: [outroAluno],
      }),
    ).rejects.toMatchObject({
      response: { motivo: 'nao-vinculado' },
    });
  });

  it('marca, aceita, confirma os dois lados e credita o XP uma única vez', async () => {
    await regras.criar(
      { acao: ACAO_XP_ENCONTRO, valorXp: 25, elegibilidade: 'todos' },
      COORDENADORA,
    );
    const [{ id: regraId }] = (await ds.query(
      `SELECT "id" FROM "${SCHEMA_GAMIFICACAO}"."regras_xp" WHERE "acao" = $1`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ id: number }>;
    await regras.definirAtivo(regraId, true);

    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    expect(criado.convites).toHaveLength(1);
    expect(criado.convites[0].resposta).toBe('pendente');

    await expect(
      presencas.confirmar(apadrinhado, criado.id, noLocal()),
    ).rejects.toMatchObject({ response: { motivo: 'convite-nao-aceito' } });

    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });

    const doPadrinho = await presencas.confirmar(
      padrinho,
      criado.id,
      noLocal(),
    );
    expect(doPadrinho.encontroRealizado).toBe(false);
    expect(doPadrinho.xpGanho).toBe(0);

    const doApadrinhado = await presencas.confirmar(
      apadrinhado,
      criado.id,
      noLocal(),
    );
    expect(doApadrinhado.encontroRealizado).toBe(true);
    expect(doApadrinhado.xpGanho).toBe(25);

    const movimentacoes = (await ds.query(
      `SELECT "usuario_id", "xp_quantidade" FROM "${SCHEMA_GAMIFICACAO}"."xp_movimentacoes" ` +
        `WHERE "referencia_tipo" = $1 ORDER BY "usuario_id"`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ usuario_id: number; xp_quantidade: number }>;
    expect(movimentacoes).toEqual([
      { usuario_id: padrinho, xp_quantidade: 25 },
      { usuario_id: apadrinhado, xp_quantidade: 25 },
    ]);

    const repetida = await presencas.confirmar(
      apadrinhado,
      criado.id,
      noLocal(),
    );
    expect(repetida.encontroRealizado).toBe(true);
    const [{ total }] = (await ds.query(
      `SELECT count(*)::int AS total FROM "${SCHEMA_GAMIFICACAO}"."xp_movimentacoes" ` +
        `WHERE "referencia_tipo" = $1`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ total: number }>;
    expect(total).toBe(2);
  });

  it('não deixa mudar data depois da presença, mas deixa cancelar', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });
    await presencas.confirmar(padrinho, criado.id, noLocal());

    await expect(
      encontros.editar(padrinho, criado.id, {
        inicio: new Date(agora() + 2 * 60 * MIN).toISOString(),
        fim: new Date(agora() + 3 * 60 * MIN).toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { motivo: 'encontro-com-presenca' },
    });

    const cancelado = await encontros.cancelar(
      padrinho,
      criado.id,
      'thiago@pucminas.edu.br',
    );
    expect(cancelado.status).toBe('cancelado');
    const [{ total }] = (await ds.query(
      `SELECT count(*)::int AS total FROM feed."encontro_presencas" WHERE "encontro_id" = $1`,
      [criado.id],
    )) as Array<{ total: number }>;
    expect(total).toBe(1);
  });

  it('reabre os convites ao reagendar um encontro ainda sem presença', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro(120));
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });

    const remarcado = await encontros.editar(padrinho, criado.id, {
      inicio: new Date(agora() + 180 * MIN).toISOString(),
      fim: new Date(agora() + 240 * MIN).toISOString(),
    });

    expect(remarcado.convites[0].resposta).toBe('pendente');
    expect(remarcado.convites[0].respondidoEm).toBeNull();
  });

  it('mantém o encontro quando o PucStop é desativado depois', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro(120));
    const pucstops = new PucStopsAdminService(ds);
    await pucstops.definirAtivo(totem.id, false);
    try {
      const visto = await encontros.detalhe(apadrinhado, criado.id);
      expect(visto.local.ativo).toBe(false);
      expect(visto.status).toBe('agendado');
      await expect(
        encontros.criar(padrinho, dadosDoEncontro(120)),
      ).rejects.toMatchObject({ response: { motivo: 'pucstop-inativo' } });
    } finally {
      await pucstops.definirAtivo(totem.id, true);
    }
  });

  it('mantém o local aceito mesmo se o PucStop for movido antes do check-in', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });
    const geo = await schemaPostgis((sql, p) => ds.query(sql, p));
    const atualizarLocal = (nome: string, longitude: number) =>
      ds.query(
        `UPDATE mapa.pucstops SET nome = $2, localizacao = ${geo}.ST_SetSRID(${geo}.ST_MakePoint($3, $4), 4326) WHERE id = $1`,
        [totem.id, nome, longitude, totem.latitude],
      );
    try {
      await atualizarLocal('PucStop transferido', totem.longitude + 0.003);
      expect((await encontros.detalhe(apadrinhado, criado.id)).local.nome).toBe(
        criado.local.nome,
      );
      expect(
        await presencas.confirmar(apadrinhado, criado.id, noLocal()),
      ).toMatchObject({
        encontroRealizado: false,
        confirmadoEm: expect.any(String),
      });
    } finally {
      await atualizarLocal(criado.local.nome, totem.longitude);
    }
  });

  it('somente o organizador vê respostas e presenças dos outros convidados', async () => {
    const criado = await encontros.criar(padrinho, {
      ...dadosDoEncontro(),
      apadrinhadoIds: [apadrinhado, terceiro],
    });
    await encontros.responder(terceiro, criado.id, { resposta: 'aceito' });
    await presencas.confirmar(terceiro, criado.id, noLocal());

    const organizador = await encontros.detalhe(padrinho, criado.id);
    expect(organizador.convites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          usuarioId: apadrinhado,
          resposta: 'pendente',
        }),
        expect.objectContaining({
          usuarioId: terceiro,
          resposta: 'aceito',
          presenteEm: expect.any(String),
        }),
      ]),
    );
    const detalhe = await encontros.detalhe(apadrinhado, criado.id);
    const lista = (await encontros.listar(apadrinhado)).find(
      (e) => e.id === criado.id,
    );
    expect(detalhe.convites).toEqual([
      expect.objectContaining({ usuarioId: apadrinhado, presenteEm: null }),
    ]);
    expect(lista?.convites).toEqual(detalhe.convites);
  });

  it('cada remarcação concorrente retorna e grava o próprio horário', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro(120));
    const primeiraData = dadosDoEncontro(180);
    const segundaData = dadosDoEncontro(240);
    let entrou!: () => void;
    let liberar!: () => void;
    const naLeitura = new Promise<void>((resolve) => {
      entrou = resolve;
    });
    const podeLer = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const detalhe = encontros.detalhe.bind(encontros);
    const leitura = vi
      .spyOn(encontros, 'detalhe')
      .mockImplementationOnce(async (...args) => {
        entrou();
        await podeLer;
        return detalhe(...args);
      });
    const primeira = encontros.editar(padrinho, criado.id, primeiraData);
    let segunda: typeof primeira | undefined;
    try {
      await Promise.race([naLeitura, primeira]);
      segunda = encontros.editar(padrinho, criado.id, segundaData);
      await esperarTravaDeEncontro();
      liberar();
      const alterados = await Promise.all([primeira, segunda]);
      expect(alterados.map((e) => e.inicio)).toEqual([
        primeiraData.inicio,
        segundaData.inicio,
      ]);
      const avisos = await ds.query(
        `SELECT mensagem, chave FROM feed.notificacoes
         WHERE usuario_id = $1 AND tipo = 'ENCONTRO_ALTERADO' AND link = $2 ORDER BY criado_em`,
        [apadrinhado, `/encontros/${criado.id}`],
      );
      expect(avisos.map((a: { mensagem: string }) => a.mensagem)).toEqual(
        alterados.map(
          (e) =>
            notificacaoEncontroAlterado(
              { id: e.id, inicio: new Date(e.inicio), local: e.local.nome },
              '',
            ).mensagem,
        ),
      );
      expect(avisos[0].chave).not.toBe(avisos[1].chave);
    } finally {
      liberar();
      await Promise.allSettled([primeira, segunda]);
      leitura.mockRestore();
    }
  });

  it('recusa presença de convite recusado em corrida com a trava', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });
    const qr = ds.createQueryRunner();
    await qr.startTransaction();
    try {
      await qr.query(`SELECT id FROM feed.encontros WHERE id = $1 FOR UPDATE`, [
        criado.id,
      ]);
      await qr.query(
        `UPDATE feed.encontro_convites SET resposta = 'recusado' WHERE encontro_id = $1`,
        [criado.id],
      );
      const pendente = presencas
        .confirmar(apadrinhado, criado.id, noLocal())
        .catch((erro: unknown) => erro);
      await esperarTravaDeEncontro();
      await qr.commitTransaction();
      expect(await pendente).toMatchObject({
        response: { motivo: 'convite-nao-aceito' },
      });
    } finally {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      await qr.release();
    }
    const [{ total }] = (await ds.query(
      `SELECT count(*)::int AS total FROM feed."encontro_presencas" WHERE "encontro_id" = $1`,
      [criado.id],
    )) as Array<{ total: number }>;
    expect(total).toBe(0);
  });

  async function esperarTravaDeEncontro() {
    for (let tentativa = 0; tentativa < 100; tentativa++) {
      const [{ esperando }] = (await ds.query(
        `SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE $1
        ) AS esperando`,
        ['%"encontros" WHERE "id" = $1 FOR UPDATE%'],
      )) as Array<{ esperando: boolean }>;
      if (esperando) return;
      await new Promise((resolver) => setTimeout(resolver, 10));
    }
    throw new Error('A operação não aguardou a trava do encontro.');
  }

  it('uma recusa iniciada durante a confirmação aguarda e preserva a presença', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });
    const qr = ds.createQueryRunner();
    await qr.startTransaction();
    try {
      await qr.query(`SELECT id FROM feed.encontros WHERE id = $1 FOR UPDATE`, [
        criado.id,
      ]);
      await qr.query(
        `INSERT INTO feed.encontro_presencas (encontro_id, usuario_id, distancia_metros) VALUES ($1, $2, 0)`,
        [criado.id, apadrinhado],
      );
      const pendente = encontros
        .responder(apadrinhado, criado.id, { resposta: 'recusado' })
        .catch((erro: unknown) => erro);
      await esperarTravaDeEncontro();
      await qr.commitTransaction();
      expect(await pendente).toMatchObject({
        response: { motivo: 'encontro-em-andamento' },
      });
      const depois = await encontros.detalhe(apadrinhado, criado.id);
      expect(depois.meuConvite).toMatchObject({
        resposta: 'aceito',
        presenteEm: expect.any(String),
      });
    } finally {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      await qr.release();
    }
  });

  it('confirmações simultâneas da mesma dupla não entram em deadlock', async () => {
    const a = await encontros.criar(padrinho, dadosDoEncontro());
    const b = await encontros.criar(padrinho, dadosDoEncontro(-5));
    for (const encontro of [a, b]) {
      await encontros.responder(apadrinhado, encontro.id, {
        resposta: 'aceito',
      });
    }
    await presencas.confirmar(padrinho, a.id, noLocal());
    await presencas.confirmar(apadrinhado, b.id, noLocal());

    const [umA, umB] = await Promise.all([
      presencas.confirmar(apadrinhado, a.id, noLocal()),
      presencas.confirmar(padrinho, b.id, noLocal()),
    ]);
    expect(umA.encontroRealizado).toBe(true);
    expect(umB.encontroRealizado).toBe(true);
  });

  it('respeita limiteRepeticoes sob confirmações concorrentes', async () => {
    const antes = await creditosDoCiclo(padrinho);
    const [{ id: regraId }] = (await ds.query(
      `SELECT "id" FROM "${SCHEMA_GAMIFICACAO}"."regras_xp" WHERE "acao" = $1`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ id: number }>;
    await regras.atualizar(
      regraId,
      { valorXp: 25, elegibilidade: 'padrinho', limiteRepeticoes: antes + 1 },
      COORDENADORA,
    );
    const a = await encontros.criar(padrinho, dadosDoEncontro());
    const b = await encontros.criar(padrinho, {
      ...dadosDoEncontro(-5),
      apadrinhadoIds: [terceiro],
    });
    for (const [encontro, aluno] of [
      [a, apadrinhado],
      [b, terceiro],
    ] as const) {
      await encontros.responder(aluno, encontro.id, {
        resposta: 'aceito',
      });
      await presencas.confirmar(padrinho, encontro.id, noLocal());
    }
    await Promise.all([
      presencas.confirmar(apadrinhado, a.id, noLocal()),
      presencas.confirmar(terceiro, b.id, noLocal()),
    ]);

    expect(await creditosDoCiclo(padrinho)).toBe(antes + 1);
    await regras.atualizar(
      regraId,
      { valorXp: 25, elegibilidade: 'todos', limiteRepeticoes: null },
      COORDENADORA,
    );
  });

  it('ativar a regra depois não paga quem confirmou antes', async () => {
    const [{ id: regraId }] = (await ds.query(
      `SELECT "id" FROM "${SCHEMA_GAMIFICACAO}"."regras_xp" WHERE "acao" = $1`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ id: number }>;
    await regras.definirAtivo(regraId, false);

    const criado = await encontros.criar(padrinho, {
      ...dadosDoEncontro(),
      apadrinhadoIds: [apadrinhado, terceiro],
    });
    for (const quem of [apadrinhado, terceiro]) {
      await encontros.responder(quem, criado.id, { resposta: 'aceito' });
    }
    await presencas.confirmar(padrinho, criado.id, noLocal());
    await presencas.confirmar(apadrinhado, criado.id, noLocal());

    await regras.definirAtivo(regraId, true);
    const depois = await presencas.confirmar(terceiro, criado.id, noLocal());

    expect(depois.xpGanho).toBeGreaterThan(0);
    const pagos = (await ds.query(
      `SELECT "usuario_id" FROM "${SCHEMA_GAMIFICACAO}"."xp_movimentacoes" ` +
        `WHERE "referencia_id" LIKE $1 ORDER BY "usuario_id"`,
      [`${criado.id}%`],
    )) as Array<{ usuario_id: number }>;
    expect(pagos.map((p) => p.usuario_id)).toEqual([terceiro]);
  });

  it('recusa presença fora da janela do encontro', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro(600));
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });

    await expect(
      presencas.confirmar(apadrinhado, criado.id, noLocal()),
    ).rejects.toMatchObject({ response: { motivo: 'fora-da-janela' } });
  });

  it('recusa presença longe do PucStop', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });

    await expect(
      presencas.confirmar(apadrinhado, criado.id, {
        latitude: totem.latitude + 0.01,
        longitude: totem.longitude,
        accuracy: 8,
      }),
    ).rejects.toMatchObject({ response: { motivo: 'fora-do-local' } });
  });

  it('recusa presença e XP depois que o vínculo ou a participação termina', async () => {
    const criado = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, criado.id, { resposta: 'aceito' });
    const vinculo = `UPDATE feed.matching_vinculos SET ativo = $1
      WHERE apadrinhado_participacao_id = (
        SELECT p.id FROM feed.participacoes p JOIN feed.usuarios u ON lower(u.email) = lower(p.usuario_id)
        WHERE u.id = $2)`;
    const termino = `UPDATE feed.participacoes p SET termino_em = $1
      FROM feed.usuarios u WHERE lower(u.email) = lower(p.usuario_id) AND u.id = $2`;
    const etapa = `UPDATE feed.programas SET etapa_atual = $1 WHERE codigo = $2`;
    const antes = await creditosDoCiclo(apadrinhado);
    try {
      await ds.query(etapa, ['encerramento', CICLO]);
      for (const usuario of [padrinho, apadrinhado]) {
        await expect(
          presencas.confirmar(usuario, criado.id, noLocal()),
        ).rejects.toMatchObject({ response: { motivo: 'nao-vinculado' } });
      }
      await ds.query(etapa, ['andamento', CICLO]);

      await ds.query(
        `UPDATE feed.encontros SET programa = '2025/2' WHERE id = $1`,
        [criado.id],
      );
      await expect(
        presencas.confirmar(padrinho, criado.id, noLocal()),
      ).rejects.toMatchObject({ response: { motivo: 'nao-vinculado' } });
      await ds.query(`UPDATE feed.encontros SET programa = $2 WHERE id = $1`, [
        criado.id,
        CICLO,
      ]);

      await ds.query(termino, [new Date(), padrinho]);
      await expect(
        presencas.confirmar(padrinho, criado.id, noLocal()),
      ).rejects.toMatchObject({ response: { motivo: 'nao-vinculado' } });
      await ds.query(termino, [null, padrinho]);

      await presencas.confirmar(padrinho, criado.id, noLocal());
      await ds.query(vinculo, [false, apadrinhado]);
      await expect(
        presencas.confirmar(apadrinhado, criado.id, noLocal()),
      ).rejects.toMatchObject({
        status: 403,
        response: { motivo: 'nao-vinculado' },
      });
      const [{ total }] = (await ds.query(
        `SELECT count(*)::int AS total FROM feed.encontro_presencas WHERE encontro_id = $1`,
        [criado.id],
      )) as Array<{ total: number }>;
      expect(total).toBe(1);
      expect(await creditosDoCiclo(apadrinhado)).toBe(antes);
    } finally {
      await ds.query(etapa, ['andamento', CICLO]);
      await ds.query(termino, [null, padrinho]);
      await ds.query(vinculo, [true, apadrinhado]);
      await encontros.cancelar(padrinho, criado.id, 'teste@pucminas.edu.br');
    }
  });

  it('respeita o contrato HTTP e reenvia a presença gravada após a janela', async () => {
    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'segredo-teste-encontros' })],
      controllers: [EncontrosController],
      providers: [
        { provide: DataSource, useValue: ds },
        { provide: EncontrosService, useValue: encontros },
        { provide: EncontrosPresencaService, useValue: presencas },
        permissoesPeloToken(),
      ],
    }).compile();
    const app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    try {
      await app.init();
      const token = modulo.get(JwtService).sign({
        sub: String(padrinho),
        email: 'thiago@pucminas.edu.br',
        perfil: 'padrinho',
      });
      const http = request(app.getHttpServer());
      const autenticado = { Authorization: `Bearer ${token}` };
      const base = '/me/encontros';
      const candidatos = await http
        .get(`${base}/apadrinhados`)
        .set(autenticado)
        .expect(200);
      expect(candidatos.body).toEqual(
        expect.arrayContaining([{ id: apadrinhado, nome: 'Camila' }]),
      );
      await http
        .post(base)
        .set(autenticado)
        .send({ ...dadosDoEncontro(), pucstopId: 'inválido' })
        .expect(400);
      const proibido = await http
        .post(base)
        .set(autenticado)
        .send({
          ...dadosDoEncontro(),
          apadrinhadoIds: [outroAluno],
        })
        .expect(403);
      expect(proibido.body.motivo).toBe('nao-vinculado');
      const criado = await http
        .post(base)
        .set(autenticado)
        .send(dadosDoEncontro())
        .expect(201);
      const id = criado.body.id as string;
      expect(criado.body).toMatchObject({
        podeConfirmarPresenca: true,
        podeRemarcar: true,
      });
      const rota = `${base}/${id}/presenca`;
      const semGps = await http
        .post(rota)
        .set(autenticado)
        .send({})
        .expect(422);
      expect(semGps.body.motivo).toBe('localizacao-obrigatoria');
      const alunoForaDoCiclo = (sub: number, email: string) =>
        `Bearer ${modulo.get(JwtService).sign({ sub: String(sub), email, perfil: 'nenhuma' })}`;
      const foraDoCiclo = {
        Authorization: alunoForaDoCiclo(padrinho, 'thiago@pucminas.edu.br'),
      };
      const visitante = {
        Authorization: alunoForaDoCiclo(outroAluno, 'bruno@pucminas.edu.br'),
      };
      await http.post(rota).set(visitante).send(noLocal()).expect(404);
      await http
        .post(`${base}/${id}/responder`)
        .set(
          'Authorization',
          alunoForaDoCiclo(apadrinhado, 'camila@pucminas.edu.br'),
        )
        .send({ resposta: 'aceito' })
        .expect(200);
      const primeira = await http
        .post(rota)
        .set(foraDoCiclo)
        .send(noLocal())
        .expect(200);
      await ds.query(
        `UPDATE feed.encontros SET inicio=now()-interval '4 hours', fim=now()-interval '3 hours' WHERE id=$1`,
        [id],
      );
      const repetida = await http
        .post(rota)
        .set(foraDoCiclo)
        .send({})
        .expect(200);
      expect(repetida.body.confirmadoEm).toEqual(primeira.body.confirmadoEm);
      await http.post(`${base}/${id}/cancelar`).set(foraDoCiclo).expect(200);
    } finally {
      await app.close();
    }
  });

  it.each([
    { combinavelCom: [], xp: 70, xpEncontro: 0 },
    { combinavelCom: ['MISSAO_ENCONTRO'], xp: 120, xpEncontro: 50 },
  ])(
    'conclui a missão no check-in e credita $xp XP conforme a combinação',
    async ({ combinavelCom, xp, xpEncontro }) => {
      const [{ id: regraId }] = (await ds.query(
        `SELECT id FROM gamificacao.regras_xp WHERE acao = $1`,
        [ACAO_XP_ENCONTRO],
      )) as Array<{ id: number }>;
      await regras.atualizar(
        regraId,
        { valorXp: 50, elegibilidade: 'todos', combinavelCom },
        COORDENADORA,
      );
      const adminMissoes = new MissoesAdminService(ds);
      const missao = await adminMissoes.criar(
        {
          titulo: 'Realizar encontro',
          descricao: 'Confirme presença.',
          tipo: 'UNICA',
          xp: 70,
          requisito: 'ENCONTRO',
          ativar: true,
        },
        null,
      );

      const aluno = combinavelCom.length === 0 ? terceiro : apadrinhado;
      const evento = await encontros.criar(padrinho, {
        ...dadosDoEncontro(),
        apadrinhadoIds: [aluno],
      });
      await encontros.responder(aluno, evento.id, { resposta: 'aceito' });
      await presencas.confirmar(padrinho, evento.id, noLocal());
      const primeira = await ds.query(
        `SELECT 1 FROM gamificacao.missoes_conclusoes WHERE missao_id = $1`,
        [missao.id],
      );
      expect(primeira).toEqual([]);
      const resposta = await presencas.confirmar(aluno, evento.id, noLocal());
      expect(resposta).toMatchObject({
        encontroRealizado: true,
        xpGanho: xpEncontro,
      });
      const conclusoes = await ds.query(
        `SELECT usuario_id, xp_creditado, evidencia->>'encontroId' AS encontro_id
       FROM gamificacao.missoes_conclusoes WHERE missao_id = $1 ORDER BY usuario_id`,
        [missao.id],
      );
      expect(conclusoes).toEqual(
        [padrinho, aluno].map((id) => ({
          usuario_id: id,
          xp_creditado: 70,
          encontro_id: evento.id,
        })),
      );
      const valores = await ds.query(
        `SELECT usuario_id, sum(xp_quantidade)::int AS xp FROM gamificacao.xp_movimentacoes
       WHERE referencia_id = $1 OR referencia_id LIKE $2 GROUP BY usuario_id ORDER BY usuario_id`,
        [missao.id, `${evento.id}%`],
      );
      expect(valores).toEqual(
        [padrinho, aluno].map((id) => ({ usuario_id: id, xp })),
      );
      const avisos = await ds.query(
        `SELECT DISTINCT usuario_id FROM feed.notificacoes WHERE tipo = 'NIVEL_SUBIU' ORDER BY usuario_id`,
      );
      expect(avisos).toEqual(
        expect.arrayContaining([
          { usuario_id: padrinho },
          { usuario_id: aluno },
        ]),
      );
      await adminMissoes.definirAtiva(missao.id, false);
    },
  );

  it('compara XP efetivo quando o teto semanal corta a recompensa da missão', async () => {
    const qr = ds.createQueryRunner();
    await qr.startTransaction();
    try {
      for (const usuarioId of [padrinho, apadrinhado]) {
        await travarCarteira(qr, usuarioId);
        await creditarGanho(qr, {
          usuarioId,
          fonte: 'MISSAO',
          recorrenteSemanal: true,
          xp: 55,
          ciclo: CICLO,
          referenciaTipo: 'MISSAO_SEMANAL',
          referenciaId: 'teste-teto-semanal',
          descricao: 'Recompensa semanal anterior',
          chaveIdempotencia: `teste-teto-semanal:${usuarioId}`,
        });
      }
      await qr.commitTransaction();
    } finally {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      await qr.release();
    }

    const [{ id: regraId }] = (await ds.query(
      `SELECT id FROM gamificacao.regras_xp WHERE acao = $1`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ id: number }>;
    await regras.atualizar(
      regraId,
      { valorXp: 40, elegibilidade: 'todos', combinavelCom: [] },
      COORDENADORA,
    );
    const adminMissoes = new MissoesAdminService(ds);
    const semanal = await adminMissoes.criar(
      {
        titulo: 'Encontro da semana',
        descricao: 'Confirme presença.',
        tipo: 'SEMANAL',
        xp: 60,
        requisito: 'ENCONTRO',
        ativar: true,
      },
      null,
    );
    const evento = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, evento.id, { resposta: 'aceito' });
    await presencas.confirmar(padrinho, evento.id, noLocal());
    const resposta = await presencas.confirmar(
      apadrinhado,
      evento.id,
      noLocal(),
    );
    expect(resposta).toMatchObject({
      xpGanho: 40,
      xpConfigurado: 40,
      limiteAtingido: false,
    });
    const concluidas = await ds.query(
      `SELECT usuario_id, xp_creditado, semana IS NOT NULL AS semanal
       FROM gamificacao.missoes_conclusoes WHERE missao_id = $1 ORDER BY usuario_id`,
      [semanal.id],
    );
    expect(concluidas).toEqual(
      [padrinho, apadrinhado].map((usuario_id) => ({
        usuario_id,
        xp_creditado: 0,
        semanal: true,
      })),
    );
    await adminMissoes.definirAtiva(semanal.id, false);
  });

  it('aplica valor, elegibilidade e limite da regra de missão no check-in', async () => {
    const [{ id: regraEncontro }] = (await ds.query(
      `SELECT id FROM gamificacao.regras_xp WHERE acao = $1`,
      [ACAO_XP_ENCONTRO],
    )) as Array<{ id: number }>;
    await regras.definirAtivo(regraEncontro, false);
    const regra = await regras.criar(
      {
        acao: 'MISSAO_ENCONTRO',
        valorXp: 12,
        elegibilidade: 'padrinho',
        limiteRepeticoes: 1,
      },
      COORDENADORA,
    );
    await regras.definirAtivo(regra.id, true);
    const adminMissoes = new MissoesAdminService(ds);
    const missoes = new MissoesService(ds, new NotificacoesService(ds), regras);

    for (const [etapa, xp] of [
      [1, 12],
      [2, 0],
    ] as const) {
      const missao = await adminMissoes.criar(
        {
          titulo: `Missão de encontro ${etapa}`,
          descricao: 'Confirme presença.',
          tipo: 'UNICA',
          xp: 60,
          requisito: 'ENCONTRO',
          ativar: true,
        },
        null,
      );
      const padrinhoAcesso = {
        podePublicar: true,
        temPar: true,
        papel: 'padrinho',
      } as const;
      const alunoAcesso = {
        podePublicar: false,
        temPar: true,
        papel: 'apadrinhado',
      } as const;
      const [listaPadrinho, listaAluno] = await Promise.all([
        missoes.listar(padrinho, new Date(), padrinhoAcesso),
        missoes.listar(apadrinhado, new Date(), alunoAcesso),
      ]);
      expect(
        listaPadrinho.missoes.find((m) => m.id === missao.id),
      ).toMatchObject({
        xp: 12,
        xpPrevisto: xp,
        pronta: false,
      });
      expect(listaAluno.missoes.find((m) => m.id === missao.id)).toMatchObject({
        xp: 12,
        xpPrevisto: 0,
        pronta: false,
      });
      await expect(
        missoes.concluir(padrinho, missao.id, new Date(), {}, padrinhoAcesso),
      ).rejects.toMatchObject({ response: { motivo: 'presenca-necessaria' } });
      const evento = await encontros.criar(padrinho, dadosDoEncontro());
      await encontros.responder(apadrinhado, evento.id, { resposta: 'aceito' });
      await presencas.confirmar(padrinho, evento.id, noLocal());
      await presencas.confirmar(apadrinhado, evento.id, noLocal());
      const concluidas = await ds.query(
        `SELECT usuario_id, xp_configurado, xp_creditado, evidencia->'regraXpId' AS regra,
          evidencia->'regraXpVersao' AS versao FROM gamificacao.missoes_conclusoes
         WHERE missao_id = $1 ORDER BY usuario_id`,
        [missao.id],
      );
      expect(concluidas).toEqual([
        {
          usuario_id: padrinho,
          xp_configurado: 12,
          xp_creditado: xp,
          regra: regra.id,
          versao: 1,
        },
        {
          usuario_id: apadrinhado,
          xp_configurado: 12,
          xp_creditado: 0,
          regra: regra.id,
          versao: 1,
        },
      ]);
      await adminMissoes.definirAtiva(missao.id, false);
    }
  });
  it('regra MISSAO_ENCONTRO desativada volta a pagar o XP da própria missão', async () => {
    await ds.query(
      `UPDATE gamificacao.regras_xp SET ativo = false WHERE acao IN ($1, 'MISSAO_ENCONTRO')`,
      [ACAO_XP_ENCONTRO],
    );
    const desativada = await regras.criar(
      { acao: 'MISSAO_ENCONTRO', valorXp: 5, elegibilidade: 'padrinho' },
      COORDENADORA,
    );
    await regras.definirAtivo(desativada.id, false);
    const adminMissoes = new MissoesAdminService(ds);
    const missao = await adminMissoes.criar(
      {
        titulo: 'Encontro sem regra ativa',
        descricao: 'Confirme presença.',
        tipo: 'UNICA',
        xp: 60,
        requisito: 'ENCONTRO',
        ativar: true,
      },
      null,
    );
    const missoes = new MissoesService(ds, new NotificacoesService(ds), regras);
    const lista = await missoes.listar(apadrinhado, new Date(), {
      podePublicar: false,
      temPar: true,
      papel: 'apadrinhado',
    });
    expect(lista.missoes.find((m) => m.id === missao.id)).toMatchObject({
      xp: 60,
    });

    const evento = await encontros.criar(padrinho, dadosDoEncontro());
    await encontros.responder(apadrinhado, evento.id, { resposta: 'aceito' });
    await presencas.confirmar(padrinho, evento.id, noLocal());
    await presencas.confirmar(apadrinhado, evento.id, noLocal());
    const concluidas = (await ds.query(
      `SELECT usuario_id, xp_configurado, xp_creditado, evidencia->'regraXpId' AS regra
       FROM gamificacao.missoes_conclusoes WHERE missao_id = $1 ORDER BY usuario_id`,
      [missao.id],
    )) as Array<{
      usuario_id: number;
      xp_configurado: number;
      xp_creditado: number;
      regra: number | null;
    }>;
    expect(
      concluidas.map((c) => [c.usuario_id, c.xp_configurado, c.regra]),
    ).toEqual([
      [padrinho, 60, null],
      [apadrinhado, 60, null],
    ]);
    expect(concluidas.every((c) => c.xp_creditado > 0)).toBe(true);
    await adminMissoes.definirAtiva(missao.id, false);
  });
});
