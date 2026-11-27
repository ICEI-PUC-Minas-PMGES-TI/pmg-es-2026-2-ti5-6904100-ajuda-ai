/// <reference types="vite/client" />
import { VinculosService } from '../src/matching/vinculos.service.js';
/**
 * Missões e notificações contra PostgreSQL/PostGIS REAL, sem dublês:
 *
 * - todas as migrations do projeto e a versão real `pucmaps-12` do mapa;
 * - participação lida da tabela `participacoes` pelos serviços de verdade,
 *   duplas com vínculo manual da coordenação e chat criado pelo ChatService;
 * - toda ação que uma missão exige é feita pelo módulo dono dela: totem
 *   coletado pela rota com geofence, post/comentário/curtida pelo
 *   PublicacoesService, mensagem pela rota do chat, evento criado pelo
 *   EventosService num prédio real;
 * - servidor HTTP escutando numa porta, com o ValidationPipe do main.ts.
 *
 * Pulado sem MAPA_TEST_DB_URL (banco `missoes_api`, apagado ao fim):
 *
 *   MAPA_TEST_DB_URL=postgres://postgres:postgres@localhost:55432/postgres \
 *     npx vitest run test/missoes-notificacoes.integration.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import pg from 'pg';
import request from 'supertest';
import {
  DataSource,
  getMetadataArgsStorage,
  type MigrationInterface,
} from 'typeorm';
import { AuthService } from '../src/auth/auth.service.js';
import type { AccessTokenPayload } from '../src/auth/authenticated-request.js';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard.js';
import { MicrosoftTokenVerifier } from '../src/auth/microsoft-token.verifier.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { AvisoEntity } from '../src/avisos/entities/aviso.entity.js';
import { AvisosService } from '../src/avisos/avisos.service.js';
import { CadastroService } from '../src/cadastro/cadastro.service.js';
import { EventosService } from '../src/campus/eventos/eventos.service.js';
import { LojinhaController } from '../src/gamificacao/lojinha/lojinha.controller.js';
import { LojinhaService } from '../src/gamificacao/lojinha/lojinha.service.js';
import { RecompensasAdminController } from '../src/gamificacao/recompensas/recompensas-admin.controller.js';
import { RecompensasAdminService } from '../src/gamificacao/recompensas/recompensas-admin.service.js';
import { ResgatesAdminController } from '../src/gamificacao/resgates/resgates-admin.controller.js';
import { ResgatesAdminService } from '../src/gamificacao/resgates/resgates-admin.service.js';
import { ChatController } from '../src/chat/chat.controller.js';
import { ChatService } from '../src/chat/chat.service.js';
import { CoordenacaoController } from '../src/coordenacao/coordenacao.controller.js';
import { CoordenacaoService } from '../src/coordenacao/coordenacao.service.js';
import { FormularioEntity } from '../src/formularios/entities/formulario.entity.js';
import { FormulariosService } from '../src/formularios/formularios.service.js';
import { LIMITES } from '../src/gamificacao/economia.js';
import { MissoesAdminController } from '../src/gamificacao/missoes/missoes-admin.controller.js';
import { MissoesAdminService } from '../src/gamificacao/missoes/missoes-admin.service.js';
import { MissoesController } from '../src/gamificacao/missoes/missoes.controller.js';
import {
  COMENTARIO_MISSAO_MIN,
  MENSAGEM_MISSAO_MIN,
  RAIO_EVENTO_METROS,
  TENTATIVAS_CODIGO_POR_HORA,
} from '../src/gamificacao/missoes/missoes.js';
import { MissoesService } from '../src/gamificacao/missoes/missoes.service.js';
import { PucStopsAdminService } from '../src/gamificacao/pucstops/pucstops-admin.service.js';
import {
  MinhasColetasController,
  PucStopsController,
} from '../src/gamificacao/pucstops/pucstops.controller.js';
import { PucStopsService } from '../src/gamificacao/pucstops/pucstops.service.js';
import { importarSnapshot } from '../src/mapa/importacao/importar-snapshot.js';
import { validarSnapshot } from '../src/mapa/importacao/snapshot.js';
import { schemaPostgis } from '../src/mapa/postgis.js';
import { CriterioCatalogoService } from '../src/matching/criterio-catalogo.service.js';
import { MatchingService } from '../src/matching/matching.service.js';
import { CriaNotificacoes1794800000000 } from '../src/migrations/1794800000000-CriaNotificacoes.js';
import { RequisitosMissoes1795000000000 } from '../src/migrations/1795000000000-RequisitosMissoes.js';
import { CicloDeVidaMissoes1795200000000 } from '../src/migrations/1795200000000-CicloDeVidaMissoes.js';
import { notificacaoCandidatura } from '../src/notificacoes/notificacoes.js';
import { NotificacoesController } from '../src/notificacoes/notificacoes.controller.js';
import { NotificacoesService } from '../src/notificacoes/notificacoes.service.js';
import { ParticipacaoEntity } from '../src/participacoes/entities/participacao.entity.js';
import { ParticipacoesController } from '../src/participacoes/participacoes.controller.js';
import { ParticipacoesService } from '../src/participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../src/participacoes/permissoes-aluno.service.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { ProgramasService } from '../src/programas/programas.service.js';
import { PublicacaoEntity } from '../src/publicacoes/entities/publicacao.entity.js';
import { FeedMidiasService } from '../src/publicacoes/feed-midias.service.js';
import { FeedPolicy } from '../src/publicacoes/feed-policy.js';
import { PublicacoesService } from '../src/publicacoes/publicacoes.service.js';
import { AzureBlobStorageService } from '../src/storage/azure-blob-storage.service.js';
import { UsuarioEntity } from '../src/usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';

const URL_TESTE = process.env.MAPA_TEST_DB_URL;
const SEGREDO = 'segredo-jwt-integracao-missoes';
const BANCO = 'missoes_api';
const CICLO = ParticipacoesService.programaAtual();
const [ANO, SEMESTRE] = CICLO.split('/').map(Number);
const CICLO_ANTERIOR = SEMESTRE === 1 ? `${ANO - 1}/2` : `${ANO}/1`;
/** Pool pequeno de propósito: menor que o número de requisições simultâneas. */
const POOL = 3;
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');

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

interface Posicao {
  latitude: number;
  longitude: number;
}

function noPredio(id: string): Posicao {
  const predio = MAPA.predios.find((p) => p.id === id);
  if (!predio) throw new Error(`prédio ${id} fora do snapshot`);
  const [longitude, latitude] = predio.localizacao.coordinates;
  return { latitude, longitude };
}

function comRuido(p: Posicao, metros: number, semente: number): Posicao {
  const angulo = (semente * 137.5 * Math.PI) / 180;
  const r = metros * ((semente % 7) / 7);
  return {
    latitude: p.latitude + (r * Math.cos(angulo)) / 111_320,
    longitude:
      p.longitude +
      (r * Math.sin(angulo)) /
        (111_320 * Math.cos((p.latitude * Math.PI) / 180)),
  };
}

const NOMES = [
  'Ana Clara Ribeiro',
  'Bruno Henrique Costa',
  'Camila Duarte Lima',
  'Diego Martins Rocha',
  'Eduarda Fonseca Alves',
  'Felipe Augusto Moreira',
  'Gabriela Souza Pinto',
  'Henrique Batista Melo',
  'Isabela Cardoso Nunes',
  'João Pedro Araújo',
  'Larissa Teixeira Dias',
  'Lucas Almeida Gomes',
  'Mariana Lopes Barbosa',
  'Matheus Oliveira Castro',
  'Natália Freitas Ramos',
  'Otávio Mendes Carvalho',
  'Paula Rezende Vieira',
  'Rafael Correia Santos',
  'Sofia Antunes Moura',
  'Thiago Pereira Campos',
  'Vitória Machado Reis',
  'Yasmin Guimarães Torres',
];

const CURSOS = [
  'Engenharia de Software',
  'Ciência da Computação',
  'Sistemas de Informação',
  'Psicologia',
  'Direito',
  'Arquitetura e Urbanismo',
];

const COMENTARIOS = [
  'Fiz a matrícula pelo SGA e deu certo, só confere o horário antes.',
  'O RU abre às 11h e a fila anda rápido depois do meio-dia.',
  'A biblioteca empresta notebook por quatro horas, vale muito a pena.',
  'Tem monitoria de Cálculo toda terça no Prédio 34, sala 205.',
];

const MISSOES_GRANDES = [
  'Apresente seu projeto na Mostra de Extensão',
  'Organize a recepção dos calouros do seu curso',
  'Conduza uma roda de conversa sobre estágio',
  'Ajude na feira de profissões do campus',
  'Monitore uma aula de nivelamento de Cálculo',
  'Leve seu afilhado à Biblioteca Padre Alberto Antoniazzi',
  'Apresente o Restaurante Universitário ao seu grupo',
  'Participe do mutirão de doação de sangue',
  'Mostre os laboratórios do Prédio 34 ao grupo',
  'Conduza o tour do campus para os novos alunos',
  'Escreva o guia de sobrevivência do primeiro período',
  'Ajude a organizar a gincana de boas-vindas',
  'Apresente o serviço de apoio psicopedagógico',
  'Represente o programa no Dia da Família PUC',
  'Grave um vídeo com dicas para o primeiro período',
  'Participe da reunião de encerramento do semestre',
];

type Papel = 'apadrinhado' | 'padrinho' | 'candidato';
type StatusRegistro =
  | 'pendente'
  | 'em_analise'
  | 'aprovado'
  | 'em_andamento'
  | 'concluido'
  | 'nao_aprovado';
type Requisito =
  | 'PUCSTOPS'
  | 'EVENTO'
  | 'FEED_PUBLICACOES'
  | 'FEED_COMENTARIOS'
  | 'FEED_CURTIDAS'
  | 'CHAT_MENSAGENS'
  | 'CODIGO';

interface Aluno {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  auth: string;
  payload: AccessTokenPayload;
}

interface Dupla {
  padrinho: Aluno;
  apadrinhado: Aluno;
  chatId: number;
  vinculoId: number;
}

interface Missao {
  id: string;
  titulo: string;
  tipo: 'UNICA' | 'SEMANAL';
  requisito: Requisito | null;
  quantidade: number;
  alvoId: string | null;
  pontos: Array<{ id: string; nome: string | null; ativo: boolean }>;
  publico: 'TODOS' | 'PADRINHOS' | 'APADRINHADOS';
  instrucoes: string | null;
  codigo: string | null;
  codigoLiberadoAte: string | null;
  vigenteAgora: boolean;
  xp: number;
  ativa: boolean;
  estado: 'rascunho' | 'publicada' | 'arquivada';
  publicadaEm: string | null;
  atualizadoEm: string;
}

interface CorpoMissao {
  titulo: string;
  descricao?: string;
  tipo: 'UNICA' | 'SEMANAL';
  xp: number;
  requisito?: Requisito;
  quantidade?: number;
  alvoId?: string;
  alvoIds?: string[];
  publico?: 'TODOS' | 'PADRINHOS' | 'APADRINHADOS';
  instrucoes?: string;
  codigo?: string;
  inicio?: string;
  fim?: string;
  ativar?: boolean;
}

interface ItemLista {
  id: string;
  titulo: string;
  descricao: string;
  tipo: string;
  requisito: Requisito;
  xp: number;
  moedas: number;
  status: 'disponivel' | 'limitada' | 'concluida';
  xpPrevisto: number;
  progresso: { atual: number; meta: number } | null;
  pronta: boolean;
  codigoLiberadoAte: string | null;
  alvo: {
    tipo: string;
    id: string;
    nome: string;
    checkinAbre: string | null;
    inicio: string | null;
    fim: string | null;
    latitude: number | null;
    longitude: number | null;
    local: string | null;
  } | null;
  pontos: Array<{
    id: string;
    nome: string;
    coletado: boolean;
    ativo: boolean;
    latitude: number | null;
    longitude: number | null;
  }> | null;
  instrucoes: string | null;
  conclusao: { id: string; xp: number; limitado: boolean } | null;
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

function emailDe(nome: string, n: number): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(' ');
  return `${base[0]}.${base.at(-1)}${n}@sga.pucminas.br`;
}

describe.skipIf(!URL_TESTE)('Missões e notificações com banco real', () => {
  let ds: DataSource;
  let app: INestApplication;
  let jwt: JwtService;
  let geo: string;
  let servicoMissoes: MissoesService;
  let notificacoesServico: NotificacoesService;
  let feed: PublicacoesService;
  let chats: ChatService;
  let eventos: EventosService;
  let pucstopsAdmin: PucStopsAdminService;
  let seedDemoAntes: string | undefined;
  let alunosCriados = 0;
  let endereco: string;
  const codigos = new Map<string, string>();
  const http = () => request(endereco);

  const coord = () =>
    `Bearer ${jwt.sign({ sub: '900001', email: 'renata.coordenacao@pucminas.br', perfil: 'coordenador', escopo: 'acesso' })}`;

  const totens: Record<
    'ICEI' | 'TEATRO' | 'BIBLIOTECA' | 'CANTINA' | 'PREDIO24',
    { id: string; posicao: Posicao }
  > = {} as never;
  const agenda: Record<
    'SEMANA_CALOURO' | 'OFICINA_CURRICULO' | 'TOUR_CAMPUS',
    string
  > = {} as never;

  async function novoAluno(
    opcoes: {
      papel?: Papel;
      status?: StatusRegistro;
      programa?: string;
      terminoEm?: Date;
      semParticipacao?: boolean;
    } = {},
  ): Promise<Aluno> {
    const n = alunosCriados++;
    const nome = NOMES[n % NOMES.length];
    const email = emailDe(nome, n);
    const papel = opcoes.papel ?? 'apadrinhado';
    const [{ id }] = (await ds.query(
      `INSERT INTO feed.usuarios (nome, email, curso, periodo, tipo_participacao, status_cadastro) ` +
        `VALUES ($1, $2, $3, $4, $5, 'aprovado') RETURNING id`,
      [
        nome,
        email,
        CURSOS[n % CURSOS.length],
        papel === 'apadrinhado' ? 1 : 3 + (n % 5),
        papel === 'candidato' ? 'padrinho' : papel,
      ],
    )) as Array<{ id: number }>;
    if (!opcoes.semParticipacao) {
      await ds.query(
        `INSERT INTO feed.participacoes (usuario_id, programa, papel, status, inicio_em, termino_em, respostas) ` +
          `VALUES ($1, $2, $3, $4, now() - interval '30 days', $5, $6)`,
        [
          email,
          opcoes.programa ?? CICLO,
          papel,
          opcoes.status ?? 'em_andamento',
          opcoes.terminoEm ?? null,
          JSON.stringify({ nome }),
        ],
      );
    }
    const payload: AccessTokenPayload = {
      sub: String(id),
      email,
      perfil: papel === 'candidato' ? 'padrinho' : papel,
      escopo: 'acesso',
    };
    return {
      id,
      nome,
      email,
      papel,
      auth: `Bearer ${jwt.sign(payload)}`,
      payload,
    };
  }

  async function participacaoDe(a: Aluno): Promise<number> {
    const [{ id }] = (await ds.query(
      `SELECT id FROM feed.participacoes WHERE usuario_id = $1 AND programa = $2`,
      [a.email, CICLO],
    )) as Array<{ id: number }>;
    return Number(id);
  }

  async function ligar(padrinho: Aluno, apadrinhado: Aluno) {
    await ds.query(
      'UPDATE feed.programas SET inscricoes_abertas = false WHERE codigo = $1',
      [CICLO],
    );
    const matching = new MatchingService(ds, chats);
    if (!(await matching.obterConfiguracao(CICLO))) {
      await matching.salvarConfiguracao(
        {
          programa: CICLO,
          versaoBase: 0,
          liberado: false,
          capacidadePorPadrinho: 3,
          capacidadePorApadrinhado: 1,
          criterios: [
            { campoCadastro: 'areas', operacao: 'intersecao', peso: 100 },
          ],
        },
        'renata.coordenacao@pucminas.br',
      );
    }
    await ds.query(
      `UPDATE feed.participacoes SET respostas = respostas || '{"areas":["Tecnologia"]}'::jsonb WHERE usuario_id = ANY($1) AND programa = $2`,
      [[padrinho.email, apadrinhado.email], CICLO],
    );
    const vinculo = await new VinculosService(ds, matching, chats).vincular(
      await participacaoDe(apadrinhado),
      await participacaoDe(padrinho),
      'renata.coordenacao@pucminas.br',
    );
    return vinculo;
  }

  async function formarDupla(): Promise<Dupla> {
    const padrinho = await novoAluno({ papel: 'padrinho' });
    const apadrinhado = await novoAluno({ papel: 'apadrinhado' });
    const vinculo = await ligar(padrinho, apadrinhado);
    const vinculoId = vinculo.vinculo.id;
    const chat = await ds.transaction((m) =>
      chats.criarParaVinculo(m, vinculoId),
    );
    return { padrinho, apadrinhado, chatId: chat.id, vinculoId };
  }

  async function criarMissao(corpo: CorpoMissao): Promise<Missao> {
    const requisito = corpo.requisito ?? 'CODIGO';
    const codigo =
      corpo.codigo ??
      (requisito === 'CODIGO' || requisito === 'EVENTO'
        ? `ATV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        : undefined);
    const r = await http()
      .post('/coordenacao/missoes')
      .set('Authorization', coord())
      .send({
        descricao: `Registre no app quando terminar: ${corpo.titulo.toLowerCase()}.`,
        ativar: true,
        ...corpo,
        requisito,
        ...(codigo !== undefined && { codigo }),
      });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const m = r.body as Missao;
    if (m.codigo) codigos.set(m.id, m.codigo);
    // Na vida real a coordenação libera o código na hora da atividade.
    if (m.codigo && m.ativa && m.vigenteAgora) return liberarCodigo(m.id);
    return m;
  }

  async function liberarCodigo(id: string, minutos = 60): Promise<Missao> {
    const r = await http()
      .post(`/coordenacao/missoes/${id}/codigo`)
      .set('Authorization', coord())
      .send({ minutos });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body as Missao;
  }

  const listar = (a: Aluno) =>
    http().get('/me/missoes').set('Authorization', a.auth);

  async function missoesDe(a: Aluno) {
    const r = await listar(a);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body as {
      ciclo: string;
      semana: string;
      limites: {
        ciclo: { ganho: number; limite: number };
        semanal: { ganho: number; limite: number };
      };
      missoes: ItemLista[];
    };
  }

  async function itemDe(a: Aluno, id: string): Promise<ItemLista | undefined> {
    return (await missoesDe(a)).missoes.find((m) => m.id === id);
  }

  const concluir = (a: Aluno, missaoId: string, corpo?: object) =>
    http()
      .post(`/me/missoes/${missaoId}/concluir`)
      .set('Authorization', a.auth)
      .send({
        ...((corpo === undefined || 'latitude' in corpo) &&
          codigos.has(missaoId) && { codigo: codigos.get(missaoId) }),
        ...corpo,
      })
      .timeout(15_000);

  const coletar = (
    a: Aluno,
    totem: { id: string; posicao: Posicao },
    semente = 1,
  ) =>
    http()
      .post(`/mapa/pucstops/${totem.id}/claim`)
      .set('Authorization', a.auth)
      .send({ ...comRuido(totem.posicao, 6, semente), accuracy: 12 })
      .timeout(15_000);

  async function publicar(a: Aluno, texto: string): Promise<number> {
    const post = (await feed.criar(
      { texto, categoria: 'Dicas' },
      a.payload,
    )) as { id: number };
    return post.id;
  }

  const comentar = (a: Aluno, postId: number, texto: string) =>
    feed.comentar(postId, texto, a.payload);
  const curtir = (a: Aluno, postId: number, delta: 1 | -1 = 1) =>
    feed.curtir(postId, delta, a.payload);

  async function mandarMensagem(a: Aluno, chatId: number, texto: string) {
    const r = await http()
      .post(`/chats/${chatId}/mensagens`)
      .set('Authorization', a.auth)
      .send({ texto, clientId: crypto.randomUUID() });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  }

  async function carteira(a: Aluno) {
    const [linha] = (await ds.query(
      `SELECT saldo, xp_acumulado FROM gamificacao.xp_carteiras WHERE usuario_id = $1`,
      [a.id],
    )) as Array<{ saldo: number; xp_acumulado: number }>;
    return linha ?? { saldo: 0, xp_acumulado: 0 };
  }

  async function contar(sql: string, params: unknown[] = []): Promise<number> {
    const [{ n }] = (await ds.query(sql, params)) as Array<{ n: number }>;
    return Number(n);
  }

  async function distanciaAoPredio(
    predio: string,
    p: Posicao,
  ): Promise<number> {
    const [{ d }] = (await ds.query(
      `SELECT ${geo}.ST_Distance(COALESCE(pr.poligono, pr.localizacao)::${geo}.geography, ` +
        `${geo}.ST_SetSRID(${geo}.ST_MakePoint($2, $3), 4326)::${geo}.geography) AS d ` +
        `FROM mapa.predios pr WHERE pr.id = $1 AND pr.versao_id = (SELECT id FROM mapa.versoes WHERE status = 'ativa')`,
      [predio, p.longitude, p.latitude],
    )) as Array<{ d: number }>;
    return Number(d);
  }

  async function aDistancia(predio: string, metros: number): Promise<Posicao> {
    const centro = noPredio(predio);
    let baixo = 0;
    let alto = 2000;
    for (let i = 0; i < 40; i++) {
      const meio = (baixo + alto) / 2;
      const p = { ...centro, latitude: centro.latitude + meio / 111_320 };
      if ((await distanciaAoPredio(predio, p)) < metros) baixo = meio;
      else alto = meio;
    }
    return { ...centro, latitude: centro.latitude + alto / 111_320 };
  }

  function outraSemanaDoCiclo(): Date {
    const depois = new Date(Date.now() + 7 * DIA);
    return ParticipacoesService.programaAtual(depois) === CICLO
      ? depois
      : new Date(Date.now() - 7 * DIA);
  }

  beforeAll(async () => {
    seedDemoAntes = process.env.SEED_DEMO_DATA;
    process.env.SEED_DEMO_DATA = 'false';

    await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    await admin(`CREATE DATABASE ${BANCO}`);
    ds = new DataSource({
      type: 'postgres',
      url: urlDo(BANCO),
      schema: 'feed',
      entities: ENTIDADES,
      migrations: MIGRATIONS,
      migrationsTableName: 'migrations',
      installExtensions: false,
      extra: { max: POOL },
    });
    await ds.initialize();
    await ds.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await ds.query('CREATE SCHEMA IF NOT EXISTS feed');
    await ds.runMigrations({ transaction: 'all' });
    await importarSnapshot(ds, MAPA, { ativar: true });
    geo = await schemaPostgis((sql, p) => ds.query(sql, p));

    const modulo = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: SEGREDO })],
      controllers: [
        MissoesController,
        MissoesAdminController,
        NotificacoesController,
        PucStopsController,
        MinhasColetasController,
        ChatController,
        LojinhaController,
        RecompensasAdminController,
        ResgatesAdminController,
        CoordenacaoController,
        ParticipacoesController,
      ],
      providers: [
        MissoesService,
        MissoesAdminService,
        NotificacoesService,
        ParticipacoesService,
        ProgramasService,
        PermissoesAlunoService,
        PucStopsService,
        PucStopsAdminService,
        EventosService,
        PublicacoesService,
        FeedPolicy,
        UsuariosService,
        FeedMidiasService,
        ChatService,
        LojinhaService,
        RecompensasAdminService,
        ResgatesAdminService,
        CoordenacaoService,
        CadastroService,
        AuthService,
        MicrosoftTokenVerifier,
        FormulariosService,
        AvisosService,
        MatchingService,
        VinculosService,
        CriterioCatalogoService,
        JwtAuthGuard,
        RolesGuard,
        {
          provide: AzureBlobStorageService,
          useValue: new AzureBlobStorageService(null, null, {
            leituraMinutos: 15,
            uploadMinutos: 15,
          }),
        },
        { provide: DataSource, useValue: ds },
        ...[
          ParticipacaoEntity,
          ProgramaEntity,
          UsuarioEntity,
          PublicacaoEntity,
          FormularioEntity,
          AvisoEntity,
        ].map((entidade) => ({
          provide: getRepositoryToken(entidade),
          useValue: ds.getRepository(entidade),
        })),
      ],
    }).compile();
    app = modulo.createNestApplication();
    // Mesmo pipe global do main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    endereco = await app.getUrl();
    jwt = modulo.get(JwtService);
    servicoMissoes = modulo.get(MissoesService);
    notificacoesServico = modulo.get(NotificacoesService);
    feed = modulo.get(PublicacoesService);
    chats = modulo.get(ChatService);
    eventos = modulo.get(EventosService);
    pucstopsAdmin = modulo.get(PucStopsAdminService);

    for (const [chave, nome, predio] of [
      ['ICEI', 'PucStop do ICEI', 'P34'],
      ['TEATRO', 'PucStop do Teatro', 'P30'],
      ['BIBLIOTECA', 'PucStop da Biblioteca', 'P26'],
      ['CANTINA', 'PucStop da Cantina', 'P16'],
      ['PREDIO24', 'PucStop do Prédio 24', 'P24'],
    ] as const) {
      const posicao = noPredio(predio);
      const criado = await pucstopsAdmin.criar(
        { nome, ...posicao, xp: 10, raioMetros: 30 },
        null,
      );
      totens[chave] = { id: criado.id, posicao };
    }

    const agora = Date.now();
    for (const [chave, titulo, predio, inicio, fim] of [
      [
        'SEMANA_CALOURO',
        'Abertura da Semana do Calouro',
        'P30',
        agora - HORA,
        agora + 2 * HORA,
      ],
      [
        'OFICINA_CURRICULO',
        'Oficina de currículo e LinkedIn',
        'P34',
        agora + 3 * HORA,
        agora + 5 * HORA,
      ],
      [
        'TOUR_CAMPUS',
        'Tour guiado pelo campus',
        'P26',
        agora + 20 * MIN,
        agora + 2 * HORA,
      ],
    ] as const) {
      const evento = await eventos.criar(
        {
          titulo,
          descricao: 'Atividade da recepção dos calouros.',
          inicio: new Date(inicio).toISOString(),
          fim: new Date(fim).toISOString(),
          local: { predioId: predio },
        },
        null,
      );
      agenda[chave] = evento.id;
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
    if (URL_TESTE) await admin(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    if (seedDemoAntes === undefined) delete process.env.SEED_DEMO_DATA;
    else process.env.SEED_DEMO_DATA = seedDemoAntes;
  });

  describe('criação de missão pela coordenação', () => {
    it('sem o ciclo aberto em Programas: 400', async () => {
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({
          titulo: 'Participe da aula inaugural',
          descricao: 'Assista à aula inaugural do curso no auditório.',
          tipo: 'UNICA',
          xp: 20,
          requisito: 'CODIGO',
          codigo: 'AULA-INAUGURAL',
        })
        .expect(400);
      expect(r.body.message).toContain(`Ciclo ${CICLO} não cadastrado`);
      await ds.query(
        `INSERT INTO feed.programas (codigo, titulo, etapa_atual) VALUES ($1, $2, 'andamento'), ($3, $4, 'encerramento')`,
        [
          CICLO,
          `Apadrinhamento ${CICLO}`,
          CICLO_ANTERIOR,
          `Apadrinhamento ${CICLO_ANTERIOR}`,
        ],
      );
    });

    it('aluno não acessa as rotas da coordenação', async () => {
      const a = await novoAluno();
      await http()
        .get('/coordenacao/missoes')
        .set('Authorization', a.auth)
        .expect(403);
      await http()
        .post('/coordenacao/missoes')
        .set('Authorization', a.auth)
        .send({
          titulo: 'Missão própria',
          descricao: 'x',
          tipo: 'UNICA',
          xp: 10,
          requisito: 'CODIGO',
          codigo: 'MINHA',
        })
        .expect(403);
    });

    it('sem token: 401', async () => {
      await http().get('/coordenacao/missoes').expect(401);
      await http().get('/me/missoes').expect(401);
    });

    it('nasce inativa quando não pede para ativar', async () => {
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({
          titulo: 'Visite o Museu de Ciências Naturais',
          descricao: 'Conheça o acervo do museu no campus Coração Eucarístico.',
          tipo: 'UNICA',
          xp: 30,
          requisito: 'CODIGO',
          codigo: ' museu 26 ',
        })
        .expect(201);
      expect(r.body).toMatchObject({
        ativa: false,
        vigenteAgora: false,
        ciclo: CICLO,
        requisito: 'CODIGO',
        codigo: 'MUSEU26',
        conclusoes: 0,
        xpCreditadoTotal: 0,
      });
    });

    const valido = {
      titulo: 'Conheça a Biblioteca Central',
      descricao: 'Faça o cadastro na biblioteca e pegue um livro emprestado.',
      tipo: 'UNICA',
      xp: 30,
      requisito: 'CODIGO',
      codigo: 'BIBLIOTECA',
    };

    it.each([
      ['xp zero', { xp: 0 }],
      ['xp negativo', { xp: -10 }],
      ['xp acima do máximo por missão', { xp: LIMITES.porMissao + 1 }],
      ['xp quebrado', { xp: 12.5 }],
      ['xp em texto', { xp: '30' }],
      [
        'semanal acima do teto semanal',
        { tipo: 'SEMANAL', xp: LIMITES.missoesSemanais + 1 },
      ],
      ['tipo desconhecido', { tipo: 'DIARIA' }],
      ['sem tipo', { tipo: undefined }],
      ['título vazio', { titulo: '   ' }],
      ['título longo demais', { titulo: 'Participe '.repeat(13) }],
      ['sem título', { titulo: undefined }],
      ['descrição vazia', { descricao: '' }],
      ['descrição longa demais', { descricao: 'a'.repeat(1001) }],
      ['início sem fuso', { inicio: '2026-11-17T08:00:00' }],
      ['data inválida', { fim: '2026-13-40T08:00:00-03:00' }],
      ['fim no passado', { fim: iso(Date.now() - DIA) }],
      [
        'fim antes do início',
        { inicio: iso(Date.now() + 7 * DIA), fim: iso(Date.now() + 2 * DIA) },
      ],
      ['campo que não existe', { xpBonus: 50 }],
      ['ciclo escolhido pelo cliente', { ciclo: CICLO_ANTERIOR }],
      ['sem requisito', { requisito: undefined, codigo: undefined }],
      ['requisito desconhecido', { requisito: 'AUTODECLARACAO' }],
      ['código curto', { codigo: 'AB' }],
      ['código com símbolo', { codigo: 'CALOURO@26' }],
      ['código longo', { codigo: 'A'.repeat(21) }],
      ['missão de código sem código', { codigo: undefined }],
      ['código em missão de feed', { requisito: 'FEED_COMENTARIOS' }],
      [
        'quantidade zero',
        { requisito: 'FEED_COMENTARIOS', codigo: undefined, quantidade: 0 },
      ],
      [
        'quantidade acima de 20',
        { requisito: 'FEED_COMENTARIOS', codigo: undefined, quantidade: 21 },
      ],
      [
        'quantidade quebrada',
        { requisito: 'FEED_COMENTARIOS', codigo: undefined, quantidade: 1.5 },
      ],
      ['código com quantidade 2', { quantidade: 2 }],
      [
        'alvo em missão de feed',
        {
          requisito: 'FEED_CURTIDAS',
          codigo: undefined,
          alvoId: '8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b',
        },
      ],
      [
        'alvo que não é uuid',
        { requisito: 'EVENTO', codigo: undefined, alvoId: 'semana-do-calouro' },
      ],
      ['evento sem alvo', { requisito: 'EVENTO', codigo: undefined }],
      ['público desconhecido', { publico: 'CALOUROS' }],
      [
        'publicação no feed para apadrinhados (só padrinho publica)',
        {
          requisito: 'FEED_PUBLICACOES',
          codigo: undefined,
          publico: 'APADRINHADOS',
        },
      ],
      ['instruções longas demais', { instrucoes: 'a'.repeat(1001) }],
      [
        'lista de PucStops vazia',
        { requisito: 'PUCSTOPS', codigo: undefined, alvoIds: [] },
      ],
      [
        'PucStop que não é uuid',
        { requisito: 'PUCSTOPS', codigo: undefined, alvoIds: ['icei'] },
      ],
      [
        'lista de PucStops em missão de feed',
        {
          requisito: 'FEED_CURTIDAS',
          codigo: undefined,
          alvoIds: ['8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b'],
        },
      ],
      [
        'mais de 20 PucStops',
        {
          requisito: 'PUCSTOPS',
          codigo: undefined,
          alvoIds: Array.from(
            { length: 21 },
            (_, i) => `8c1f3a2e-4b5d-4e6f-9a7b-${String(i).padStart(12, '0')}`,
          ),
        },
      ],
    ])('recusa %s com 400', async (_caso, mudanca) => {
      const antes = await contar(
        `SELECT count(*) AS n FROM gamificacao.missoes`,
      );
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({ ...valido, ...mudanca });
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(
        await contar(`SELECT count(*) AS n FROM gamificacao.missoes`),
      ).toBe(antes);
    });

    it('evento semanal: 400 (o evento acontece uma vez)', async () => {
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({
          ...valido,
          tipo: 'SEMANAL',
          requisito: 'EVENTO',
          codigo: undefined,
          alvoId: agenda.SEMANA_CALOURO,
        })
        .expect(400);
      expect(r.body.message).toContain('única');
    });

    it.each([
      [
        'evento que não existe',
        () => ({
          requisito: 'EVENTO',
          alvoId: '8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b',
        }),
      ],
      [
        'PucStop que não existe',
        () => ({
          requisito: 'PUCSTOPS',
          alvoId: '8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b',
        }),
      ],
      [
        'mais totens do que existem no campus',
        () => ({ requisito: 'PUCSTOPS', quantidade: 6 }),
      ],
      [
        'evento como alvo de PucStop',
        () => ({ requisito: 'PUCSTOPS', alvoId: agenda.SEMANA_CALOURO }),
      ],
    ])('recusa %s com 422 alvo-invalido', async (_caso, mudanca) => {
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({ ...valido, codigo: undefined, ...mudanca() });
      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.motivo).toBe('alvo-invalido');
    });

    it('evento encerrado, desativado ou sem local no mapa: 422', async () => {
      const passado = await eventos.criar(
        {
          titulo: 'Feira de projetos do ICEI',
          inicio: new Date(Date.now() - 5 * HORA).toISOString(),
          fim: new Date(Date.now() - 2 * HORA).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      const semLocal = await eventos.criar(
        {
          titulo: 'Live de boas-vindas da reitoria',
          inicio: new Date(Date.now() + DIA).toISOString(),
          fim: new Date(Date.now() + DIA + HORA).toISOString(),
        },
        null,
      );
      const desativado = await eventos.criar(
        {
          titulo: 'Encontro de padrinhos (adiado)',
          inicio: new Date(Date.now() + DIA).toISOString(),
          fim: new Date(Date.now() + DIA + HORA).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      await eventos.definirAtivo(desativado.id, false);
      for (const [alvoId, trecho] of [
        [passado.id, 'já terminou'],
        [semLocal.id, 'local no mapa'],
        [desativado.id, 'desativado'],
      ]) {
        const r = await http()
          .post('/coordenacao/missoes')
          .set('Authorization', coord())
          .send({ ...valido, codigo: undefined, requisito: 'EVENTO', alvoId });
        expect(r.status, JSON.stringify(r.body)).toBe(422);
        expect(r.body.message).toContain(trecho);
      }
    });

    it('evento: o período da missão precisa cruzar o check-in (30 min antes até o fim)', async () => {
      const inicio = Date.now() + 2 * DIA;
      const fim = inicio + 2 * HORA;
      const palestra = await eventos.criar(
        {
          titulo: 'Palestra de carreiras na engenharia',
          inicio: new Date(inicio).toISOString(),
          fim: new Date(fim).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      const base = {
        titulo: 'Check-in na palestra de carreiras',
        tipo: 'UNICA' as const,
        xp: 20,
        requisito: 'EVENTO' as const,
        alvoId: palestra.id,
      };
      const criar = (periodo: object) =>
        http()
          .post('/coordenacao/missoes')
          .set('Authorization', coord())
          .send({
            descricao: 'Passe no auditório e faça o check-in.',
            codigo: 'CARREIRA-26',
            ativar: true,
            ...base,
            ...periodo,
          });
      for (const periodo of [
        { inicio: new Date(fim).toISOString() },
        { inicio: new Date(fim + HORA).toISOString() },
        { fim: new Date(inicio - 30 * MIN).toISOString() },
        {
          inicio: new Date(inicio - 5 * HORA).toISOString(),
          fim: new Date(inicio - HORA).toISOString(),
        },
      ]) {
        const r = await criar(periodo);
        expect(r.status, JSON.stringify(periodo)).toBe(400);
        expect(r.body.message).toContain('check-in do evento');
      }
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes WHERE alvo_id = $1`,
          [palestra.id],
        ),
      ).toBe(0);

      await criarMissao({
        ...base,
        fim: new Date(inicio - 29 * MIN).toISOString(),
      });
      await criarMissao({ ...base, inicio: new Date(fim - MIN).toISOString() });

      const rascunho = await criarMissao({ ...base, ativar: false });
      const editado = await http()
        .patch(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', coord())
        .send({
          atualizadoEm: rascunho.atualizadoEm,
          inicio: new Date(fim + DIA).toISOString(),
        })
        .expect(200);
      expect(editado.body.estado).toBe('rascunho');
      const publicar = await http()
        .post(`/coordenacao/missoes/${rascunho.id}/ativar`)
        .set('Authorization', coord());
      expect(publicar.status, JSON.stringify(publicar.body)).toBe(400);
      expect(publicar.body.message).toContain('check-in do evento');
      const depois = await http()
        .get(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', coord())
        .expect(200);
      expect(depois.body).toMatchObject({
        estado: 'rascunho',
        publicadaEm: null,
      });
    });

    it('evento remarcado para depois do prazo ou desativado: some para quem não fez e não avisa; quem fez continua vendo', async () => {
      const agora = Date.now();
      const roda = await eventos.criar(
        {
          titulo: 'Roda de conversa com egressos',
          inicio: new Date(agora + 10 * MIN).toISOString(),
          fim: new Date(agora + 2 * HORA).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      const fez = await novoAluno();
      const naoFez = await novoAluno();
      const m = await criarMissao({
        titulo: 'Check-in na roda de conversa com egressos',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'EVENTO',
        alvoId: roda.id,
        fim: new Date(agora + 3 * HORA).toISOString(),
      });
      await concluir(fez, m.id, { ...noPredio('P34'), accuracy: 10 }).expect(
        201,
      );
      expect(await itemDe(naoFez, m.id)).toBeDefined();

      await eventos.atualizar(roda.id, {
        inicio: new Date(agora + 5 * HORA).toISOString(),
        fim: new Date(agora + 6 * HORA).toISOString(),
      });
      expect(await itemDe(naoFez, m.id)).toBeUndefined();
      expect(await itemDe(fez, m.id)).toMatchObject({ status: 'concluida' });
      await http()
        .get('/me/notificacoes')
        .set('Authorization', naoFez.auth)
        .expect(200);
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE usuario_id = $1 AND chave = $2`,
          [naoFez.id, `missao-nova:${m.id}`],
        ),
      ).toBe(0);

      const atual = await http()
        .get(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .expect(200);
      await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({
          atualizadoEm: atual.body.atualizadoEm,
          fim: new Date(agora + 7 * HORA).toISOString(),
        })
        .expect(200);
      expect(await itemDe(naoFez, m.id)).toMatchObject({ pronta: false });

      await eventos.definirAtivo(roda.id, false);
      expect(await itemDe(naoFez, m.id)).toBeUndefined();
      expect(await itemDe(fez, m.id)).toMatchObject({ status: 'concluida' });
    });

    it('PucStop desativado não vira alvo', async () => {
      const museu = await pucstopsAdmin.criar(
        {
          nome: 'PucStop do Museu',
          ...noPredio('P40'),
          xp: 10,
          raioMetros: 25,
        },
        null,
      );
      await pucstopsAdmin.definirAtivo(museu.id, false);
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({
          ...valido,
          codigo: undefined,
          requisito: 'PUCSTOPS',
          alvoId: museu.id,
        });
      expect(r.status).toBe(422);
    });

    it('aceita os limites exatos: 1 XP, 100 XP, 60 XP na semanal e 20 ações', async () => {
      for (const extra of [
        { xp: 1 },
        { xp: LIMITES.porMissao },
        { tipo: 'SEMANAL', xp: LIMITES.missoesSemanais },
        { requisito: 'FEED_COMENTARIOS', codigo: undefined, quantidade: 20 },
        { requisito: 'PUCSTOPS', codigo: undefined, quantidade: 5 },
      ]) {
        const r = await http()
          .post('/coordenacao/missoes')
          .set('Authorization', coord())
          .send({ ...valido, ...extra });
        expect(r.status, JSON.stringify(r.body)).toBe(201);
      }
    });
  });

  describe('fim do auto-claim', () => {
    it('missão antiga sem requisito não aparece, não conclui e não ativa; ganha o requisito e segue congelada', async () => {
      const [{ id }] = (await ds.query(
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ativa, ciclo, publicada_em) ` +
          `VALUES ('Visite a biblioteca central', 'Passe na biblioteca.', 'UNICA', 40, true, $1, now()) RETURNING id`,
        [CICLO],
      )) as Array<{ id: string }>;
      const a = await novoAluno();
      expect(await itemDe(a, id)).toBeUndefined();
      await concluir(a, id).expect(404);
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });

      await ds.query(
        `UPDATE gamificacao.missoes SET ativa = false WHERE id = $1`,
        [id],
      );
      const r = await http()
        .post(`/coordenacao/missoes/${id}/ativar`)
        .set('Authorization', coord())
        .expect(422);
      expect(r.body.motivo).toBe('sem-requisito');

      const atual = (
        await http()
          .get(`/coordenacao/missoes/${id}`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      expect(atual.requisito).toBeNull();
      const comRequisito = (
        await http()
          .patch(`/coordenacao/missoes/${id}`)
          .set('Authorization', coord())
          .send({
            requisito: 'PUCSTOPS',
            alvoId: totens.BIBLIOTECA.id,
            atualizadoEm: atual.atualizadoEm,
          })
          .expect(200)
      ).body as Missao;
      // Já tinha sido publicada: ganha a regra, mas XP e o resto ficam.
      expect(comRequisito).toMatchObject({
        requisito: 'PUCSTOPS',
        estado: 'arquivada',
      });
      const xp = await http()
        .patch(`/coordenacao/missoes/${id}`)
        .set('Authorization', coord())
        .send({ xp: 80, atualizadoEm: comRequisito.atualizadoEm })
        .expect(409);
      expect(xp.body).toMatchObject({
        motivo: 'missao-publicada',
        campos: ['xp'],
      });
      await http()
        .delete(`/coordenacao/missoes/${id}`)
        .set('Authorization', coord())
        .expect(409);
      await http()
        .post(`/coordenacao/missoes/${id}/ativar`)
        .set('Authorization', coord())
        .expect(200);
      expect((await itemDe(a, id))!.requisito).toBe('PUCSTOPS');
      const sem = await concluir(a, id).expect(422);
      expect(sem.body).toMatchObject({
        motivo: 'requisito-pendente',
        progresso: { atual: 0, meta: 1 },
      });
      await coletar(a, totens.BIBLIOTECA).expect(201);
      await concluir(a, id).expect(201);
    });

    it('o cliente não escolhe XP nem pula a prova pelo corpo', async () => {
      const m = await criarMissao({
        titulo: 'Comente uma dica de matrícula',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'FEED_COMENTARIOS',
        quantidade: 1,
      });
      const a = await novoAluno();
      for (const corpo of [
        { xp: 100 },
        { concluida: true },
        { progresso: { atual: 1, meta: 1 } },
        { usuarioId: 1 },
      ]) {
        const r = await concluir(a, m.id, corpo);
        expect(r.status, JSON.stringify(corpo)).toBe(400);
      }
      const r = await concluir(a, m.id, {});
      expect(r.status).toBe(422);
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });
  });

  describe('quem pode fazer missões (participação real no ciclo)', () => {
    let missao: Missao;

    beforeAll(async () => {
      missao = await criarMissao({
        titulo: 'Tire uma foto no letreiro da PUC',
        descricao: 'Mostre a foto para a coordenação e receba o código.',
        tipo: 'UNICA',
        xp: 10,
      });
    });

    it.each([
      [
        'apadrinhado em andamento',
        { papel: 'apadrinhado', status: 'em_andamento' },
      ],
      ['padrinho em andamento', { papel: 'padrinho', status: 'em_andamento' }],
      [
        'apadrinhado aprovado esperando o par',
        { papel: 'apadrinhado', status: 'aprovado' },
      ],
      [
        'candidato a padrinho aprovado esperando o matching',
        { papel: 'candidato', status: 'aprovado' },
      ],
    ] as const)('%s: lista e conclui', async (_caso, opcoes) => {
      const a = await novoAluno(opcoes);
      const lista = await missoesDe(a);
      expect(lista.ciclo).toBe(CICLO);
      expect(lista.missoes.find((m) => m.id === missao.id)).toMatchObject({
        status: 'disponivel',
        xpPrevisto: 10,
        requisito: 'CODIGO',
        pronta: true,
      });
      const r = await concluir(a, missao.id).expect(201);
      expect(r.body).toMatchObject({
        xp: 10,
        saldoMoedas: 10,
        xpAcumulado: 10,
      });
    });

    it.each([
      ['inscrição pendente', { status: 'pendente' }],
      ['candidatura em análise', { papel: 'candidato', status: 'em_analise' }],
      ['candidatura recusada', { papel: 'candidato', status: 'nao_aprovado' }],
      ['apadrinhado recusado', { status: 'nao_aprovado' }],
      ['participação concluída', { status: 'concluido' }],
      [
        'participação encerrada pela coordenação',
        { terminoEm: new Date(Date.now() - DIA) },
      ],
      ['participou só no semestre passado', { programa: CICLO_ANTERIOR }],
      ['nunca se inscreveu', { semParticipacao: true }],
    ] as const)(
      '%s: 403 na lista e na conclusão, sem crédito',
      async (_caso, opcoes) => {
        const a = await novoAluno(opcoes);
        const lista = await listar(a).expect(403);
        expect(lista.body.motivo).toBe('sem-participacao-no-ciclo');
        const r = await concluir(a, missao.id).expect(403);
        expect(r.body.motivo).toBe('sem-participacao-no-ciclo');
        expect(
          await contar(
            `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE usuario_id = $1`,
            [a.id],
          ),
        ).toBe(0);
        expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
      },
    );

    it('coordenação não faz missões de aluno', async () => {
      await http().get('/me/missoes').set('Authorization', coord()).expect(403);
    });

    it('token de um aluno com o e-mail de outro: 403', async () => {
      const a = await novoAluno();
      const b = await novoAluno();
      const falso = `Bearer ${jwt.sign({ sub: String(a.id), email: b.email, perfil: 'apadrinhado', escopo: 'acesso' })}`;
      await http()
        .post(`/me/missoes/${missao.id}/concluir`)
        .set('Authorization', falso)
        .send({ codigo: codigos.get(missao.id) })
        .expect(403);
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });

    it('participação encerrada no meio da sessão corta o acesso na hora', async () => {
      const a = await novoAluno();
      await listar(a).expect(200);
      await ds.query(
        `UPDATE feed.participacoes SET termino_em = now() WHERE usuario_id = $1`,
        [a.email],
      );
      await concluir(a, missao.id).expect(403);
    });
  });

  describe('cada categoria de missão, do cadastro à prova e ao crédito', () => {
    const ids = new Map<string, string>();
    const posts: number[] = [];
    let autores: Dupla[] = [];

    interface Categoria {
      categoria: string;
      corpo: () => CorpoMissao;
      metade?: (a: Aluno, d: Dupla) => Promise<void>;
      cumprir: (a: Aluno, d: Dupla) => Promise<void>;
      leitura?: (semente: number) => object;
      antes: { status: number; motivo: string };
    }

    const CATEGORIAS: Categoria[] = [
      {
        categoria: 'totem',
        corpo: () => ({
          titulo: 'Encontre três PucStops pelo campus',
          descricao: 'Escaneie três totens diferentes no Coração Eucarístico.',
          tipo: 'UNICA',
          xp: 40,
          requisito: 'PUCSTOPS',
          quantidade: 3,
        }),
        metade: async (a) => {
          await coletar(a, totens.ICEI).expect(201);
        },
        cumprir: async (a, _d) => {
          await coletar(a, totens.TEATRO, 2).expect(201);
          await coletar(a, totens.BIBLIOTECA, 3).expect(201);
        },
        antes: { status: 422, motivo: 'requisito-pendente' },
      },
      {
        categoria: 'evento',
        corpo: () => ({
          titulo: 'Participe da Semana do Calouro',
          descricao: 'Faça o check-in na abertura, no Teatro.',
          tipo: 'UNICA',
          xp: 30,
          requisito: 'EVENTO',
          alvoId: agenda.SEMANA_CALOURO,
        }),
        cumprir: async () => {},
        leitura: (s) => ({ ...comRuido(noPredio('P30'), 8, s), accuracy: 15 }),
        antes: { status: 400, motivo: 'localizacao-obrigatoria' },
      },
      {
        categoria: 'conversa',
        corpo: () => ({
          titulo: 'Responda duas dúvidas de calouros no feed',
          descricao:
            'Ajude quem acabou de chegar com respostas sobre matrícula e serviços.',
          tipo: 'SEMANAL',
          xp: 20,
          requisito: 'FEED_COMENTARIOS',
          quantidade: 2,
        }),
        metade: async (a) => {
          await comentar(a, posts[0], COMENTARIOS[0]);
        },
        cumprir: async (a) => {
          await comentar(a, posts[1], COMENTARIOS[1]);
        },
        antes: { status: 422, motivo: 'requisito-pendente' },
      },
      {
        categoria: 'estudo',
        corpo: () => ({
          titulo: 'Participe da monitoria de Cálculo',
          descricao: 'Peça o código ao monitor no fim da aula.',
          tipo: 'SEMANAL',
          xp: 20,
          requisito: 'CODIGO',
          codigo: 'MONITORIA-CALC',
        }),
        cumprir: async () => {},
        leitura: () => ({ codigo: 'monitoria-calc' }),
        antes: { status: 400, motivo: 'codigo-obrigatorio' },
      },
      {
        categoria: 'campus',
        corpo: () => ({
          titulo: 'Ache o Prédio 34 pelo mapa do app',
          descricao: 'Chegue ao totem na entrada do prédio dos laboratórios.',
          tipo: 'UNICA',
          xp: 25,
          requisito: 'PUCSTOPS',
          alvoId: totens.ICEI.id,
        }),
        cumprir: async (a) => {
          const r = await coletar(a, totens.ICEI, 4);
          expect([201, 422]).toContain(r.status);
        },
        antes: { status: 422, motivo: 'requisito-pendente' },
      },
      {
        categoria: 'perfil',
        corpo: () => ({
          titulo: 'Curta 3 fotos de colegas',
          descricao: 'Veja o que o pessoal do programa anda postando.',
          tipo: 'UNICA',
          xp: 15,
          requisito: 'FEED_CURTIDAS',
          quantidade: 3,
        }),
        metade: async (a) => {
          await curtir(a, posts[0]);
        },
        cumprir: async (a) => {
          await curtir(a, posts[1]);
          await curtir(a, posts[2]);
        },
        antes: { status: 422, motivo: 'requisito-pendente' },
      },
      {
        categoria: 'semanal',
        corpo: () => ({
          titulo: 'Combine o encontro da semana com seu padrinho',
          descricao:
            'Troque pelo menos três mensagens com seu padrinho ou madrinha.',
          tipo: 'SEMANAL',
          xp: 20,
          requisito: 'CHAT_MENSAGENS',
          quantidade: 3,
        }),
        metade: async (a, d) => {
          await mandarMensagem(
            a,
            d.chatId,
            'Oi! Quinta depois da aula você consegue?',
          );
        },
        cumprir: async (a, d) => {
          await mandarMensagem(
            a,
            d.chatId,
            'Pode ser na cantina do Prédio 16.',
          );
          await mandarMensagem(a, d.chatId, 'Combinado, te vejo às 18h.');
        },
        antes: { status: 422, motivo: 'requisito-pendente' },
      },
      {
        categoria: 'ciclo',
        corpo: () => ({
          titulo: 'Participe da reunião de encerramento do semestre',
          descricao: 'Digite o código mostrado no telão ao fim da reunião.',
          tipo: 'UNICA',
          xp: 30,
          requisito: 'CODIGO',
          codigo: 'ENCERRA-2026',
        }),
        cumprir: async () => {},
        leitura: () => ({ codigo: 'ENCERRA-2026' }),
        antes: { status: 400, motivo: 'codigo-obrigatorio' },
      },
    ];
    const XP_TODAS = 40 + 30 + 20 + 20 + 25 + 15 + 20 + 30;
    const XP_TOTENS_DA_ROTINA = 30;

    const leituraDe = (c: Categoria, semente: number) =>
      c.leitura?.(semente) ?? {};

    beforeAll(async () => {
      autores = [
        await formarDupla(),
        await formarDupla(),
        await formarDupla(),
        await formarDupla(),
      ];
      for (const [i, texto] of [
        'Dica: o SGA libera a rematrícula às 8h, entrem cedo.',
        'Alguém sabe se o RU abre no sábado?',
        'Foto da nossa turma na Semana do Calouro!',
        'Monitoria de Algoritmos mudou para a sala 205 do Prédio 34.',
      ].entries()) {
        posts.push(await publicar(autores[i].padrinho, texto));
      }
      for (const c of CATEGORIAS) {
        const m = await criarMissao(c.corpo());
        expect(m).toMatchObject({
          ativa: true,
          requisito: c.corpo().requisito ?? 'CODIGO',
        });
        ids.set(c.categoria, m.id);
      }
    });

    it.each(CATEGORIAS.map((c) => [c.categoria, c] as const))(
      '%s: aparece, recusa sem a prova, mostra o progresso, conclui com a prova e não repete',
      async (_nome, c) => {
        const id = ids.get(c.categoria)!;
        const dupla = await formarDupla();
        const a = dupla.apadrinhado;
        const corpo = c.corpo();
        const meta = corpo.quantidade ?? 1;
        const contada = !['EVENTO', 'CODIGO'].includes(
          corpo.requisito ?? 'CODIGO',
        );

        const antes = await itemDe(a, id);
        expect(antes).toMatchObject({
          titulo: corpo.titulo,
          tipo: corpo.tipo,
          requisito: corpo.requisito,
          xp: corpo.xp,
          status: 'disponivel',
          progresso: contada ? { atual: 0, meta } : null,
          pronta: !contada,
          conclusao: null,
        });

        const recusa = await concluir(a, id, {});
        expect(recusa.status, JSON.stringify(recusa.body)).toBe(c.antes.status);
        expect(recusa.body.motivo).toBe(c.antes.motivo);
        expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });

        if (c.metade) {
          await c.metade(a, dupla);
          const meio = await itemDe(a, id);
          expect(meio!.progresso).toEqual({ atual: 1, meta });
          expect(meio!.pronta).toBe(false);
          const ainda = await concluir(a, id, {}).expect(422);
          expect(ainda.body).toMatchObject({
            motivo: 'requisito-pendente',
            progresso: { atual: 1, meta },
          });
          expect(ainda.body.message).toContain(`mais ${meta - 1}`);
        }

        await c.cumprir(a, dupla);
        const pronta = await itemDe(a, id);
        expect(pronta!.pronta).toBe(true);
        if (contada) expect(pronta!.progresso).toEqual({ atual: meta, meta });

        const xpTotensAntes = (await carteira(a)).xp_acumulado;
        const r = await concluir(a, id, leituraDe(c, 1));
        expect(r.status, JSON.stringify(r.body)).toBe(201);
        expect(r.body).toMatchObject({
          missaoId: id,
          xpConfigurado: corpo.xp,
          xp: corpo.xp,
          moedas: corpo.xp,
          limitado: false,
          xpAcumulado: xpTotensAntes + corpo.xp,
          ciclo: CICLO,
        });

        const [conclusao] = (await ds.query(
          `SELECT evidencia FROM gamificacao.missoes_conclusoes WHERE id = $1`,
          [r.body.conclusaoId],
        )) as Array<{ evidencia: Record<string, unknown> }>;
        expect(conclusao.evidencia.requisito).toBe(corpo.requisito);
        expect(JSON.stringify(conclusao.evidencia)).not.toMatch(
          /latitude|longitude/,
        );
        if (contada)
          expect(conclusao.evidencia).toMatchObject({ atual: meta, meta });

        const [mov] = (await ds.query(
          `SELECT quantidade, tipo, referencia_id, descricao FROM gamificacao.xp_movimentacoes ` +
            `WHERE usuario_id = $1 AND tipo = 'MISSAO'`,
          [a.id],
        )) as Array<Record<string, unknown>>;
        expect(mov).toMatchObject({
          quantidade: corpo.xp,
          tipo: 'MISSAO',
          referencia_id: id,
          descricao: `Missão: ${corpo.titulo}`,
        });

        expect(await itemDe(a, id)).toMatchObject({
          status: 'concluida',
          pronta: false,
          conclusao: { id: r.body.conclusaoId, xp: corpo.xp, limitado: false },
        });

        const repetida = await concluir(a, id, leituraDe(c, 2)).expect(409);
        expect(repetida.body).toMatchObject({
          motivo: 'ja-concluida',
          conclusao: { id: r.body.conclusaoId, xp: corpo.xp },
        });
        expect((await carteira(a)).xp_acumulado).toBe(xpTotensAntes + corpo.xp);
      },
      30_000,
    );

    it('painel da coordenação conta conclusões e XP creditado por missão', async () => {
      const r = await http()
        .get('/coordenacao/missoes?status=ativa')
        .set('Authorization', coord())
        .expect(200);
      const porId = new Map(
        (
          r.body as Array<{
            id: string;
            conclusoes: number;
            xpCreditadoTotal: number;
          }>
        ).map((m) => [m.id, m]),
      );
      for (const c of CATEGORIAS) {
        const id = ids.get(c.categoria)!;
        const [esperado] = (await ds.query(
          `SELECT count(*)::int AS conclusoes, COALESCE(sum(xp_creditado), 0)::int AS xp ` +
            `FROM gamificacao.missoes_conclusoes WHERE missao_id = $1`,
          [id],
        )) as Array<{ conclusoes: number; xp: number }>;
        expect(esperado.conclusoes).toBeGreaterThan(0);
        expect(porId.get(id)).toMatchObject({
          conclusoes: esperado.conclusoes,
          xpCreditadoTotal: esperado.xp,
        });
      }
    });

    it('semanal concluída em outra semana libera de novo com o código da semana; única não', async () => {
      const a = await novoAluno();
      const outra = outraSemanaDoCiclo();
      const semanal = await criarMissao({
        titulo: 'Vá ao plantão semanal de Cálculo',
        tipo: 'SEMANAL',
        xp: 20,
        codigo: 'PLANTAO-S1',
      });
      const unica = ids.get('ciclo')!;

      const passada = await servicoMissoes.concluir(a.id, semanal.id, outra, {
        codigo: 'PLANTAO-S1',
      });
      expect(passada.semana).not.toBe((await missoesDe(a)).semana);
      await servicoMissoes.concluir(a.id, unica, outra, {
        codigo: 'ENCERRA-2026',
      });

      // Quem já usou o código numa semana não o reaproveita na seguinte,
      // e o código certo repetido não conta como tentativa errada.
      const repetido = await concluir(a, semanal.id, {
        codigo: 'PLANTAO-S1',
      }).expect(422);
      expect(repetido.body.motivo).toBe('codigo-repetido');
      await concluir(await novoAluno(), semanal.id, {
        codigo: 'PLANTAO-S1',
      }).expect(201);

      await http()
        .patch(`/coordenacao/missoes/${semanal.id}`)
        .set('Authorization', coord())
        .send({ codigo: 'PLANTAO-S2', atualizadoEm: semanal.atualizadoEm })
        .expect(200);
      const r = await concluir(a, semanal.id, { codigo: 'PLANTAO-S2' }).expect(
        201,
      );
      expect(r.body).toMatchObject({ xp: 20, limitado: false });
      await concluir(a, unica, { codigo: 'ENCERRA-2026' }).expect(409);
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_tentativas_codigo WHERE usuario_id = $1`,
          [a.id],
        ),
      ).toBe(0);
    });

    it(`${NOMES.length} alunos (11 duplas) fazem as ${CATEGORIAS.length} categorias de verdade e resgatam tudo ao mesmo tempo com pool de ${POOL}`, async () => {
      const duplas: Dupla[] = [];
      for (let i = 0; i < NOMES.length / 2; i++)
        duplas.push(await formarDupla());
      const turma = duplas.flatMap((d) => [
        { a: d.padrinho, d },
        { a: d.apadrinhado, d },
      ]);

      await Promise.all(
        turma.map(async ({ a, d }, i) => {
          await coletar(a, totens.ICEI, i).expect(201);
          await coletar(a, totens.TEATRO, i + 1).expect(201);
          await coletar(a, totens.BIBLIOTECA, i + 2).expect(201);
          await comentar(a, posts[i % 4], COMENTARIOS[i % 4]);
          await comentar(a, posts[(i + 1) % 4], COMENTARIOS[(i + 1) % 4]);
          for (const post of posts.slice(0, 3)) await curtir(a, post);
          for (const texto of [
            'Oi, tudo certo?',
            'Bora na monitoria amanhã?',
            'Fechado, até amanhã!',
          ]) {
            await mandarMensagem(a, d.chatId, texto);
          }
        }),
      );

      const pedidos = turma.flatMap(({ a }, i) =>
        CATEGORIAS.map((c) => ({
          a,
          id: ids.get(c.categoria)!,
          corpo: leituraDe(c, i),
        })),
      );
      const respostas = await Promise.all(
        pedidos.map(({ a, id, corpo }) => concluir(a, id, corpo)),
      );
      const falhas = respostas
        .map((r, i) => [r.status, r.body.motivo, pedidos[i].id] as const)
        .filter(([s]) => s !== 201);
      expect(falhas).toEqual([]);
      for (const r of respostas) expect(r.body.limitado).toBe(false);

      for (const { a } of turma) {
        expect(await carteira(a)).toEqual({
          saldo: XP_TODAS + XP_TOTENS_DA_ROTINA,
          xp_acumulado: XP_TODAS + XP_TOTENS_DA_ROTINA,
        });
        const avisos = (await ds.query(
          `SELECT chave FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = 'NIVEL_SUBIU' ORDER BY chave`,
          [a.id],
        )) as Array<{ chave: string }>;
        expect(avisos.map((n) => n.chave)).toEqual(['nivel:2', 'nivel:3']);
      }

      const repetidas = await Promise.all(
        pedidos.map(({ a, id, corpo }) => concluir(a, id, corpo)),
      );
      expect(new Set(repetidas.map((r) => r.status))).toEqual(new Set([409]));
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE usuario_id = ANY($1)`,
          [turma.map(({ a }) => a.id)],
        ),
      ).toBe(pedidos.length);
    }, 120_000);
  });

  describe('PUCSTOPS: só conta coleta real do semestre', () => {
    it('coleta feita antes da missão existir conta: o totem só se coleta uma vez', async () => {
      const a = await novoAluno();
      await coletar(a, totens.CANTINA).expect(201);
      const m = await criarMissao({
        titulo: 'Colete o PucStop da Cantina',
        tipo: 'UNICA',
        xp: 15,
        requisito: 'PUCSTOPS',
        alvoId: totens.CANTINA.id,
      });
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 1, meta: 1 });
      await concluir(a, m.id).expect(201);
    });

    it('missão de PucStop semanal é recusada: os totens acabariam', async () => {
      const r = await http()
        .post('/coordenacao/missoes')
        .set('Authorization', coord())
        .send({
          titulo: 'Colete um PucStop por semana',
          descricao: 'Ande pelo campus toda semana.',
          tipo: 'SEMANAL',
          xp: 20,
          requisito: 'PUCSTOPS',
        })
        .expect(400);
      expect(r.body.message).toContain('única');
    });

    it('totem errado não conta para missão de totem específico', async () => {
      const m = await criarMissao({
        titulo: 'Colete o PucStop do Prédio 24',
        tipo: 'UNICA',
        xp: 15,
        requisito: 'PUCSTOPS',
        alvoId: totens.PREDIO24.id,
      });
      const a = await novoAluno();
      await coletar(a, totens.TEATRO).expect(201);
      await coletar(a, totens.BIBLIOTECA).expect(201);
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 0, meta: 1 });
      await concluir(a, m.id).expect(422);
      await coletar(a, totens.PREDIO24).expect(201);
      await concluir(a, m.id).expect(201);
    });

    it('coleta de outra pessoa não conta; longe do totem a coleta nem acontece', async () => {
      const m = await criarMissao({
        titulo: 'Colete dois PucStops com sua turma',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'PUCSTOPS',
        quantidade: 2,
      });
      const a = await novoAluno();
      const colega = await novoAluno();
      await coletar(colega, totens.ICEI).expect(201);
      await coletar(colega, totens.TEATRO).expect(201);
      await http()
        .post(`/mapa/pucstops/${totens.ICEI.id}/claim`)
        .set('Authorization', a.auth)
        .send({ ...noPredio('P16'), accuracy: 10 })
        .expect(422);
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 0, meta: 2 });
      await concluir(a, m.id).expect(422);
      expect((await itemDe(colega, m.id))!.pronta).toBe(true);
    });

    it('mesmo totem duas vezes conta uma', async () => {
      const m = await criarMissao({
        titulo: 'Visite dois PucStops diferentes',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'PUCSTOPS',
        quantidade: 2,
      });
      const a = await novoAluno();
      await coletar(a, totens.ICEI).expect(201);
      const repetida = await coletar(a, totens.ICEI, 5).expect(409);
      expect(repetida.body.motivo).toBe('ja-coletado');
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 1, meta: 2 });
      await concluir(a, m.id).expect(422);
    });
  });

  describe('EVENTO: check-in com GPS no prédio, durante o evento', () => {
    let calouro: Missao;
    let oficina: Missao;
    let tour: Missao;

    beforeAll(async () => {
      calouro = await criarMissao({
        titulo: 'Vá à abertura da Semana do Calouro',
        tipo: 'UNICA',
        xp: 30,
        requisito: 'EVENTO',
        alvoId: agenda.SEMANA_CALOURO,
      });
      oficina = await criarMissao({
        titulo: 'Participe da oficina de currículo',
        tipo: 'UNICA',
        xp: 30,
        requisito: 'EVENTO',
        alvoId: agenda.OFICINA_CURRICULO,
      });
      tour = await criarMissao({
        titulo: 'Faça o tour guiado pelo campus',
        tipo: 'UNICA',
        xp: 30,
        requisito: 'EVENTO',
        alvoId: agenda.TOUR_CAMPUS,
      });
    });

    it('a lista mostra o evento, o prédio e quando o check-in abre', async () => {
      const a = await novoAluno();
      const item = await itemDe(a, calouro.id);
      expect(item).toMatchObject({
        requisito: 'EVENTO',
        progresso: null,
        pronta: true,
        alvo: {
          tipo: 'evento',
          id: agenda.SEMANA_CALOURO,
          nome: 'Abertura da Semana do Calouro',
        },
      });
      expect(item!.alvo!.local).toBeTruthy();
      expect(
        await distanciaAoPredio('P30', {
          latitude: item!.alvo!.latitude!,
          longitude: item!.alvo!.longitude!,
        }),
      ).toBe(0);
      expect((await itemDe(a, oficina.id))!.pronta).toBe(false);
    });

    it('o GPS falsificado sozinho não basta: sem o código do evento, nada de XP', async () => {
      const a = await novoAluno();
      const semCodigo = await concluir(a, calouro.id, {
        ...noPredio('P30'),
        accuracy: 0,
        codigo: undefined,
      });
      expect(semCodigo.status).toBe(400);
      expect(semCodigo.body.motivo).toBe('codigo-obrigatorio');
      const chute = await concluir(a, calouro.id, {
        ...noPredio('P30'),
        accuracy: 0,
        codigo: 'CALOURO26',
      }).expect(422);
      expect(chute.body.motivo).toBe('codigo-incorreto');
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_tentativas_codigo WHERE usuario_id = $1`,
          [a.id],
        ),
      ).toBe(1);
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });

    it('código do evento fechado: GPS e código certos não bastam, e não gasta tentativa', async () => {
      await http()
        .delete(`/coordenacao/missoes/${calouro.id}/codigo`)
        .set('Authorization', coord())
        .expect(200);
      try {
        const a = await novoAluno();
        const r = await concluir(a, calouro.id, {
          ...noPredio('P30'),
          accuracy: 0,
        }).expect(422);
        expect(r.body.motivo).toBe('codigo-fechado');
        expect(
          await contar(
            `SELECT count(*) AS n FROM gamificacao.missoes_tentativas_codigo WHERE usuario_id = $1`,
            [a.id],
          ),
        ).toBe(0);
      } finally {
        await liberarCodigo(calouro.id);
      }
    });

    it('código certo longe do evento não vale nem gasta tentativa', async () => {
      const a = await novoAluno();
      const r = await concluir(a, calouro.id, {
        ...noPredio('P16'),
        accuracy: 8,
      }).expect(422);
      expect(r.body.motivo).toBe('fora-do-local');
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_tentativas_codigo WHERE usuario_id = $1`,
          [a.id],
        ),
      ).toBe(0);
      const ok = await concluir(a, calouro.id, {
        ...noPredio('P30'),
        accuracy: 8,
      }).expect(201);
      const [{ evidencia }] = (await ds.query(
        `SELECT evidencia FROM gamificacao.missoes_conclusoes WHERE id = $1`,
        [ok.body.conclusaoId],
      )) as Array<{ evidencia: Record<string, unknown> }>;
      expect(evidencia).toMatchObject({ requisito: 'EVENTO', codigo: true });
    });

    it('localização nula ou fora do formato: 400, nunca vira 0 m', async () => {
      const a = await novoAluno();
      for (const corpo of [
        { latitude: null, longitude: null, accuracy: null },
        { latitude: null, longitude: noPredio('P30').longitude, accuracy: 5 },
        { ...noPredio('P30'), accuracy: null },
        { latitude: '-19.92', longitude: '-43.99', accuracy: '5' },
        { latitude: {}, longitude: [], accuracy: 5 },
      ]) {
        const r = await concluir(a, calouro.id, {
          ...corpo,
          codigo: codigos.get(calouro.id),
        });
        expect(r.status, JSON.stringify(corpo)).toBe(400);
      }
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE usuario_id = $1`,
          [a.id],
        ),
      ).toBe(0);
    });

    it(`API recém-reiniciada: mais check-ins simultâneos que conexões (${POOL}) não travam o pool`, async () => {
      const recemIniciado = new MissoesService(ds, notificacoesServico);
      const publico: Aluno[] = [];
      for (let i = 0; i < POOL * 4; i++) publico.push(await novoAluno());
      const tudo = Promise.all(
        publico.map((a, i) =>
          recemIniciado
            .concluir(a.id, calouro.id, new Date(), {
              ...comRuido(noPredio('P30'), 10, i),
              accuracy: 10,
              codigo: codigos.get(calouro.id),
            })
            .then(() => 'ok'),
        ),
      );
      let espera: ReturnType<typeof setTimeout> | undefined;
      const travou = new Promise<string>((resolve) => {
        espera = setTimeout(() => resolve('travou'), 8000);
      });
      const resultado = await Promise.race([
        tudo.then((r) => r.join()),
        travou,
      ]);
      clearTimeout(espera);
      expect(resultado).toBe(publico.map(() => 'ok').join());
    }, 20_000);

    it('sem localização 400; GPS impreciso 422; em outro prédio 422 com a distância', async () => {
      const a = await novoAluno();
      const sem = await concluir(a, calouro.id, {}).expect(400);
      const semPrecisao = await concluir(a, calouro.id, noPredio('P30')).expect(
        400,
      );
      expect(semPrecisao.body.motivo).toBe('localizacao-obrigatoria');
      expect(sem.body.motivo).toBe('localizacao-obrigatoria');
      const so = await concluir(a, calouro.id, {
        latitude: noPredio('P30').latitude,
      }).expect(400);
      expect(so.body.motivo).toBe('localizacao-obrigatoria');
      const impreciso = await concluir(a, calouro.id, {
        ...noPredio('P30'),
        accuracy: 150,
      }).expect(422);
      expect(impreciso.body.motivo).toBe('precisao-insuficiente');
      const longe = await concluir(a, calouro.id, {
        ...noPredio('P16'),
        accuracy: 10,
      }).expect(422);
      expect(longe.body).toMatchObject({
        motivo: 'fora-do-local',
        raioMetros: RAIO_EVENTO_METROS,
      });
      expect(longe.body.distanciaMetros).toBeGreaterThan(RAIO_EVENTO_METROS);
      await concluir(a, calouro.id, { latitude: 91, longitude: 0 }).expect(400);
      await concluir(a, calouro.id, {
        latitude: 'perto',
        longitude: -43.99,
      }).expect(400);
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });

    it(`raio de ${RAIO_EVENTO_METROS} m medido da borda do prédio`, async () => {
      const dentro = await aDistancia('P30', RAIO_EVENTO_METROS - 10);
      const fora = await aDistancia('P30', RAIO_EVENTO_METROS + 10);
      const a = await novoAluno();
      const r = await concluir(a, calouro.id, { ...fora, accuracy: 5 }).expect(
        422,
      );
      expect(r.body.motivo).toBe('fora-do-local');
      const ok = await concluir(a, calouro.id, {
        ...dentro,
        accuracy: 5,
      }).expect(201);
      expect(ok.body.xp).toBe(30);
      const [{ evidencia }] = (await ds.query(
        `SELECT evidencia FROM gamificacao.missoes_conclusoes WHERE id = $1`,
        [ok.body.conclusaoId],
      )) as Array<{ evidencia: { distanciaMetros: number } }>;
      expect(evidencia.distanciaMetros).toBeGreaterThan(0);
      expect(evidencia.distanciaMetros).toBeLessThanOrEqual(RAIO_EVENTO_METROS);
    });

    it('antes de abrir o check-in: 422; 30 min antes já pode', async () => {
      const a = await novoAluno();
      const cedo = await concluir(a, oficina.id, {
        ...noPredio('P34'),
        accuracy: 10,
      }).expect(422);
      expect(cedo.body.motivo).toBe('evento-nao-comecou');
      expect((await itemDe(a, tour.id))!.pronta).toBe(true);
      await concluir(a, tour.id, { ...noPredio('P26'), accuracy: 10 }).expect(
        201,
      );
    });

    it('evento que acabou ou foi cancelado: some da lista e o check-in direto dá 422', async () => {
      const curto = await eventos.criar(
        {
          titulo: 'Palestra relâmpago sobre intercâmbio',
          inicio: new Date(Date.now() - 30 * MIN).toISOString(),
          fim: new Date(Date.now() + 30 * MIN).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      const cancelado = await eventos.criar(
        {
          titulo: 'Sarau no DCE',
          inicio: new Date(Date.now() - 30 * MIN).toISOString(),
          fim: new Date(Date.now() + 2 * HORA).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      const m1 = await criarMissao({
        titulo: 'Assista à palestra de intercâmbio',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'EVENTO',
        alvoId: curto.id,
      });
      const m2 = await criarMissao({
        titulo: 'Vá ao sarau do DCE',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'EVENTO',
        alvoId: cancelado.id,
      });
      const a = await novoAluno();
      await ds.query(
        `UPDATE mapa.eventos SET inicio = now() - interval '2 hours', fim = now() - interval '1 minute' WHERE id = $1`,
        [curto.id],
      );
      const fim = await concluir(a, m1.id, {
        ...noPredio('P34'),
        accuracy: 10,
      }).expect(422);
      expect(fim.body.motivo).toBe('evento-encerrado');
      expect(await itemDe(a, m1.id)).toBeUndefined();
      await eventos.definirAtivo(cancelado.id, false);
      const off = await concluir(a, m2.id, {
        ...noPredio('P34'),
        accuracy: 10,
      }).expect(422);
      expect(off.body.motivo).toBe('evento-indisponivel');
      expect(await itemDe(a, m2.id)).toBeUndefined();
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });

    it('200 alunos chegam juntos à abertura: todos ganham uma vez', async () => {
      const m = await criarMissao({
        titulo: 'Faça check-in na abertura do semestre',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'EVENTO',
        alvoId: agenda.SEMANA_CALOURO,
      });
      const publico: Aluno[] = [];
      for (let i = 0; i < 200; i++) publico.push(await novoAluno());
      const respostas = await Promise.all(
        publico.flatMap((a, i) => [
          concluir(a, m.id, {
            ...comRuido(noPredio('P30'), 15, i),
            accuracy: 20,
          }),
          concluir(a, m.id, {
            ...comRuido(noPredio('P30'), 15, i + 1),
            accuracy: 20,
          }),
        ]),
      );
      const status = respostas.map((r) => r.status);
      expect(status.filter((s) => s === 201)).toHaveLength(200);
      expect(status.filter((s) => s === 409)).toHaveLength(200);
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE missao_id = $1`,
          [m.id],
        ),
      ).toBe(200);
    }, 120_000);
  });

  describe('FEED: comentário, curtida e publicação de verdade', () => {
    let autores: Dupla[];
    let posts: number[];

    beforeAll(async () => {
      autores = [await formarDupla(), await formarDupla()];
      posts = [
        await publicar(
          autores[0].padrinho,
          'Como foi a primeira semana de vocês?',
        ),
        await publicar(
          autores[1].padrinho,
          'Lista de grupos de estudo do ICEI.',
        ),
        await publicar(autores[1].padrinho, 'Quem vai no sarau de sexta?'),
      ];
    });

    it('o que o aluno fez com a missão em rascunho não conta: a contagem começa na publicação', async () => {
      const m = await criarMissao({
        titulo: 'Comente em dois posts de colegas',
        tipo: 'UNICA',
        xp: 15,
        requisito: 'FEED_COMENTARIOS',
        quantidade: 2,
        ativar: false,
      });
      const a = await novoAluno();
      await comentar(a, posts[0], 'Primeira semana foi corrida, mas valeu!');
      await comentar(
        a,
        posts[1],
        'Valeu pela lista, vou entrar no de Cálculo.',
      );
      await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(200);
      expect((await itemDe(a, m.id))!.progresso).toEqual({
        atual: 0,
        meta: 2,
      });
      await concluir(a, m.id).expect(422);
      await comentar(
        a,
        posts[2],
        'Eu vou! Alguém quer ir junto depois da aula?',
      );
      await comentar(
        a,
        posts[0],
        'Segunda semana já está mais tranquila aqui.',
      );
      expect((await itemDe(a, m.id))!.pronta).toBe(true);
      await concluir(a, m.id).expect(201);
    });

    it('curtida semanal só conta post da semana: curtir de novo post antigo não repete a semanal', async () => {
      const antigo = await publicar(
        autores[0].padrinho,
        'Resumo de Cálculo I da semana passada.',
      );
      await ds.query(
        `UPDATE feed.publicacoes SET criado_em = now() - interval '8 days' WHERE id = $1`,
        [antigo],
      );
      const m = await criarMissao({
        titulo: 'Curta um post de colega nesta semana',
        tipo: 'SEMANAL',
        xp: 10,
        requisito: 'FEED_CURTIDAS',
        quantidade: 1,
      });
      const a = autores[1].apadrinhado;
      await curtir(a, antigo);
      expect((await itemDe(a, m.id))!.progresso).toEqual({
        atual: 0,
        meta: 1,
      });
      const falta = await concluir(a, m.id).expect(422);
      expect(falta.body.message).toBe(
        'Curta mais 1 publicação de colegas feita nesta semana.',
      );
      const novo = await publicar(
        autores[0].padrinho,
        'Alguém tem o link da monitoria de hoje?',
      );
      await curtir(a, novo);
      await concluir(a, m.id).expect(201);
    });

    it(`comentário com menos de ${COMENTARIO_MISSAO_MIN} caracteres não conta`, async () => {
      const m = await criarMissao({
        titulo: 'Deixe um comentário útil no feed',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_COMENTARIOS',
      });
      const a = await novoAluno();
      for (const curto of ['ok', 'kkkk', 'boa!!', '👍👍👍', 'top demais']) {
        if (curto.trim().length >= COMENTARIO_MISSAO_MIN) continue;
        await comentar(a, posts[0], curto);
      }
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 0, meta: 1 });
      await concluir(a, m.id).expect(422);
      await comentar(a, posts[0], 'Foi corrida, mas o pessoal ajudou muito.');
      await concluir(a, m.id).expect(201);
    });

    it('comentário no próprio post não conta', async () => {
      const m = await criarMissao({
        titulo: 'Converse com os colegas no feed',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_COMENTARIOS',
      });
      const autor = autores[0].padrinho;
      await comentar(
        autor,
        posts[0],
        'Respondendo aqui quem perguntou no meu post.',
      );
      expect((await itemDe(autor, m.id))!.progresso).toEqual({
        atual: 0,
        meta: 1,
      });
      await concluir(autor, m.id).expect(422);
      await comentar(
        autor,
        posts[1],
        'Boa lista, vou mandar para minha afilhada.',
      );
      await concluir(autor, m.id).expect(201);
    });

    it('vários comentários no mesmo post contam uma vez: valem posts diferentes', async () => {
      const m = await criarMissao({
        titulo: 'Comente em dois posts diferentes',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_COMENTARIOS',
        quantidade: 2,
      });
      const a = await novoAluno();
      await comentar(a, posts[0], 'Primeira semana foi puxada demais aqui.');
      await comentar(a, posts[0], 'E a segunda já começou com prova, socorro.');
      await comentar(a, posts[0], 'Mas o pessoal da turma é muito gente boa.');
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 1, meta: 2 });
      const falta = await concluir(a, m.id).expect(422);
      expect(falta.body).toMatchObject({
        motivo: 'requisito-pendente',
        message: 'Comente em mais 1 post de colegas.',
        progresso: { atual: 1, meta: 2 },
      });
      await comentar(
        a,
        posts[1],
        'Valeu pela lista, vou entrar no de Cálculo.',
      );
      await concluir(a, m.id).expect(201);
    });

    it('comentário de outra pessoa não conta para mim', async () => {
      const m = await criarMissao({
        titulo: 'Responda uma pergunta no feed',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_COMENTARIOS',
      });
      const a = await novoAluno();
      const colega = await novoAluno();
      await comentar(
        colega,
        posts[1],
        'Entra no grupo de Algoritmos, é ótimo.',
      );
      expect((await itemDe(a, m.id))!.pronta).toBe(false);
      expect((await itemDe(colega, m.id))!.pronta).toBe(true);
    });

    it('semanal: comentário da semana passada não conta', async () => {
      const m = await criarMissao({
        titulo: 'Comente duas vezes nesta semana',
        tipo: 'SEMANAL',
        xp: 20,
        requisito: 'FEED_COMENTARIOS',
        quantidade: 2,
        inicio: iso(Date.now() - 30 * DIA),
      });
      const a = await novoAluno();
      await comentar(a, posts[0], 'Semana passada foi puxada, mas deu certo.');
      await comentar(a, posts[1], 'Vou entrar no grupo de Cálculo também.');
      expect((await itemDe(a, m.id))!.pronta).toBe(true);
      await ds.query(
        `UPDATE feed.comentarios SET criado_em = criado_em - interval '8 days' WHERE autor_id = $1`,
        [a.email],
      );
      expect((await itemDe(a, m.id))!.progresso).toEqual({ atual: 0, meta: 2 });
      await concluir(a, m.id).expect(422);
    });

    it('curtir o próprio post não conta; curtir duas vezes conta uma; descurtir tira', async () => {
      const m = await criarMissao({
        titulo: 'Curta dois posts de colegas',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_CURTIDAS',
        quantidade: 2,
      });
      const autor = autores[0].padrinho;
      await curtir(autor, posts[0]);
      await curtir(autor, posts[1]);
      await curtir(autor, posts[1]);
      expect((await itemDe(autor, m.id))!.progresso).toEqual({
        atual: 1,
        meta: 2,
      });
      await curtir(autor, posts[2]);
      expect((await itemDe(autor, m.id))!.pronta).toBe(true);
      await curtir(autor, posts[2], -1);
      expect((await itemDe(autor, m.id))!.progresso).toEqual({
        atual: 1,
        meta: 2,
      });
      await concluir(autor, m.id).expect(422);
      await curtir(autor, posts[2]);
      await concluir(autor, m.id).expect(201);
    });

    it('publicação curta não conta; com foto e sem texto conta', async () => {
      const m = await criarMissao({
        titulo: 'Publique uma dica sobre o semestre',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'FEED_PUBLICACOES',
      });
      const dupla = await formarDupla();
      const padrinho = dupla.padrinho;
      await publicar(padrinho, 'ok');
      await publicar(padrinho, '  boa!!  ');
      expect((await itemDe(padrinho, m.id))!.progresso).toEqual({
        atual: 0,
        meta: 1,
      });
      await concluir(padrinho, m.id).expect(422);
      await ds.query(
        `INSERT INTO feed.publicacoes (autor, iniciais, descricao_autor, categoria, texto, imagens, owner_id, programa_codigo) ` +
          `VALUES ($1, 'PD', 'Padrinho do programa', 'Campus', '', ARRAY['feed/publicacoes/abc/0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d.png'], $2, $3)`,
        [padrinho.nome, padrinho.email, CICLO],
      );
      expect((await itemDe(padrinho, m.id))!.progresso).toEqual({
        atual: 1,
        meta: 1,
      });
      await concluir(padrinho, m.id).expect(201);
    });

    it('missão de publicar só existe para quem pode publicar', async () => {
      const m = await criarMissao({
        titulo: 'Publique duas dicas para os calouros',
        tipo: 'SEMANAL',
        xp: 20,
        requisito: 'FEED_PUBLICACOES',
        quantidade: 2,
      });
      const semPar = await novoAluno({ papel: 'padrinho' });
      const dupla = await formarDupla();
      for (const a of [dupla.apadrinhado, semPar]) {
        expect(await itemDe(a, m.id)).toBeUndefined();
        await concluir(a, m.id).expect(404);
      }
      await expect(
        publicar(dupla.apadrinhado, 'Posso postar?'),
      ).rejects.toThrow();
      const padrinho = dupla.padrinho;
      expect((await itemDe(padrinho, m.id))!.progresso).toEqual({
        atual: 0,
        meta: 2,
      });
      await publicar(padrinho, 'Dica 1: salvem o mapa do campus no app.');
      await concluir(padrinho, m.id).expect(422);
      await publicar(padrinho, 'Dica 2: o RU tem opção vegetariana todo dia.');
      await concluir(padrinho, m.id).expect(201);
    });
  });

  describe('CHAT: mensagens no chat do grupo', () => {
    let m: Missao;

    beforeAll(async () => {
      m = await criarMissao({
        titulo: 'Converse com sua dupla',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'CHAT_MENSAGENS',
        quantidade: 3,
      });
    });

    it('quem não tem par não vê a missão', async () => {
      const a = await novoAluno({ status: 'aprovado' });
      expect(await itemDe(a, m.id)).toBeUndefined();
      await concluir(a, m.id).expect(404);
    });

    it(`mensagem com menos de ${MENSAGEM_MISSAO_MIN} caracteres não conta; a do par não conta para mim`, async () => {
      const d = await formarDupla();
      await mandarMensagem(d.padrinho, d.chatId, 'Oi! Tudo bem por aí?');
      await mandarMensagem(d.padrinho, d.chatId, 'Me avisa quando chegar.');
      await mandarMensagem(d.padrinho, d.chatId, 'Estou no Prédio 34.');
      await mandarMensagem(d.apadrinhado, d.chatId, 'k');
      await mandarMensagem(d.apadrinhado, d.chatId, 'Oi, tudo?');
      await mandarMensagem(d.apadrinhado, d.chatId, 'Valeu! 👍');
      expect((await itemDe(d.apadrinhado, m.id))!.progresso).toEqual({
        atual: 0,
        meta: 3,
      });
      expect((await itemDe(d.padrinho, m.id))!.pronta).toBe(true);
      await concluir(d.apadrinhado, m.id).expect(422);
      await concluir(d.padrinho, m.id).expect(201);
    });

    it('vínculo encerrado: o chat trava e a missão some', async () => {
      const d = await formarDupla();
      await mandarMensagem(d.apadrinhado, d.chatId, 'Oi, sou sua afilhada!');
      await ds.query(
        `UPDATE feed.matching_vinculos SET ativo = false, encerrado_em = now() WHERE id = $1`,
        [d.vinculoId],
      );
      await http()
        .post(`/chats/${d.chatId}/mensagens`)
        .set('Authorization', d.apadrinhado.auth)
        .send({ texto: 'Ainda está aí?', clientId: crypto.randomUUID() })
        .expect(409);
      expect(await itemDe(d.apadrinhado, m.id)).toBeUndefined();
      await concluir(d.apadrinhado, m.id).expect(404);
    });
  });

  describe('CODIGO: código da atividade presencial', () => {
    it('aceita maiúsculas/minúsculas e espaços; recusa código de outra missão', async () => {
      const palestra = await criarMissao({
        titulo: 'Assista à palestra sobre estágio',
        tipo: 'UNICA',
        xp: 20,
        codigo: 'ESTAGIO-26',
      });
      const oficina = await criarMissao({
        titulo: 'Vá à oficina de LinkedIn',
        tipo: 'UNICA',
        xp: 20,
        codigo: 'LINKEDIN',
      });
      const a = await novoAluno();
      const errado = await concluir(a, palestra.id, {
        codigo: 'LINKEDIN',
      }).expect(422);
      expect(errado.body.motivo).toBe('codigo-incorreto');
      await concluir(a, palestra.id, { codigo: '  estagio - 26 ' }).expect(201);
      await concluir(a, oficina.id, { codigo: 'linkedin' }).expect(201);
    });

    it('o código nunca aparece para o aluno', async () => {
      const m = await criarMissao({
        titulo: 'Passe no estande do programa',
        tipo: 'UNICA',
        xp: 10,
        codigo: 'ESTANDE-SEGREDO',
      });
      const a = await novoAluno();
      const r = await listar(a).expect(200);
      expect(JSON.stringify(r.body)).not.toContain('ESTANDE-SEGREDO');
      expect(
        r.body.missoes.find((x: ItemLista) => x.id === m.id),
      ).not.toHaveProperty('codigo');
    });

    it(`${TENTATIVAS_CODIGO_POR_HORA} erros em uma hora bloqueiam, até com o código certo; outro aluno não é afetado`, async () => {
      const m = await criarMissao({
        titulo: 'Participe do encontro de padrinhos',
        tipo: 'UNICA',
        xp: 20,
        codigo: 'ENCONTRO-NOV',
      });
      const a = await novoAluno();
      const b = await novoAluno();
      for (let i = 0; i < TENTATIVAS_CODIGO_POR_HORA; i++) {
        const r = await concluir(a, m.id, { codigo: `CHUTE-${i}` }).expect(422);
        expect(r.body.motivo).toBe('codigo-incorreto');
      }
      const bloqueado = await concluir(a, m.id, {
        codigo: 'ENCONTRO-NOV',
      }).expect(429);
      expect(bloqueado.body.motivo).toBe('muitas-tentativas');
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
      await concluir(b, m.id, { codigo: 'ENCONTRO-NOV' }).expect(201);
      await ds.query(
        `UPDATE gamificacao.missoes_tentativas_codigo SET criado_em = criado_em - interval '61 minutes' WHERE usuario_id = $1`,
        [a.id],
      );
      await concluir(a, m.id, { codigo: 'ENCONTRO-NOV' }).expect(201);
    });

    it('chute em massa ao mesmo tempo também é contado', async () => {
      const m = await criarMissao({
        titulo: 'Vá ao plantão de dúvidas do ICEI',
        tipo: 'UNICA',
        xp: 20,
        codigo: 'PLANTAO-ICEI',
      });
      const a = await novoAluno();
      const respostas = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          concluir(a, m.id, { codigo: `TESTE${1000 + i}` }),
        ),
      );
      const status = respostas.map((r) => r.status);
      expect(status.filter((s) => s === 422)).toHaveLength(
        TENTATIVAS_CODIGO_POR_HORA,
      );
      expect(status.filter((s) => s === 429)).toHaveLength(
        30 - TENTATIVAS_CODIGO_POR_HORA,
      );
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_tentativas_codigo WHERE usuario_id = $1`,
          [a.id],
        ),
      ).toBe(TENTATIVAS_CODIGO_POR_HORA);
      await concluir(a, m.id, { codigo: 'PLANTAO-ICEI' }).expect(429);
    });

    it('a coordenação troca o código: o antigo deixa de valer', async () => {
      const m = await criarMissao({
        titulo: 'Participe da roda de conversa',
        tipo: 'UNICA',
        xp: 20,
        codigo: 'RODA-1',
      });
      const a = await novoAluno();
      await concluir(await novoAluno(), m.id, { codigo: 'RODA-1' }).expect(201);
      await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({ codigo: 'RODA-2', atualizadoEm: m.atualizadoEm })
        .expect(200);
      await concluir(a, m.id, { codigo: 'RODA-1' }).expect(422);
      await concluir(a, m.id, { codigo: 'RODA-2' }).expect(201);
    });

    it('o código só vale enquanto a coordenação deixa liberado: fechado, vencido ou encerrado não vale nem gasta tentativa', async () => {
      const m = await criarMissao({
        titulo: 'Assista à palestra de boas-vindas',
        tipo: 'UNICA',
        xp: 20,
        codigo: 'PALESTRA-1',
        ativar: false,
      });
      const publicada = (
        await http()
          .post(`/coordenacao/missoes/${m.id}/ativar`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      expect(publicada.codigoLiberadoAte).toBeNull();
      const a = await novoAluno();
      expect(await itemDe(a, m.id)).toMatchObject({ codigoLiberadoAte: null });
      for (const codigo of ['PALESTRA-1', 'CHUTE-1']) {
        // Fechado, nem confere: não revela se o código estava certo.
        const r = await concluir(a, m.id, { codigo }).expect(422);
        expect(r.body.motivo).toBe('codigo-fechado');
      }
      const tentativas = (aluno: Aluno) =>
        contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_tentativas_codigo WHERE usuario_id = $1`,
          [aluno.id],
        );
      expect(await tentativas(a)).toBe(0);

      const liberada = await liberarCodigo(m.id, 10);
      const restante = Date.parse(liberada.codigoLiberadoAte!) - Date.now();
      expect(restante).toBeGreaterThan(9 * 60_000);
      expect(restante).toBeLessThanOrEqual(10 * 60_000 + 5_000);
      expect(liberada.atualizadoEm).toBe(publicada.atualizadoEm);
      expect((await itemDe(a, m.id))!.codigoLiberadoAte).toBe(
        liberada.codigoLiberadoAte,
      );
      await concluir(a, m.id, { codigo: 'PALESTRA-1' }).expect(201);

      // Quem recebeu o código depois que o tempo acabou não usa.
      await ds.query(
        `UPDATE gamificacao.missoes SET codigo_liberado_ate = now() - interval '1 second' WHERE id = $1`,
        [m.id],
      );
      const atrasado = await novoAluno();
      expect(await itemDe(atrasado, m.id)).toMatchObject({
        codigoLiberadoAte: null,
      });
      const vencido = await concluir(atrasado, m.id, {
        codigo: 'PALESTRA-1',
      }).expect(422);
      expect(vencido.body.motivo).toBe('codigo-fechado');

      await liberarCodigo(m.id, 5);
      const encerrada = await http()
        .delete(`/coordenacao/missoes/${m.id}/codigo`)
        .set('Authorization', coord())
        .expect(200);
      expect(encerrada.body.codigoLiberadoAte).toBeNull();
      await concluir(atrasado, m.id, { codigo: 'PALESTRA-1' }).expect(422);
      expect(await tentativas(atrasado)).toBe(0);
      expect(await carteira(atrasado)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });

    it('liberar o código: só missão publicada, no período e com código; aluno não libera', async () => {
      const liberar = (id: string, corpo: object, auth = coord()) =>
        http()
          .post(`/coordenacao/missoes/${id}/codigo`)
          .set('Authorization', auth)
          .send(corpo);
      const rascunho = await criarMissao({
        titulo: 'Oficina de oratória (rascunho)',
        tipo: 'UNICA',
        xp: 10,
        ativar: false,
      });
      expect(
        (await liberar(rascunho.id, { minutos: 10 }).expect(422)).body.motivo,
      ).toBe('missao-nao-publicada');
      const curtidas = await criarMissao({
        titulo: 'Curta um post do feed',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_CURTIDAS',
      });
      expect(
        (await liberar(curtidas.id, { minutos: 10 }).expect(422)).body.motivo,
      ).toBe('sem-codigo');
      const agendada = await criarMissao({
        titulo: 'Oficina de oratória da semana que vem',
        tipo: 'UNICA',
        xp: 10,
        inicio: iso(Date.now() + DIA),
      });
      expect(agendada.codigoLiberadoAte).toBeNull();
      expect(
        (await liberar(agendada.id, { minutos: 10 }).expect(422)).body.motivo,
      ).toBe('fora-do-periodo');
      for (const corpo of [
        {},
        { minutos: 0 },
        { minutos: 121 },
        { minutos: 1.5 },
      ]) {
        await liberar(rascunho.id, corpo).expect(400);
      }
      const a = await novoAluno();
      await liberar(rascunho.id, { minutos: 10 }, a.auth).expect(403);
      await http()
        .delete(`/coordenacao/missoes/${rascunho.id}/codigo`)
        .set('Authorization', a.auth)
        .expect(403);
    });
  });

  describe('prazo, ativação e ciclo', () => {
    it('agendada para começar depois: fora da lista e 422 ao concluir', async () => {
      const inicio = new Date(Date.now() + 2 * DIA);
      const m = await criarMissao({
        titulo: 'Inscreva-se na Feira de Estágios',
        tipo: 'UNICA',
        xp: 30,
        inicio: iso(inicio.getTime()),
      });
      const a = await novoAluno();
      expect(await itemDe(a, m.id)).toBeUndefined();
      const r = await concluir(a, m.id).expect(422);
      expect(r.body).toMatchObject({
        motivo: 'fora-do-periodo',
        message: 'Esta missão ainda não começou.',
        inicio: inicio.toISOString(),
      });
      expect(await carteira(a)).toEqual({ saldo: 0, xp_acumulado: 0 });
    });

    it('prazo vencido: sai da lista, 422 ao concluir e não reativa', async () => {
      const m = await criarMissao({
        titulo: 'Confirme presença na palestra de carreira',
        tipo: 'UNICA',
        xp: 20,
        fim: iso(Date.now() + DIA),
      });
      const a = await novoAluno();
      expect(await itemDe(a, m.id)).toBeDefined();
      await ds.query(
        `UPDATE gamificacao.missoes SET inicio = now() - interval '3 days', fim = now() - interval '1 minute' WHERE id = $1`,
        [m.id],
      );
      expect(await itemDe(a, m.id)).toBeUndefined();
      const r = await concluir(a, m.id).expect(422);
      expect(r.body).toMatchObject({
        motivo: 'fora-do-periodo',
        message: 'O prazo desta missão já terminou.',
      });
      await http()
        .post(`/coordenacao/missoes/${m.id}/desativar`)
        .set('Authorization', coord())
        .expect(200);
      const reativar = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(422);
      expect(reativar.body.motivo).toBe('fora-do-periodo');
    });

    it('desativar tira da lista, bloqueia e fecha o código; reativar devolve', async () => {
      const m = await criarMissao({
        titulo: 'Doe um livro para a campanha da biblioteca',
        tipo: 'UNICA',
        xp: 25,
      });
      const a = await novoAluno();
      await http()
        .post(`/coordenacao/missoes/${m.id}/desativar`)
        .set('Authorization', coord())
        .expect(200);
      expect(await itemDe(a, m.id)).toBeUndefined();
      await concluir(a, m.id).expect(404);

      const ativa = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(200);
      expect(ativa.body).toMatchObject({
        ativa: true,
        vigenteAgora: true,
        codigoLiberadoAte: null,
      });
      await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(200);
      expect(await itemDe(a, m.id)).toBeDefined();
      const fechado = await concluir(a, m.id).expect(422);
      expect(fechado.body.motivo).toBe('codigo-fechado');
      await liberarCodigo(m.id);
      await concluir(a, m.id).expect(201);
    });

    it('missão do semestre passado não aparece nem conclui', async () => {
      const m = await criarMissao({
        titulo: 'Participe do encerramento do semestre passado',
        tipo: 'UNICA',
        xp: 40,
      });
      await ds.query(
        `UPDATE gamificacao.missoes SET ciclo = $2 WHERE id = $1`,
        [m.id, CICLO_ANTERIOR],
      );
      const a = await novoAluno();
      expect(await itemDe(a, m.id)).toBeUndefined();
      await concluir(a, m.id).expect(404);
      const daCoordenacao = await http()
        .get(`/coordenacao/missoes?ciclo=${encodeURIComponent(CICLO_ANTERIOR)}`)
        .set('Authorization', coord())
        .expect(200);
      expect(daCoordenacao.body.map((x: { id: string }) => x.id)).toContain(
        m.id,
      );
    });

    it('id que não existe: 404; id malformado ou de outra versão de UUID: 400', async () => {
      const a = await novoAluno();
      await concluir(a, 'b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d').expect(404);
      await concluir(a, 'missao-da-biblioteca').expect(400);
      await concluir(a, '1; DROP TABLE gamificacao.missoes').expect(400);
      await concluir(a, 'b3f1c2d4-5e6f-1a7b-8c9d-0e1f2a3b4c5d').expect(400);
      expect(
        await contar(`SELECT count(*) AS n FROM gamificacao.missoes`),
      ).toBeGreaterThan(0);
    });
  });

  describe('edição pela coordenação', () => {
    it('XP muda no rascunho; publicada, o aluno recebe o XP que viu', async () => {
      const m = await criarMissao({
        titulo: 'Visite o Centro de Esportes',
        tipo: 'UNICA',
        xp: 20,
        ativar: false,
      });
      expect(m).toMatchObject({ estado: 'rascunho', publicadaEm: null });
      const editada = await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({ xp: 35, atualizadoEm: m.atualizadoEm })
        .expect(200);
      expect(editada.body.xp).toBe(35);
      const publicada = (
        await http()
          .post(`/coordenacao/missoes/${m.id}/ativar`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      expect(publicada).toMatchObject({ estado: 'publicada', xp: 35 });
      expect(publicada.publicadaEm).not.toBeNull();
      await liberarCodigo(m.id);

      const a = await novoAluno();
      expect(await itemDe(a, m.id)).toMatchObject({ xp: 35, xpPrevisto: 35 });
      const recusada = await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({ xp: 50, atualizadoEm: publicada.atualizadoEm })
        .expect(409);
      expect(recusada.body).toMatchObject({
        motivo: 'missao-publicada',
        campos: ['xp'],
      });
      const r = await concluir(a, m.id).expect(201);
      expect(r.body).toMatchObject({ xp: 35, xpConfigurado: 35 });
      expect((await itemDe(a, m.id))!.conclusao).toMatchObject({ xp: 35 });
    });

    it('duas pessoas editando: a segunda recebe 409 missao-alterada', async () => {
      const m = await criarMissao({
        titulo: 'Assista à defesa de TCC de um veterano',
        tipo: 'UNICA',
        xp: 30,
      });
      await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({
          titulo: 'Assista a uma defesa de TCC',
          atualizadoEm: m.atualizadoEm,
        })
        .expect(200);
      const r = await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({ xp: 60, atualizadoEm: m.atualizadoEm })
        .expect(409);
      expect(r.body.motivo).toBe('missao-alterada');
    });

    it('alvo desativado depois não trava a edição do título nem do prazo', async () => {
      const posto = await pucstopsAdmin.criar(
        {
          nome: 'PucStop da Capela',
          ...noPredio('P12'),
          xp: 10,
          raioMetros: 25,
        },
        null,
      );
      const m = await criarMissao({
        titulo: 'Visite a Capela',
        tipo: 'UNICA',
        xp: 15,
        requisito: 'PUCSTOPS',
        alvoId: posto.id,
        fim: iso(Date.now() + 2 * DIA),
      });
      await pucstopsAdmin.definirAtivo(posto.id, false);
      const r = await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({
          titulo: 'Visite a Capela do campus',
          fim: iso(Date.now() + 5 * DIA),
          atualizadoEm: m.atualizadoEm,
        })
        .expect(200);
      expect(r.body).toMatchObject({
        titulo: 'Visite a Capela do campus',
        alvoId: null,
        pontos: [{ id: posto.id, nome: 'PucStop da Capela' }],
      });
      await http()
        .post(`/coordenacao/missoes/${m.id}/desativar`)
        .set('Authorization', coord())
        .expect(200);
      const reativar = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(422);
      expect(reativar.body.motivo).toBe('alvo-invalido');
    });

    it('missão de evento que já acabou não volta a ser ativada', async () => {
      const palestra = await eventos.criar(
        {
          titulo: 'Palestra sobre bolsas de pesquisa',
          inicio: new Date(Date.now() + HORA).toISOString(),
          fim: new Date(Date.now() + 2 * HORA).toISOString(),
          local: { predioId: 'P34' },
        },
        null,
      );
      const m = await criarMissao({
        titulo: 'Assista à palestra sobre bolsas',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'EVENTO',
        alvoId: palestra.id,
      });
      await http()
        .post(`/coordenacao/missoes/${m.id}/desativar`)
        .set('Authorization', coord())
        .expect(200);
      await ds.query(
        `UPDATE mapa.eventos SET inicio = now() - interval '3 hours', fim = now() - interval '1 hour' WHERE id = $1`,
        [palestra.id],
      );
      const r = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(422);
      expect(r.body.message).toContain('já terminou');
    });

    it('virar semanal uma missão de evento ou de PucStop: 400 explicando, nunca 500', async () => {
      for (const corpo of [
        {
          titulo: 'Vá à oficina de LinkedIn no ICEI',
          requisito: 'EVENTO' as const,
          alvoId: agenda.OFICINA_CURRICULO,
        },
        {
          titulo: 'Colete o PucStop do Teatro',
          requisito: 'PUCSTOPS' as const,
          alvoId: totens.TEATRO.id,
        },
      ]) {
        const m = await criarMissao({
          ...corpo,
          tipo: 'UNICA',
          xp: 30,
          ativar: false,
        });
        const r = await http()
          .patch(`/coordenacao/missoes/${m.id}`)
          .set('Authorization', coord())
          .send({ tipo: 'SEMANAL', atualizadoEm: m.atualizadoEm });
        expect(r.status, JSON.stringify(r.body)).toBe(400);
        expect(r.body.message).toContain('única');

        const publicada = (
          await http()
            .post(`/coordenacao/missoes/${m.id}/ativar`)
            .set('Authorization', coord())
            .expect(200)
        ).body as Missao;
        const congelada = await http()
          .patch(`/coordenacao/missoes/${m.id}`)
          .set('Authorization', coord())
          .send({ tipo: 'SEMANAL', atualizadoEm: publicada.atualizadoEm })
          .expect(409);
        expect(congelada.body.motivo).toBe('missao-publicada');
      }
    });

    it('publicada: tipo, objetivo, meta, pontos, público, início e XP ficam; texto e código mudam e o prazo só prorroga', async () => {
      const rascunho = await criarMissao({
        titulo: 'Colete dois PucStops com sua dupla',
        tipo: 'UNICA',
        xp: 80,
        requisito: 'PUCSTOPS',
        quantidade: 2,
        fim: iso(Date.now() + 5 * DIA),
        ativar: false,
      });
      const semTeto = await http()
        .patch(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', coord())
        .send({ tipo: 'SEMANAL', atualizadoEm: rascunho.atualizadoEm })
        .expect(400);
      expect(semTeto.body.message).toBe(
        `Missão semanal limitada a ${LIMITES.missoesSemanais} XP.`,
      );
      const m = (
        await http()
          .post(`/coordenacao/missoes/${rascunho.id}/ativar`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      const a = await novoAluno();
      await coletar(a, totens.CANTINA).expect(201);
      await coletar(a, totens.PREDIO24).expect(201);
      await concluir(a, m.id).expect(201);
      for (const [mudanca, campos] of [
        [{ tipo: 'SEMANAL', xp: 40 }, ['tipo', 'xp']],
        [{ quantidade: 1 }, ['quantidade']],
        [{ requisito: 'CODIGO', codigo: 'FACIL' }, ['requisito']],
        [{ alvoId: totens.ICEI.id, quantidade: 1 }, ['quantidade', 'alvoIds']],
        [{ alvoIds: [totens.ICEI.id, totens.TEATRO.id] }, ['alvoIds']],
        [{ publico: 'PADRINHOS' }, ['publico']],
        [{ inicio: iso(Date.now() + DIA) }, ['inicio']],
        [{ fim: iso(Date.now() + 2 * DIA) }, ['fim']],
        [{ xp: 40, fim: iso(Date.now() + 2 * DIA) }, ['xp', 'fim']],
      ] as const) {
        const r = await http()
          .patch(`/coordenacao/missoes/${m.id}`)
          .set('Authorization', coord())
          .send({ ...mudanca, atualizadoEm: m.atualizadoEm })
          .expect(409);
        expect(r.body, JSON.stringify(mudanca)).toMatchObject({
          motivo: 'missao-publicada',
          campos,
        });
      }
      const fim = iso(Date.now() + 10 * DIA);
      const editada = await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({
          titulo: 'Colete dois PucStops com sua dupla de calouros',
          instrucoes: 'Os totens ficam na entrada dos prédios.',
          fim,
          xp: 80,
          atualizadoEm: m.atualizadoEm,
        })
        .expect(200);
      expect(editada.body).toMatchObject({
        titulo: 'Colete dois PucStops com sua dupla de calouros',
        instrucoes: 'Os totens ficam na entrada dos prédios.',
        fim: new Date(fim).toISOString(),
        xp: 80,
        quantidade: 2,
        estado: 'publicada',
      });
      expect((await itemDe(await novoAluno(), m.id))!.instrucoes).toBe(
        'Os totens ficam na entrada dos prédios.',
      );
      const semPrazo = await http()
        .patch(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .send({ fim: null, atualizadoEm: editada.body.atualizadoEm })
        .expect(200);
      expect(semPrazo.body.fim).toBeNull();
    });
  });

  describe('ciclo de vida, público e pontos da missão (F22)', () => {
    it('rascunho: só a coordenação vê e pode excluir; publicada arquiva e volta igual', async () => {
      const a = await novoAluno();
      const rascunho = await criarMissao({
        titulo: 'Conheça a Pastoral Universitária',
        tipo: 'UNICA',
        xp: 15,
        ativar: false,
      });
      expect(rascunho).toMatchObject({
        estado: 'rascunho',
        ativa: false,
        publicadaEm: null,
      });
      expect(await itemDe(a, rascunho.id)).toBeUndefined();
      await concluir(a, rascunho.id).expect(404);
      await http()
        .delete(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', a.auth)
        .expect(403);
      await http()
        .delete(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', coord())
        .expect(204);
      await http()
        .get(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', coord())
        .expect(404);
      await http()
        .delete(`/coordenacao/missoes/${rascunho.id}`)
        .set('Authorization', coord())
        .expect(404);

      const m = await criarMissao({
        titulo: 'Participe de um ensaio do coral',
        tipo: 'UNICA',
        xp: 15,
      });
      expect(m.estado).toBe('publicada');
      const naoExclui = await http()
        .delete(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .expect(409);
      expect(naoExclui.body.motivo).toBe('missao-publicada');
      await concluir(a, m.id).expect(201);

      const arquivada = (
        await http()
          .post(`/coordenacao/missoes/${m.id}/desativar`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      expect(arquivada).toMatchObject({
        estado: 'arquivada',
        ativa: false,
        publicadaEm: m.publicadaEm,
      });
      expect(await itemDe(await novoAluno(), m.id)).toBeUndefined();
      await http()
        .delete(`/coordenacao/missoes/${m.id}`)
        .set('Authorization', coord())
        .expect(409);
      const deVolta = (
        await http()
          .post(`/coordenacao/missoes/${m.id}/ativar`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      expect(deVolta).toMatchObject({
        estado: 'publicada',
        publicadaEm: m.publicadaEm,
        xp: 15,
      });
      expect((await itemDe(a, m.id))!.status).toBe('concluida');
    });

    it('exploração com vários PucStops: mostra os pontos, aponta o próximo e só conta os escolhidos', async () => {
      const roteiro = [totens.CANTINA.id, totens.PREDIO24.id, totens.ICEI.id];
      const m = await criarMissao({
        titulo: 'Faça o roteiro de três prédios do campus',
        tipo: 'UNICA',
        xp: 60,
        requisito: 'PUCSTOPS',
        alvoIds: roteiro,
        instrucoes: 'Os totens ficam na entrada de cada prédio.',
      });
      expect(m).toMatchObject({ quantidade: 3, alvoId: null });
      expect(m.pontos.map((p) => p.id)).toEqual(roteiro);

      const a = await novoAluno();
      await coletar(a, totens.TEATRO).expect(201);
      let item = (await itemDe(a, m.id))!;
      expect(item).toMatchObject({
        progresso: { atual: 0, meta: 3 },
        pronta: false,
        instrucoes: 'Os totens ficam na entrada de cada prédio.',
        alvo: { tipo: 'pucstop', id: totens.CANTINA.id },
      });
      expect(item.pontos!.map((p) => [p.id, p.coletado])).toEqual(
        roteiro.map((id) => [id, false]),
      );
      expect(item.pontos![0].latitude).toEqual(expect.any(Number));

      await coletar(a, totens.CANTINA).expect(201);
      item = (await itemDe(a, m.id))!;
      expect(item).toMatchObject({
        progresso: { atual: 1, meta: 3 },
        alvo: { id: totens.PREDIO24.id },
      });
      expect(item.pontos!.map((p) => p.coletado)).toEqual([true, false, false]);
      const falta = await concluir(a, m.id).expect(422);
      expect(falta.body).toMatchObject({
        motivo: 'requisito-pendente',
        progresso: { atual: 1, meta: 3 },
      });

      await coletar(a, totens.ICEI).expect(201);
      await coletar(a, totens.PREDIO24).expect(201);
      expect((await itemDe(a, m.id))!.pronta).toBe(true);
      await concluir(a, m.id).expect(201);
    });

    it('ponto do roteiro desativado depois da publicação sai da meta; o que o aluno já coletou continua valendo', async () => {
      const pontos: Array<{ id: string; posicao: Posicao }> = [];
      for (const predio of ['P41', 'P42', 'P43']) {
        const posicao = noPredio(predio);
        const criado = await pucstopsAdmin.criar(
          { nome: `PucStop do ${predio}`, ...posicao, xp: 10, raioMetros: 30 },
          null,
        );
        pontos.push({ id: criado.id, posicao });
      }
      const [p41, p42, p43] = pontos;
      const m = await criarMissao({
        titulo: 'Roteiro com um prédio que vai entrar em obra',
        tipo: 'UNICA',
        xp: 40,
        requisito: 'PUCSTOPS',
        alvoIds: pontos.map((p) => p.id),
      });
      const a = await novoAluno();
      const b = await novoAluno();
      await coletar(a, p41).expect(201);
      await coletar(b, p43).expect(201);
      // O P43 entra em obra: a coordenação desativa o totem.
      await pucstopsAdmin.definirAtivo(p43.id, false);

      let item = (await itemDe(a, m.id))!;
      expect(item.progresso).toEqual({ atual: 1, meta: 2 });
      expect(item.pontos!.map((p) => [p.id, p.coletado, p.ativo])).toEqual([
        [p41.id, true, true],
        [p42.id, false, true],
        [p43.id, false, false],
      ]);
      expect(item.alvo).toMatchObject({ id: p42.id });
      await coletar(a, p42).expect(201);
      item = (await itemDe(a, m.id))!;
      expect(item).toMatchObject({
        progresso: { atual: 2, meta: 2 },
        pronta: true,
      });
      await concluir(a, m.id).expect(201);

      // Quem já tinha coletado o P43 continua com ele: faltam os outros dois.
      expect((await itemDe(b, m.id))!.progresso).toEqual({ atual: 1, meta: 3 });
      const falta = await concluir(b, m.id).expect(422);
      expect(falta.body.progresso).toEqual({ atual: 1, meta: 3 });

      // Arquivada, volta a ser publicada: o ponto desativado não impede.
      await http()
        .post(`/coordenacao/missoes/${m.id}/desativar`)
        .set('Authorization', coord())
        .expect(200);
      const deNovo = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(200);
      expect(
        deNovo.body.pontos.map((p: { ativo: boolean }) => p.ativo),
      ).toEqual([true, true, false]);

      // Sem nenhum ponto ativo, nem a republicação passa.
      await http()
        .post(`/coordenacao/missoes/${m.id}/desativar`)
        .set('Authorization', coord())
        .expect(200);
      await pucstopsAdmin.definirAtivo(p41.id, false);
      await pucstopsAdmin.definirAtivo(p42.id, false);
      const vazia = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(422);
      expect(vazia.body.motivo).toBe('alvo-invalido');
    });

    it('roteiro de um ponto só desativado: some para quem não coletou e não avisa; quem coletou ou concluiu continua', async () => {
      const nunca = await novoAluno();
      const coletou = await novoAluno();
      const concluiu = await novoAluno();
      const ginasio = {
        posicao: noPredio('P13'),
        id: (
          await pucstopsAdmin.criar(
            {
              nome: 'PucStop do Ginásio',
              ...noPredio('P13'),
              xp: 10,
              raioMetros: 30,
            },
            null,
          )
        ).id,
      };
      const m = await criarMissao({
        titulo: 'Conheça o ginásio poliesportivo',
        tipo: 'UNICA',
        xp: 20,
        requisito: 'PUCSTOPS',
        alvoIds: [ginasio.id],
      });
      await coletar(concluiu, ginasio).expect(201);
      await concluir(concluiu, m.id).expect(201);
      await coletar(coletou, ginasio, 2).expect(201);
      await pucstopsAdmin.definirAtivo(ginasio.id, false);

      expect(await itemDe(nunca, m.id)).toBeUndefined();
      await concluir(nunca, m.id).expect(404);
      await http()
        .get('/me/notificacoes')
        .set('Authorization', nunca.auth)
        .expect(200);
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE usuario_id = $1 AND chave = $2`,
          [nunca.id, `missao-nova:${m.id}`],
        ),
      ).toBe(0);

      expect(await itemDe(concluiu, m.id)).toMatchObject({
        status: 'concluida',
      });
      await concluir(concluiu, m.id).expect(409);
      expect(await itemDe(coletou, m.id)).toMatchObject({
        progresso: { atual: 1, meta: 1 },
        pronta: true,
      });
      await concluir(coletou, m.id).expect(201);
    });

    it('PucStop coletado antes da publicação conta: a coleta vale uma vez por semestre', async () => {
      const a = await novoAluno();
      await coletar(a, totens.BIBLIOTECA).expect(201);
      const m = await criarMissao({
        titulo: 'Passe pela Biblioteca Central',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'PUCSTOPS',
        alvoIds: [totens.BIBLIOTECA.id],
      });
      expect((await itemDe(a, m.id))!.pronta).toBe(true);
      await concluir(a, m.id).expect(201);
    });

    it('não publica exploração com PucStop desativado: 422 e segue rascunho', async () => {
      const fechado = await pucstopsAdmin.criar(
        {
          nome: 'PucStop do Auditório',
          ...noPredio('P40'),
          xp: 10,
          raioMetros: 25,
        },
        null,
      );
      const m = await criarMissao({
        titulo: 'Roteiro até o auditório',
        tipo: 'UNICA',
        xp: 30,
        requisito: 'PUCSTOPS',
        alvoIds: [totens.TEATRO.id, fechado.id],
        ativar: false,
      });
      await pucstopsAdmin.definirAtivo(fechado.id, false);
      const r = await http()
        .post(`/coordenacao/missoes/${m.id}/ativar`)
        .set('Authorization', coord())
        .expect(422);
      expect(r.body.motivo).toBe('alvo-invalido');
      const depois = (
        await http()
          .get(`/coordenacao/missoes/${m.id}`)
          .set('Authorization', coord())
          .expect(200)
      ).body as Missao;
      expect(depois).toMatchObject({ estado: 'rascunho', publicadaEm: null });
    });

    it('público: padrinhos e apadrinhados só veem, concluem e recebem aviso das suas', async () => {
      const padrinho = await novoAluno({ papel: 'padrinho' });
      const calouro = await novoAluno({ papel: 'apadrinhado' });
      const paraPadrinhos = await criarMissao({
        titulo: 'Prepare a recepção dos calouros',
        tipo: 'UNICA',
        xp: 20,
        publico: 'PADRINHOS',
      });
      const paraApadrinhados = await criarMissao({
        titulo: 'Tire uma dúvida com seu padrinho',
        tipo: 'UNICA',
        xp: 20,
        publico: 'APADRINHADOS',
      });
      const paraTodos = await criarMissao({
        titulo: 'Conheça a central de estágios',
        tipo: 'UNICA',
        xp: 20,
      });
      expect(paraTodos.publico).toBe('TODOS');
      const idsDe = async (a: Aluno) =>
        (await missoesDe(a)).missoes.map((x) => x.id);
      const doPadrinho = await idsDe(padrinho);
      expect(doPadrinho).toEqual(
        expect.arrayContaining([paraPadrinhos.id, paraTodos.id]),
      );
      expect(doPadrinho).not.toContain(paraApadrinhados.id);
      const doCalouro = await idsDe(calouro);
      expect(doCalouro).toEqual(
        expect.arrayContaining([paraApadrinhados.id, paraTodos.id]),
      );
      expect(doCalouro).not.toContain(paraPadrinhos.id);
      await concluir(calouro, paraPadrinhos.id).expect(404);
      await concluir(padrinho, paraApadrinhados.id).expect(404);
      await concluir(calouro, paraApadrinhados.id).expect(201);

      await http()
        .get('/me/notificacoes')
        .set('Authorization', calouro.auth)
        .expect(200);
      const avisados = (
        (await ds.query(
          `SELECT chave FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = 'MISSAO_NOVA'`,
          [calouro.id],
        )) as Array<{ chave: string }>
      ).map((n) => n.chave);
      expect(avisados).toEqual(
        expect.arrayContaining([
          `missao-nova:${paraApadrinhados.id}`,
          `missao-nova:${paraTodos.id}`,
        ]),
      );
      expect(avisados).not.toContain(`missao-nova:${paraPadrinhos.id}`);
    });
  });

  describe('tetos de ganho', () => {
    it('teto semanal: a lista avisa antes, a conclusão corta e depois zera', async () => {
      const semanais = await Promise.all(
        [
          'Poste uma dica de estudo no mural',
          'Tire uma dúvida no plantão da monitoria',
          'Mande um áudio de boas-vindas ao afilhado',
          'Compartilhe uma vaga de estágio com a turma',
        ].map((titulo) => criarMissao({ titulo, tipo: 'SEMANAL', xp: 25 })),
      );
      const unica = await criarMissao({
        titulo: 'Visite o Núcleo de Apoio ao Estudante',
        tipo: 'UNICA',
        xp: 25,
      });
      const a = await novoAluno();
      await concluir(a, semanais[0].id).expect(201);
      await concluir(a, semanais[1].id).expect(201);

      const lista = await missoesDe(a);
      expect(lista.limites.semanal.ganho).toBe(50);
      expect(lista.missoes.find((m) => m.id === semanais[2].id)).toMatchObject({
        status: 'limitada',
        xpPrevisto: 10,
      });
      expect(lista.missoes.find((m) => m.id === unica.id)).toMatchObject({
        status: 'disponivel',
        xpPrevisto: 25,
      });

      const cortada = await concluir(a, semanais[2].id).expect(201);
      expect(cortada.body).toMatchObject({
        xpConfigurado: 25,
        xp: 10,
        moedas: 10,
        limitado: true,
        teto: 'semanal',
      });
      const zerada = await concluir(a, semanais[3].id).expect(201);
      expect(zerada.body).toMatchObject({
        xp: 0,
        limitado: true,
        teto: 'semanal',
      });
      await concluir(a, unica.id).expect(201);
      expect(await carteira(a)).toEqual({ saldo: 85, xp_acumulado: 85 });

      const [registro] = (await ds.query(
        `SELECT xp_creditado, movimentacao_id FROM gamificacao.missoes_conclusoes WHERE usuario_id = $1 AND missao_id = $2`,
        [a.id, semanais[3].id],
      )) as Array<{ xp_creditado: number; movimentacao_id: string | null }>;
      expect(registro).toEqual({ xp_creditado: 0, movimentacao_id: null });
      expect(await itemDe(a, semanais[3].id)).toMatchObject({
        status: 'concluida',
        conclusao: { xp: 0, limitado: true },
      });
    });

    it('três semanais resgatadas ao mesmo tempo nunca passam do teto semanal', async () => {
      const semanais = await Promise.all(
        [
          'Indique um podcast para seu grupo',
          'Convide seu afilhado para o café da cantina',
          'Mostre um atalho entre os prédios',
        ].map((titulo) => criarMissao({ titulo, tipo: 'SEMANAL', xp: 30 })),
      );
      const a = await novoAluno();
      const respostas = await Promise.all(
        semanais.map((m) => concluir(a, m.id)),
      );
      expect(respostas.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(
        respostas.map((r) => r.body.xp as number).sort((x, y) => x - y),
      ).toEqual([0, 30, 30]);
      expect(await carteira(a)).toEqual({
        saldo: LIMITES.missoesSemanais,
        xp_acumulado: LIMITES.missoesSemanais,
      });
    });

    it(`teto do ciclo (${LIMITES.geralPorCiclo} XP): corta a parcial, zera a seguinte e a lista mostra`, async () => {
      const grandes: Missao[] = [];
      for (const titulo of MISSOES_GRANDES) {
        grandes.push(
          await criarMissao({ titulo, tipo: 'UNICA', xp: LIMITES.porMissao }),
        );
      }
      const meia = await criarMissao({
        titulo: 'Divulgue o programa na sua sala',
        tipo: 'UNICA',
        xp: 50,
      });
      const a = await novoAluno({ papel: 'padrinho' });
      const cheias = (LIMITES.geralPorCiclo - 100) / LIMITES.porMissao;
      for (const m of grandes.slice(0, cheias)) {
        const r = await concluir(a, m.id).expect(201);
        expect(r.body.limitado).toBe(false);
      }
      await concluir(a, meia.id).expect(201);
      expect((await carteira(a)).xp_acumulado).toBe(LIMITES.geralPorCiclo - 50);

      const [parcial, zerada] = grandes.slice(cheias);
      const lista = await missoesDe(a);
      expect(lista.limites.ciclo).toEqual({
        ganho: LIMITES.geralPorCiclo - 50,
        limite: LIMITES.geralPorCiclo,
      });
      expect(lista.missoes.find((m) => m.id === parcial.id)).toMatchObject({
        status: 'limitada',
        xpPrevisto: 50,
      });

      const r = await concluir(a, parcial.id).expect(201);
      expect(r.body).toMatchObject({
        xpConfigurado: 100,
        xp: 50,
        limitado: true,
        teto: 'ciclo',
        xpAcumulado: LIMITES.geralPorCiclo,
      });
      const depois = await missoesDe(a);
      expect(depois.missoes.find((m) => m.id === zerada.id)).toMatchObject({
        status: 'limitada',
        xpPrevisto: 0,
      });
      for (const item of depois.missoes.filter(
        (m) => m.status !== 'concluida',
      )) {
        expect(item.xpPrevisto).toBe(0);
      }
      const z = await concluir(a, zerada.id).expect(201);
      expect(z.body).toMatchObject({ xp: 0, limitado: true, teto: 'ciclo' });
      const totem = await coletar(a, totens.PREDIO24).expect(201);
      expect(totem.body.xpGanho).toBe(0);
      expect(await carteira(a)).toEqual({
        saldo: LIMITES.geralPorCiclo,
        xp_acumulado: LIMITES.geralPorCiclo,
      });
    }, 60_000);
  });

  describe('integridade do ledger', () => {
    it('cliques simultâneos na mesma missão: um crédito só', async () => {
      const m = await criarMissao({
        titulo: 'Cadastre-se no programa de monitoria',
        tipo: 'UNICA',
        xp: 20,
      });
      const a = await novoAluno();
      const respostas = await Promise.all(
        Array.from({ length: 6 }, () => concluir(a, m.id)),
      );
      expect(respostas.map((r) => r.status).sort()).toEqual([
        201, 409, 409, 409, 409, 409,
      ]);
      expect(await carteira(a)).toEqual({ saldo: 20, xp_acumulado: 20 });
    });

    it('saldo de cada carteira bate com a soma do ledger', async () => {
      const divergentes = (await ds.query(
        `SELECT c.usuario_id FROM gamificacao.xp_carteiras c LEFT JOIN gamificacao.xp_movimentacoes m ON m.usuario_id = c.usuario_id ` +
          `GROUP BY c.usuario_id, c.saldo, c.xp_acumulado ` +
          `HAVING c.saldo <> COALESCE(sum(m.quantidade), 0) OR c.xp_acumulado <> COALESCE(sum(m.quantidade), 0)`,
      )) as unknown[];
      expect(divergentes).toEqual([]);
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes c ` +
            `LEFT JOIN gamificacao.xp_movimentacoes m ON m.id = c.movimentacao_id ` +
            `WHERE (c.xp_creditado > 0 AND (m.id IS NULL OR m.quantidade <> c.xp_creditado)) ` +
            `OR (c.xp_creditado = 0 AND c.movimentacao_id IS NOT NULL)`,
        ),
      ).toBe(0);
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE evidencia IS NULL`,
        ),
      ).toBe(0);
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

  describe('sino', () => {
    async function avisosAntigos(usuarioId: number, n: number) {
      const titulos = [
        'Nova missão: Visite a Biblioteca Central',
        'Seu resgate da Caneca Ajuda.ai foi entregue',
        'Você subiu para o nível 2!',
        'Nova missão: Participe da Semana do Calouro',
        'Seu padrinho comentou no seu post',
      ];
      for (let i = 0; i < n; i++) {
        await ds.query(
          `INSERT INTO feed.notificacoes (usuario_id, tipo, titulo, mensagem, chave, criado_em) ` +
            `VALUES ($1, 'NIVEL_SUBIU', $2, $3, $4, now() - make_interval(mins => $5))`,
          [
            usuarioId,
            titulos[i % titulos.length],
            'Toque para ver os detalhes no app.',
            `historico:${i}`,
            n - i,
          ],
        );
      }
    }

    it('aluno novo não recebe aviso das missões que já existiam', async () => {
      const a = await novoAluno();
      expect((await missoesDe(a)).missoes.length).toBeGreaterThan(0);
      const r = await http()
        .get('/me/notificacoes?limite=50')
        .set('Authorization', a.auth)
        .expect(200);
      expect(
        (r.body as { itens: Array<{ tipo: string }> }).itens.filter(
          (n) => n.tipo === 'MISSAO_NOVA',
        ),
      ).toEqual([]);
    });

    it('rascunho antigo publicado depois que o aluno entrou: avisa; reativar não avisa de novo', async () => {
      const rascunho = await criarMissao({
        titulo: 'Participe da gincana de boas-vindas',
        tipo: 'UNICA',
        xp: 25,
        ativar: false,
      });
      const a = await novoAluno();
      const avisosDa = async (id: string) => {
        await http()
          .get('/me/notificacoes?limite=50')
          .set('Authorization', a.auth)
          .expect(200);
        return contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE usuario_id = $1 AND chave = $2`,
          [a.id, `missao-nova:${id}`],
        );
      };
      expect(await avisosDa(rascunho.id)).toBe(0);
      await http()
        .post(`/coordenacao/missoes/${rascunho.id}/ativar`)
        .set('Authorization', coord())
        .expect(200);
      expect(await avisosDa(rascunho.id)).toBe(1);

      const antiga = await criarMissao({
        titulo: 'Conheça o restaurante universitário',
        tipo: 'UNICA',
        xp: 15,
      });
      const b = await novoAluno();
      for (const acao of ['desativar', 'ativar']) {
        await http()
          .post(`/coordenacao/missoes/${antiga.id}/${acao}`)
          .set('Authorization', coord())
          .expect(200);
      }
      await http()
        .get('/me/notificacoes?limite=50')
        .set('Authorization', b.auth)
        .expect(200);
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE usuario_id = $1 AND chave = $2`,
          [b.id, `missao-nova:${antiga.id}`],
        ),
      ).toBe(0);
      const [{ publicada_em, criado_em }] = (await ds.query(
        `SELECT publicada_em, criado_em FROM gamificacao.missoes WHERE id = $1`,
        [rascunho.id],
      )) as Array<{ publicada_em: Date; criado_em: Date }>;
      expect(publicada_em.getTime()).toBeGreaterThan(criado_em.getTime());
    });

    it('avisa cada missão nova visível uma vez só, e nunca uma que o aluno não vê', async () => {
      const a = await novoAluno();
      const lista = async () =>
        (
          await http()
            .get('/me/notificacoes?limite=50')
            .set('Authorization', a.auth)
            .expect(200)
        ).body as {
          itens: Array<{ tipo: string; link: string | null; mensagem: string }>;
        };
      await lista();
      const nova = await criarMissao({
        titulo: 'Conheça a biblioteca do Coração Eucarístico',
        tipo: 'UNICA',
        xp: 30,
      });
      await criarMissao({
        titulo: 'Converse com sua dupla nesta semana',
        tipo: 'SEMANAL',
        xp: 10,
        requisito: 'CHAT_MENSAGENS',
        quantidade: 2,
      });
      await criarMissao({
        titulo: 'Publique uma dica para os calouros',
        tipo: 'UNICA',
        xp: 10,
        requisito: 'FEED_PUBLICACOES',
      });
      await criarMissao({
        titulo: 'Visite a feira de estágios',
        tipo: 'UNICA',
        xp: 20,
        inicio: iso(Date.now() + DIA),
      });
      const primeira = await lista();
      const avisos = primeira.itens.filter((n) => n.tipo === 'MISSAO_NOVA');
      expect(avisos).toEqual([
        expect.objectContaining({
          link: '/missoes',
          mensagem: `${nova.titulo} · 30 XP`,
        }),
      ]);
      const segunda = await lista();
      expect(
        segunda.itens.filter((n) => n.tipo === 'MISSAO_NOVA'),
      ).toHaveLength(1);
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = 'MISSAO_NOVA'`,
          [a.id],
        ),
      ).toBe(1);
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes n JOIN gamificacao.missoes m ON n.chave = 'missao-nova:' || m.id::text ` +
            `WHERE n.usuario_id = $1 AND (m.requisito IN ('CHAT_MENSAGENS', 'FEED_PUBLICACOES') OR m.inicio > now())`,
          [a.id],
        ),
      ).toBe(0);
    });

    it('quem não participa do ciclo não recebe aviso de missão', async () => {
      const a = await novoAluno({ status: 'concluido' });
      const r = await http()
        .get('/me/notificacoes')
        .set('Authorization', a.auth)
        .expect(200);
      expect(r.body.itens).toEqual([]);
    });

    it('pagina por `antes` sem perder nem repetir notificação', async () => {
      const a = await novoAluno({ programa: CICLO_ANTERIOR });
      await avisosAntigos(a.id, 25);
      const p1 = (
        await http()
          .get('/me/notificacoes?limite=20')
          .set('Authorization', a.auth)
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
          .set('Authorization', a.auth)
          .expect(200)
      ).body as { itens: Array<{ id: string }>; temMais: boolean };
      expect(p2.itens).toHaveLength(5);
      expect(p2.temMais).toBe(false);
      expect(new Set([...p1.itens, ...p2.itens].map((n) => n.id)).size).toBe(
        25,
      );
      const outro = await novoAluno();
      await http()
        .get(`/me/notificacoes?antes=${p1.itens[0].id}`)
        .set('Authorization', outro.auth)
        .expect(404);
    });

    it('ateId nulo ou fora do formato: 400, nunca 404 nem marcar tudo', async () => {
      const a = await novoAluno({ programa: CICLO_ANTERIOR });
      await avisosAntigos(a.id, 2);
      for (const corpo of [
        { ateId: null },
        { ateId: 42 },
        { ateId: 'ultima' },
      ]) {
        const r = await http()
          .patch('/me/notificacoes/lidas')
          .set('Authorization', a.auth)
          .send(corpo);
        expect(r.status, JSON.stringify(corpo)).toBe(400);
      }
      expect(
        await contar(
          `SELECT count(*) AS n FROM feed.notificacoes WHERE usuario_id = $1 AND lida_em IS NULL`,
          [a.id],
        ),
      ).toBe(2);
    });

    it('"marcar todas" com ateId deixa não lido o que chegou depois', async () => {
      const a = await novoAluno({ programa: CICLO_ANTERIOR });
      await avisosAntigos(a.id, 3);
      const vistas = (
        await http()
          .get('/me/notificacoes')
          .set('Authorization', a.auth)
          .expect(200)
      ).body as { itens: Array<{ id: string }> };
      await ds.query(
        `INSERT INTO feed.notificacoes (usuario_id, tipo, titulo, mensagem, chave) ` +
          `VALUES ($1, 'NIVEL_SUBIU', 'Você subiu para o nível 3!', 'Agora você é Exploração.', 'nivel:3')`,
        [a.id],
      );
      const r = await http()
        .patch('/me/notificacoes/lidas')
        .set('Authorization', a.auth)
        .send({ ateId: vistas.itens[0].id })
        .expect(200);
      expect(r.body).toEqual({ atualizadas: 3, naoLidas: 1 });
      const outro = await novoAluno();
      await http()
        .patch('/me/notificacoes/lidas')
        .set('Authorization', outro.auth)
        .send({ ateId: vistas.itens[0].id })
        .expect(404);
      const todas = await http()
        .patch('/me/notificacoes/lidas')
        .set('Authorization', a.auth)
        .expect(200);
      expect(todas.body).toEqual({ atualizadas: 1, naoLidas: 0 });
    });
  });

  describe('sino: resgate entregue ou cancelado na lojinha', () => {
    async function resgatarCaneca(a: Aluno): Promise<string> {
      const m = await criarMissao({
        titulo: 'Ajude na recepção dos calouros',
        tipo: 'UNICA',
        xp: 100,
      });
      await concluir(a, m.id).expect(201);
      await http()
        .get('/me/notificacoes')
        .set('Authorization', a.auth)
        .expect(200);
      const recompensa = (
        await http()
          .post('/coordenacao/recompensas')
          .set('Authorization', coord())
          .send({
            nome: 'Caneca Ajuda.ai',
            descricao: 'Caneca de cerâmica personalizada do Ajuda-aí.',
            custoXp: 50,
            estoqueIlimitado: false,
            estoqueInicial: 5,
            condicoesRetirada:
              'Apresente o comprovante na sala da coordenação.',
            publicar: true,
          })
          .expect(201)
      ).body as { id: string; versao: number };
      const resgate = await http()
        .post(`/me/lojinha/${recompensa.id}/resgatar`)
        .set('Authorization', a.auth)
        .send({
          chaveIdempotencia: crypto.randomUUID(),
          versao: recompensa.versao,
          custoXp: 50,
        });
      expect(resgate.status, JSON.stringify(resgate.body)).toBe(201);
      return (resgate.body as { id: string }).id;
    }

    async function avisos(a: Aluno, tipo: string) {
      return (await ds.query(
        `SELECT titulo, mensagem, link FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = $2`,
        [a.id, tipo],
      )) as Array<{ titulo: string; mensagem: string; link: string }>;
    }

    it('entrega avisa o aluno uma vez, com link para o comprovante', async () => {
      const a = await novoAluno();
      const id = await resgatarCaneca(a);
      expect(await avisos(a, 'RESGATE_ENTREGUE')).toEqual([]);
      await http()
        .post(`/coordenacao/resgates/${id}/entregar`)
        .set('Authorization', coord())
        .expect(200);
      expect(await avisos(a, 'RESGATE_ENTREGUE')).toEqual([
        {
          titulo: 'Resgate entregue',
          mensagem: 'Seu resgate de Caneca Ajuda.ai foi entregue.',
          link: `/lojinha/resgates/${id}`,
        },
      ]);
      await http()
        .post(`/coordenacao/resgates/${id}/entregar`)
        .set('Authorization', coord())
        .expect(409);
      expect(await avisos(a, 'RESGATE_ENTREGUE')).toHaveLength(1);
      const sino = await http()
        .get('/me/notificacoes')
        .set('Authorization', a.auth)
        .expect(200);
      expect(
        (sino.body as { itens: Array<{ tipo: string }> }).itens.map(
          (n) => n.tipo,
        ),
      ).toContain('RESGATE_ENTREGUE');
    });

    it('cancelamento avisa que as moedas voltaram; ninguém mais é avisado', async () => {
      const a = await novoAluno();
      const colega = await novoAluno();
      const id = await resgatarCaneca(a);
      await http()
        .post(`/coordenacao/resgates/${id}/cancelar`)
        .set('Authorization', coord())
        .send({ motivo: 'Caneca chegou quebrada do fornecedor.' })
        .expect(200);
      const [aviso] = await avisos(a, 'RESGATE_CANCELADO');
      expect(aviso).toMatchObject({
        titulo: 'Resgate cancelado',
        link: `/lojinha/resgates/${id}`,
      });
      expect(aviso.mensagem).toContain('moedas voltaram');
      expect(await avisos(a, 'RESGATE_ENTREGUE')).toEqual([]);
      expect(await avisos(colega, 'RESGATE_CANCELADO')).toEqual([]);
    });
  });

  describe('ciclo encerrado', () => {
    it('com o programa em encerramento ninguém lista nem conclui', async () => {
      const m = await criarMissao({
        titulo: 'Responda a pesquisa de satisfação do semestre',
        tipo: 'UNICA',
        xp: 20,
      });
      const a = await novoAluno();
      await ds.query(
        `UPDATE feed.programas SET etapa_atual = 'encerramento' WHERE codigo = $1`,
        [CICLO],
      );
      try {
        const r = await listar(a).expect(403);
        expect(r.body.motivo).toBe('sem-participacao-no-ciclo');
        await concluir(a, m.id).expect(403);
      } finally {
        await ds.query(
          `UPDATE feed.programas SET etapa_atual = 'andamento' WHERE codigo = $1`,
          [CICLO],
        );
      }
      await concluir(a, m.id).expect(201);
    });
  });

  describe('avisos de candidatura e vínculo (F34)', () => {
    async function avisosDe(a: Aluno, tipo: string) {
      return (await ds.query(
        `SELECT titulo, link, chave FROM feed.notificacoes WHERE usuario_id = $1 AND tipo = $2 ORDER BY criado_em, chave`,
        [a.id, tipo],
      )) as Array<{ titulo: string; link: string; chave: string }>;
    }

    const sino = (a: Aluno) =>
      http().get('/me/notificacoes').set('Authorization', a.auth).expect(200);

    it('vínculo confirmado: o sino avisa os dois lados uma vez, com link para a dupla', async () => {
      const d = await formarDupla();
      for (const [a, outro, titulo] of [
        [d.padrinho, d.apadrinhado, 'Seu apadrinhamento começou!'],
        [d.apadrinhado, d.padrinho, 'Seu padrinho foi definido!'],
      ] as const) {
        for (let i = 0; i < 2; i++) await sino(a);
        expect(await avisosDe(a, 'VINCULO_CONFIRMADO')).toEqual([
          {
            titulo,
            link: `/dupla?ciclo=${encodeURIComponent(CICLO)}`,
            chave: `vinculo:${CICLO}:${await participacaoDe(outro)}`,
          },
        ]);
      }
      const sozinho = await novoAluno();
      await http()
        .get('/me/notificacoes')
        .set('Authorization', sozinho.auth)
        .expect(200);
      expect(await avisosDe(sozinho, 'VINCULO_CONFIRMADO')).toEqual([]);
    });

    it('trocar de padrinho ou ganhar outro apadrinhado no mesmo ciclo avisa de novo', async () => {
      const d = await formarDupla();
      await sino(d.apadrinhado);
      await sino(d.padrinho);
      // A coordenação desfaz a dupla e escolhe outro padrinho.
      await ds.query(
        `UPDATE feed.matching_vinculos SET ativo = false, encerrado_em = now() WHERE id = $1`,
        [d.vinculoId],
      );
      const novo = await novoAluno({ papel: 'padrinho' });
      await ligar(novo, d.apadrinhado);
      await sino(d.apadrinhado);
      await sino(d.apadrinhado);
      expect(await avisosDe(d.apadrinhado, 'VINCULO_CONFIRMADO')).toEqual([
        {
          titulo: 'Seu padrinho foi definido!',
          link: `/dupla?ciclo=${encodeURIComponent(CICLO)}`,
          chave: `vinculo:${CICLO}:${await participacaoDe(d.padrinho)}`,
        },
        {
          titulo: 'Você tem um novo padrinho!',
          link: `/dupla?ciclo=${encodeURIComponent(CICLO)}`,
          chave: `vinculo:${CICLO}:${await participacaoDe(novo)}`,
        },
      ]);

      // O novo padrinho ganha um segundo apadrinhado no mesmo ciclo.
      await sino(novo);
      const segundo = await novoAluno({ papel: 'apadrinhado' });
      await ligar(novo, segundo);
      await sino(novo);
      await sino(novo);
      expect(
        (await avisosDe(novo, 'VINCULO_CONFIRMADO')).map((n) => n.titulo),
      ).toEqual([
        'Seu apadrinhamento começou!',
        'Você tem um novo apadrinhado!',
      ]);

      // O padrinho antigo ficou sem dupla: nada de aviso novo.
      await sino(d.padrinho);
      expect(await avisosDe(d.padrinho, 'VINCULO_CONFIRMADO')).toHaveLength(1);
    });

    it('decisão de candidatura chega no sino pelo e-mail, uma vez por decisão', async () => {
      const a = await novoAluno({ papel: 'candidato', status: 'pendente' });
      const reprovada = notificacaoCandidatura('nao_aprovado', {
        programa: CICLO,
        em: '2026-11-20T15:00:00.000Z',
      });
      await notificacoesServico.criarParaEmail(
        a.email.toUpperCase(),
        reprovada,
      );
      await notificacoesServico.criarParaEmail(a.email, reprovada);
      await expect(
        notificacoesServico.criarParaEmail(
          'sem.conta@sga.pucminas.br',
          reprovada,
        ),
      ).resolves.toBeUndefined();
      expect(await avisosDe(a, 'CANDIDATURA_NAO_APROVADA')).toEqual([
        {
          titulo: 'Candidatura não aprovada',
          link: `/candidatura?ciclo=${encodeURIComponent(CICLO)}`,
          chave: `candidatura:${CICLO}:2026-11-20T15:00:00.000Z`,
        },
      ]);
      await notificacoesServico.criarParaEmail(
        a.email,
        notificacaoCandidatura('aprovado', {
          programa: CICLO,
          em: '2026-11-22T10:00:00.000Z',
        }),
      );
      const sino = (
        await http()
          .get('/me/notificacoes')
          .set('Authorization', a.auth)
          .expect(200)
      ).body as { itens: Array<{ tipo: string; link: string; lida: boolean }> };
      expect(
        sino.itens.filter((n) => n.tipo.startsWith('CANDIDATURA_')),
      ).toEqual([
        expect.objectContaining({
          tipo: 'CANDIDATURA_APROVADA',
          link: `/candidatura?ciclo=${encodeURIComponent(CICLO)}`,
          lida: false,
        }),
        expect.objectContaining({ tipo: 'CANDIDATURA_NAO_APROVADA' }),
      ]);
    });

    async function conferido(): Promise<Aluno> {
      const aluno = await novoAluno({
        papel: 'apadrinhado',
        status: 'pendente',
      });
      await ds.query(
        `UPDATE feed.participacoes SET respostas = $3 WHERE usuario_id = $1 AND programa = $2`,
        [
          aluno.email,
          CICLO,
          JSON.stringify({
            nome: aluno.nome,
            periodo: 1,
            declaraPrimeiroPeriodo: true,
          }),
        ],
      );
      const r = await http()
        .put(
          `/coordenacao/candidaturas/${await participacaoDe(aluno)}/verificacao`,
        )
        .set('Authorization', coord())
        .send({
          itens: [
            { id: 'matricula_ativa', atende: true },
            { id: 'primeiro_periodo', atende: true },
          ],
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return aluno;
    }

    async function decidir(caminho: string, corpo: object = {}): Promise<void> {
      const r = await http()
        .post(caminho)
        .set('Authorization', coord())
        .send(corpo);
      expect(r.status, `${caminho} ${JSON.stringify(r.body)}`).toBeLessThan(
        300,
      );
    }

    async function decisaoEm(a: Aluno): Promise<string> {
      const [{ em }] = (await ds.query(
        `SELECT respostas->'_servidor'->'decisao'->>'em' AS em FROM feed.participacoes WHERE usuario_id = $1 AND programa = $2`,
        [a.email, CICLO],
      )) as Array<{ em: string }>;
      return em;
    }

    it('decisão pela tela de Cadastros ou pela rejeição manual avisa como a de Candidaturas, uma vez só', async () => {
      const ciclo = encodeURIComponent(CICLO);
      const aprovadoCadastros = await conferido();
      await decidir(
        `/coordenacao/cadastros/${aprovadoCadastros.id}/aprovar?programa=${ciclo}`,
      );
      const recusadoCadastros = await novoAluno({
        papel: 'apadrinhado',
        status: 'pendente',
      });
      await decidir(
        `/coordenacao/cadastros/${recusadoCadastros.id}/rejeitar?programa=${ciclo}`,
        {
          motivo: 'Matrícula não confirmada no sistema da faculdade.',
        },
      );
      const aprovadoCandidaturas = await conferido();
      await decidir(
        `/coordenacao/candidaturas/${await participacaoDe(aprovadoCandidaturas)}/aprovar`,
      );
      const recusadoManual = await novoAluno({
        papel: 'apadrinhado',
        status: 'pendente',
      });
      await decidir('/participacoes/rejeitar-candidatura', {
        usuarioId: recusadoManual.email,
        programa: CICLO,
        justificativa: 'Inscrição duplicada neste ciclo.',
      });

      for (const [aluno, tipo, titulo] of [
        [aprovadoCadastros, 'CANDIDATURA_APROVADA', 'Candidatura aprovada'],
        [
          recusadoCadastros,
          'CANDIDATURA_NAO_APROVADA',
          'Candidatura não aprovada',
        ],
        [aprovadoCandidaturas, 'CANDIDATURA_APROVADA', 'Candidatura aprovada'],
        [
          recusadoManual,
          'CANDIDATURA_NAO_APROVADA',
          'Candidatura não aprovada',
        ],
      ] as const) {
        expect(await avisosDe(aluno, tipo), aluno.email).toEqual([
          {
            titulo,
            link: `/candidatura?ciclo=${ciclo}`,
            chave: `candidatura:${CICLO}:${await decisaoEm(aluno)}`,
          },
        ]);
      }
    });

    it('revogar a aprovação avisa "Aprovação revogada"; decisão recusada não avisa nada', async () => {
      const aluno = await conferido();
      const id = await participacaoDe(aluno);
      await decidir(`/coordenacao/candidaturas/${id}/aprovar`);
      await decidir(`/coordenacao/candidaturas/${id}/revogar`, {
        justificativa: 'Documento de matrícula vencido.',
      });
      const repetida = await http()
        .post(`/coordenacao/candidaturas/${id}/aprovar`)
        .set('Authorization', coord());
      expect(repetida.status).toBeGreaterThanOrEqual(400);
      expect(await avisosDe(aluno, 'CANDIDATURA_APROVADA')).toHaveLength(1);
      expect(await avisosDe(aluno, 'CANDIDATURA_NAO_APROVADA')).toEqual([
        {
          titulo: 'Aprovação revogada',
          link: `/candidatura?ciclo=${encodeURIComponent(CICLO)}`,
          chave: `candidatura:${CICLO}:${await decisaoEm(aluno)}`,
        },
      ]);
    });
  });

  describe('migrations', () => {
    it('rollback dos requisitos é recusado quando há conclusão com prova', async () => {
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes_conclusoes WHERE evidencia IS NOT NULL`,
        ),
      ).toBeGreaterThan(0);
      const qr = ds.createQueryRunner();
      try {
        await expect(
          new RequisitosMissoes1795000000000().down(qr),
        ).rejects.toThrow(/Rollback recusado/);
      } finally {
        await qr.release();
      }
      expect(
        await contar(
          `SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = 'gamificacao' AND table_name = 'missoes_conclusoes' AND column_name = 'evidencia'`,
        ),
      ).toBe(1);
    });

    it('rollback do ciclo de vida é recusado quando perderia público, instruções ou pontos', async () => {
      const qr = ds.createQueryRunner();
      try {
        await expect(
          new CicloDeVidaMissoes1795200000000().down(qr),
        ).rejects.toThrow(/Rollback recusado/);
      } finally {
        await qr.release();
      }
      expect(
        await contar(
          `SELECT count(*) AS n FROM gamificacao.missoes WHERE cardinality(pucstops) > 1`,
        ),
      ).toBeGreaterThan(0);
    });

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

    it('o banco barra requisito incoerente mesmo por fora da API', async () => {
      for (const sql of [
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'EVENTO')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'CODIGO')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, codigo) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'CODIGO', 'minusculo')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, codigo) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'FEED_CURTIDAS', 'SEGREDO')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, quantidade) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'FEED_CURTIDAS', 21)`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'AUTODECLARADA')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, alvo_id) VALUES ('x', 'x', 'SEMANAL', 10, '${CICLO}', 'EVENTO', '${agenda.SEMANA_CALOURO}')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito) VALUES ('x', 'x', 'SEMANAL', 10, '${CICLO}', 'PUCSTOPS')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, alvo_id) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'EVENTO', '${agenda.SEMANA_CALOURO}')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, publico) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'FEED_COMENTARIOS', 'CALOUROS')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, publico) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'FEED_PUBLICACOES', 'APADRINHADOS')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, quantidade, pucstops) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'PUCSTOPS', 1, ARRAY['${totens.ICEI.id}', '${totens.TEATRO.id}']::uuid[])`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, alvo_id) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'PUCSTOPS', '${totens.ICEI.id}')`,
        `INSERT INTO gamificacao.missoes (titulo, descricao, tipo, xp, ciclo, requisito, pucstops) VALUES ('x', 'x', 'UNICA', 10, '${CICLO}', 'FEED_CURTIDAS', ARRAY['${totens.ICEI.id}']::uuid[])`,
      ]) {
        await expect(ds.query(sql), sql).rejects.toThrow(
          /violates check constraint/,
        );
      }
    });
  });
});
