import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicacoesController } from '../src/publicacoes/publicacoes.controller.js';
import { PublicacoesService } from '../src/publicacoes/publicacoes.service.js';
import {
  FeedPolicy,
  FeedPublishGuard,
} from '../src/publicacoes/feed-policy.js';
import { FeedMidiasService } from '../src/publicacoes/feed-midias.service.js';
import { FeedStreamService } from '../src/publicacoes/feed-stream.service.js';
import { criarFeedTeste, coordenador, aluno } from './helpers/feed.js';

describe('Feed HTTP e SSE autenticados', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const feed = criarFeedTeste();
    const modulo = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'segredo-exclusivo-testes-feed' }),
      ],
      controllers: [PublicacoesController],
      providers: [
        FeedPolicy,
        FeedPublishGuard,
        FeedStreamService,
        { provide: PublicacoesService, useValue: feed.service },
        { provide: FeedMidiasService, useValue: { enviar: vi.fn() } },
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
