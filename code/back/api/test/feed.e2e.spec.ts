import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicacoesController } from '../src/publicacoes/publicacoes.controller.js';
import { PublicacoesService } from '../src/publicacoes/publicacoes.service.js';
import {
  FeedPolicy,
  FeedPublishGuard,
  FeedAdminGuard,
  FeedLeituraGuard,
} from '../src/publicacoes/feed-policy.js';
import { FeedMidiasService } from '../src/publicacoes/feed-midias.service.js';
import { FeedStreamService } from '../src/publicacoes/feed-stream.service.js';
import {
  criarFeedTeste,
  coordenador,
  aluno,
  padrinho,
  somenteMapa,
} from './helpers/feed.js';

describe('Feed HTTP e SSE autenticados', () => {
  let app: INestApplication;
  let feed: ReturnType<typeof criarFeedTeste>;
  beforeEach(async () => {
    feed = criarFeedTeste();
    const modulo = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'segredo-exclusivo-testes-feed' }),
      ],
      controllers: [PublicacoesController],
      providers: [
        { provide: FeedPolicy, useValue: feed.policy },
        FeedPublishGuard,
        FeedAdminGuard,
        FeedLeituraGuard,
        FeedStreamService,
        { provide: PublicacoesService, useValue: feed.service },
        {
          provide: FeedMidiasService,
          useValue: {
            enviar: vi.fn(() => {
              throw new BadRequestException('Envie uma imagem.');
            }),
          },
        },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const auth = (papel = aluno) =>
    `Bearer ${app.get(JwtService).sign(papel, { expiresIn: '1h' })}`;

  it.each([
    [
      'Ana',
      'ana.beatriz@pucminas.edu.br',
      'padrinho',
      'candidato',
      'pendente',
      false,
    ],
    [
      'Julia',
      'julia.fernandes@pucminas.edu.br',
      'padrinho',
      'candidato',
      'nao_aprovado',
      false,
    ],
    [
      'Camila',
      aluno.email,
      'apadrinhado',
      'apadrinhado',
      'em_andamento',
      false,
    ],
    [
      'Lucas',
      'lucas.almeida@pucminas.edu.br',
      'apadrinhado',
      'apadrinhado',
      'em_andamento',
      false,
    ],
    [
      'Thiago',
      'thiago@pucminas.edu.br',
      'padrinho',
      'padrinho',
      'em_andamento',
      true,
    ],
  ] as const)(
    'auditoria: %s só publica quando é padrinho ativo',
    async (_nome, email, perfil, papel, status, permitido) => {
      feed.tabelas.ParticipacaoEntity.push({
        id: 3,
        usuarioId: email,
        programa: feed.tabelas.ProgramaEntity[0].codigo,
        papel,
        status,
        grupo: 'Grupo 01',
        terminoEm: null,
      });
      // O grupo de Thiago tem uma apadrinhada ativa, sem outro padrinho.
      feed.tabelas.ParticipacaoEntity = feed.tabelas.ParticipacaoEntity.filter(
        (p) => p.usuarioId !== padrinho.email,
      );
      const token = auth({ sub: email, email, perfil, escopo: 'acesso' });
      const permissoes = await request(app.getHttpServer())
        .get('/publicacoes/permissoes')
        .set('Authorization', token)
        .expect(200);
      expect(permissoes.body.podePublicar).toBe(permitido);
      await request(app.getHttpServer())
        .post('/publicacoes')
        .set('Authorization', token)
        .send({ texto: 'Publicação da auditoria' })
        .expect(permitido ? 201 : 403);
      await request(app.getHttpServer())
        .post('/publicacoes/midias')
        .set('Authorization', token)
        .expect(permitido ? 400 : 403);
      expect(feed.tabelas.PublicacaoEntity).toHaveLength(permitido ? 1 : 0);
      expect(feed.tabelas.FeedOutboxEntity).toHaveLength(permitido ? 1 : 0);

      const post = await feed.service.criar(
        { texto: 'Comunicado' },
        coordenador,
      );
      // Candidatura pendente ou rejeitada não participa do ciclo (DP-01).
      const participante = status === 'em_andamento';
      expect(permissoes.body.podeLer).toBe(participante);
      await request(app.getHttpServer())
        .get('/publicacoes')
        .set('Authorization', token)
        .expect(participante ? 200 : 403);
      await request(app.getHttpServer())
        .post(`/publicacoes/${post.id}/curtidas`)
        .set('Authorization', token)
        .send({ delta: 1 })
        .expect(participante ? 201 : 403);
      await request(app.getHttpServer())
        .post(`/publicacoes/${post.id}/comentarios`)
        .set('Authorization', token)
        .send({ texto: 'Comentário permitido' })
        .expect(participante ? 201 : 403);
    },
  );

  it('revogação bloqueia publicação e upload com o mesmo JWT já emitido', async () => {
    const token = auth(padrinho);
    const permissoes = await request(app.getHttpServer())
      .get('/publicacoes/permissoes')
      .set('Authorization', token)
      .expect(200);
    expect(permissoes.body.podePublicar).toBe(true);
    feed.tabelas.ParticipacaoEntity[0].status = 'nao_aprovado';
    for (const path of ['/publicacoes', '/publicacoes/midias']) {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', token)
        .send({ texto: 'Sem autorização' })
        .expect(403);
    }
    const atuais = await request(app.getHttpServer())
      .get('/publicacoes/permissoes')
      .set('Authorization', token)
      .expect(200);
    expect(atuais.body.podePublicar).toBe(false);
    expect(feed.tabelas.PublicacaoEntity).toHaveLength(0);
    expect(feed.tabelas.FeedOutboxEntity).toHaveLength(0);
  });

  it('ciclo enviado pelo cliente não restaura a permissão de um padrinho antigo', async () => {
    const antigo = '2020/1';
    feed.tabelas.ParticipacaoEntity[0].programa = antigo;
    feed.tabelas.ProgramaEntity.push({
      codigo: antigo,
      etapaAtual: 'andamento',
    });
    for (const path of ['/publicacoes', '/publicacoes/midias']) {
      await request(app.getHttpServer())
        .post(`${path}?programa=${antigo}`)
        .set('Authorization', auth(padrinho))
        .send({ texto: 'Ciclo antigo' })
        .expect(403);
    }
  });

  it.each([
    [coordenador, true, true, true],
    [padrinho, true, false, true],
    [aluno, false, false, true],
    [somenteMapa, false, false, false],
  ] as const)(
    'permissões e comandos HTTP do perfil %j',
    async (usuario, podePublicar, podeAdministrar, podeInteragir) => {
      const token = auth(usuario);
      const permissoes = await request(app.getHttpServer())
        .get('/publicacoes/permissoes')
        .set('Authorization', token)
        .expect(200);
      const podeLer = usuario !== somenteMapa;
      expect(permissoes.body).toEqual({
        podeLer,
        podePublicar,
        podeAdministrar,
        podeInteragir,
      });
      const post = await request(app.getHttpServer())
        .post('/publicacoes')
        .set('Authorization', auth(coordenador))
        .send({ texto: 'Comunicado', categoria: 'Comunicados' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/publicacoes')
        .set('Authorization', token)
        .send({ texto: 'Dica', categoria: 'Dicas acadêmicas' })
        .expect(podePublicar ? 201 : 403);
      // Sem arquivo: publicadores passam pelo guard e recebem erro de validação (400).
      await request(app.getHttpServer())
        .post('/publicacoes/midias')
        .set('Authorization', token)
        .expect(podePublicar ? 400 : 403);
      const lista = await request(app.getHttpServer())
        .get('/publicacoes')
        .set('Authorization', token)
        .expect(podeLer ? 200 : 403);
      if (podeLer)
        expect(lista.body[0]).toMatchObject({ podeAdministrar, podeInteragir });
      await request(app.getHttpServer())
        .post(`/publicacoes/${post.body.id}/curtidas`)
        .set('Authorization', token)
        .send({ delta: 1 })
        .expect(podeInteragir ? 201 : 403);
      const comentario = await request(app.getHttpServer())
        .post(`/publicacoes/${post.body.id}/comentarios`)
        .set('Authorization', token)
        .send({ texto: 'Comentário' })
        .expect(podeInteragir ? 201 : 403);
      if (podeInteragir) {
        const c = comentario.body.comentariosDetalhes[0];
        expect(c.podeExcluir).toBe(true);
        await request(app.getHttpServer())
          .delete(`/publicacoes/${post.body.id}/comentarios/${c.id}`)
          .set('Authorization', token)
          .expect(200);
      }
      await request(app.getHttpServer())
        .patch(`/publicacoes/${post.body.id}`)
        .set('Authorization', token)
        .send({ texto: 'Alterado' })
        .expect(podeAdministrar ? 200 : 403);
      await request(app.getHttpServer())
        .delete(`/publicacoes/${post.body.id}`)
        .set('Authorization', token)
        .expect(podeAdministrar ? 200 : 403);
    },
  );
  it('quem curtiu: participantes veem, quem só usa o mapa não', async () => {
    const post = await request(app.getHttpServer())
      .post('/publicacoes')
      .set('Authorization', auth(coordenador))
      .send({ texto: 'Aviso' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/publicacoes/${post.body.id}/curtidas`)
      .set('Authorization', auth(aluno))
      .send({ delta: 1 })
      .expect(201);
    const comentario = await request(app.getHttpServer())
      .post(`/publicacoes/${post.body.id}/comentarios`)
      .set('Authorization', auth(aluno))
      .send({ texto: 'Oi' })
      .expect(201);
    const cid = comentario.body.comentariosDetalhes[0].id;
    await request(app.getHttpServer())
      .post(`/publicacoes/${post.body.id}/comentarios/${cid}/curtidas`)
      .set('Authorization', auth(coordenador))
      .send({ delta: 1 })
      .expect(201);
    for (const usuario of [aluno, padrinho, coordenador]) {
      const lista = await request(app.getHttpServer())
        .get(`/publicacoes/${post.body.id}/curtidas`)
        .set('Authorization', auth(usuario))
        .expect(200);
      expect(lista.body).toHaveLength(1);
      expect(lista.body[0].autor.nome).toBe('Camila Duarte');
      const doComentario = await request(app.getHttpServer())
        .get(`/publicacoes/${post.body.id}/comentarios/${cid}/curtidas`)
        .set('Authorization', auth(usuario))
        .expect(200);
      expect(doComentario.body[0]).toMatchObject({ coordenacao: true });
    }
    for (const caminho of [
      `/publicacoes/${post.body.id}/curtidas`,
      `/publicacoes/${post.body.id}/comentarios/${cid}/curtidas`,
    ])
      await request(app.getHttpServer())
        .get(caminho)
        .set('Authorization', auth(somenteMapa))
        .expect(403);
    await request(app.getHttpServer())
      .get('/publicacoes/9999/curtidas')
      .set('Authorization', auth(aluno))
      .expect(404);
  });

  it('usuário só do mapa não lê o feed nem abre o stream (DP-01)', async () => {
    const post = await feed.service.criar({ texto: 'Interno' }, coordenador);
    for (const path of [
      '/publicacoes',
      `/publicacoes/${post.id}`,
      '/publicacoes/events',
    ]) {
      const resposta = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', auth(somenteMapa))
        .expect(403);
      expect(resposta.body.motivo).toBe('sem-participacao-no-ciclo');
    }
  });

  it('conta real (perfil "nenhuma" no JWT) vinculada lê, curte e o padrinho publica (RN-001)', async () => {
    for (const usuario of [padrinho, aluno]) {
      const token = auth({ ...usuario, perfil: 'nenhuma' });
      const permissoes = await request(app.getHttpServer())
        .get('/publicacoes/permissoes')
        .set('Authorization', token)
        .expect(200);
      expect(permissoes.body).toMatchObject({
        podeLer: true,
        podeInteragir: true,
        podePublicar: usuario === padrinho,
      });
      await request(app.getHttpServer())
        .post('/publicacoes')
        .set('Authorization', token)
        .send({ texto: 'Post de conta real' })
        .expect(usuario === padrinho ? 201 : 403);
    }
  });

  it('coordenador publica, aluno lê/comenta/curte/descurte e não publica', async () => {
    const post = await request(app.getHttpServer())
      .post('/publicacoes')
      .set('Authorization', auth(coordenador))
      .send({ texto: 'Olá comunidade' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/publicacoes')
      .set('Authorization', auth())
      .send({ texto: 'Não permitido' })
      .expect(403);
    const lista = await request(app.getHttpServer())
      .get('/publicacoes')
      .set('Authorization', auth())
      .expect(200);
    expect(lista.body[0].texto).toBe('Olá comunidade');
    await request(app.getHttpServer())
      .post(`/publicacoes/${post.body.id}/comentarios`)
      .set('Authorization', auth())
      .send({ texto: 'Comentário' })
      .expect(201);
    for (const delta of [1, -1])
      await request(app.getHttpServer())
        .post(`/publicacoes/${post.body.id}/curtidas`)
        .set('Authorization', auth())
        .send({ delta })
        .expect(201);
    await request(app.getHttpServer())
      .patch(`/publicacoes/${post.body.id}`)
      .set('Authorization', auth())
      .send({ texto: 'Alterado' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/publicacoes/midias')
      .set('Authorization', auth())
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/publicacoes/${post.body.id}`)
      .set('Authorization', auth())
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/publicacoes/${post.body.id}`)
      .set('Authorization', auth(coordenador))
      .send({ texto: 'Atualização autorizada pelo celular' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/publicacoes/${post.body.id}`)
      .set('Authorization', auth(coordenador))
      .expect(200);
  });
  it('recusa visitantes, identidade por header e token de onboarding', async () => {
    for (const path of ['/publicacoes', '/publicacoes/midias']) {
      await request(app.getHttpServer())
        .post(path)
        .set('x-user-id', padrinho.email)
        .send({ texto: 'Sem JWT' })
        .expect(401);
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', auth({ ...padrinho, escopo: 'onboarding' }))
        .send({ texto: 'Onboarding' })
        .expect(401);
    }
    for (const path of [
      '/publicacoes',
      '/publicacoes/events',
      '/publicacoes/permissoes',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('x-user-id', coordenador.email)
        .expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', auth({ ...aluno, escopo: 'onboarding' }))
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/publicacoes')
      .set('Authorization', auth(coordenador))
      .send({ texto: 'X', autor: 'Forjado' })
      .expect(400);
  });
  it('contrato de resposta, curtida de comentário e exclusão autorizada', async () => {
    const p = (
      await request(app.getHttpServer())
        .post('/publicacoes')
        .set('Authorization', auth(coordenador))
        .send({ texto: 'Teste' })
        .expect(201)
    ).body;
    const c = (
      await request(app.getHttpServer())
        .post(`/publicacoes/${p.id}/comentarios`)
        .set('Authorization', auth())
        .send({ texto: 'Raiz' })
        .expect(201)
    ).body.comentariosDetalhes[0];
    expect(c.autor.nome).toBe('Camila Duarte');
    await request(app.getHttpServer())
      .post(`/publicacoes/${p.id}/comentarios`)
      .set('Authorization', auth())
      .send({ texto: 'Forjado', autor: { nome: 'Fake' } })
      .expect(400);
    const r = await request(app.getHttpServer())
      .post(`/publicacoes/${p.id}/comentarios`)
      .set('Authorization', auth(coordenador))
      .send({ texto: 'Resposta', paiId: c.id })
      .expect(201);
    expect(r.body.comentariosDetalhes[1].paiId).toBe(c.id);
    await request(app.getHttpServer())
      .post(`/publicacoes/${p.id}/comentarios/${c.id}/curtidas`)
      .set('Authorization', auth())
      .send({ delta: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/publicacoes/${p.id}/comentarios/${c.id}`)
      .set('Authorization', auth({ ...aluno, email: 'outra@pucminas.edu.br' }))
      .expect(403);
    const removido = await request(app.getHttpServer())
      .delete(`/publicacoes/${p.id}/comentarios/${c.id}`)
      .set('Authorization', auth(coordenador))
      .expect(200);
    expect(removido.body.comentarios).toBe(0);
  });
  it('stream autenticado entrega ready e evento sem manter listener após desconexão', async () => {
    await app.listen(0, '127.0.0.1');
    const abort = new AbortController();
    const response = await fetch(`${await app.getUrl()}/publicacoes/events`, {
      headers: { Authorization: auth() },
      signal: abort.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    try {
      const texto = new TextDecoder().decode((await reader.read()).value);
      expect(texto).toContain('feed.ready');
    } finally {
      abort.abort();
      await reader.cancel().catch(() => {});
    }
  });
});
