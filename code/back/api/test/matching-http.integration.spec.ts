import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  bancoMatchingIsolado,
  semearCenarioMatching,
} from './helpers/matching-postgres.js';
import { apiMatchingIsolada } from './helpers/matching-http.js';
import { ChatEntity } from '../src/chat/entities/chat.entity.js';
import { ProgramaEntity } from '../src/programas/entities/programa.entity.js';
import { FeedOutboxEntity } from '../src/publicacoes/entities/feed-outbox.entity.js';
import { FeedOutboxService } from '../src/publicacoes/feed-outbox.service.js';
import type { FeedRabbitService } from '../src/publicacoes/feed-rabbit.service.js';

describe.skipIf(
  !process.env.MATCHING_TEST_DB_URL ||
    process.env.MATCHING_TEST_DB_ISOLATED !== 'true',
)('Jornada HTTP/SSE com PostgreSQL e duas instâncias', () => {
  let banco: Awaited<ReturnType<typeof bancoMatchingIsolado>>;
  const apis: Awaited<ReturnType<typeof apiMatchingIsolada>>[] = [];
  let abortar: AbortController | undefined;
  afterEach(async () => {
    abortar?.abort();
    await Promise.all(apis.splice(0).map((a) => a.app.close()));
    await banco?.limpar();
  }, 30_000);

  it('transferência atualiza chat, stream e moderação com os mesmos JWTs; encerramento suspende comandos', async () => {
    banco = await bancoMatchingIsolado();
    const c = await semearCenarioMatching(banco.dados);
    const autor = 'coord@teste.local';
    const v = (await c.operacoes.vincular(c.a[0].id, c.p[0].id, autor)).vinculo;
    await c.operacoes.vincular(c.a[1].id, c.p[0].id, autor);
    await c.operacoes.vincular(c.a[2].id, c.p[1].id, autor);
    await banco.outra.initialize();
    const api1 = await apiMatchingIsolada(banco.dados);
    apis.push(api1);
    const api2 = await apiMatchingIsolada(banco.outra);
    apis.push(api2);
    const aluno = `Bearer ${api1.token(c.a[0].usuarioId)}`,
      p1 = `Bearer ${api1.token(c.p[0].usuarioId)}`,
      p2 = `Bearer ${api1.token(c.p[1].usuarioId)}`,
      coord = `Bearer ${api1.token(autor, 'coordenador')}`;
    const http1 = request(api1.app.getHttpServer()),
      http2 = request(api2.app.getHttpServer());
    await http1.get('/chats').expect(401);
    await http2
      .post(`/coordenacao/matching/vinculos/${v.id}/transferir`)
      .set('Authorization', aluno)
      .send({
        padrinhoDestinoId: c.p[1].id,
        motivo: 'Teste',
        operacaoId: randomUUID(),
      })
      .expect(403);
    const grupo = await banco.dados
      .getRepository(ChatEntity)
      .findOneByOrFail({ tipo: 'coletivo', grupoId: v.grupoId! });
    await http1
      .post(`/chats/${grupo.id}/mensagens`)
      .set('Authorization', p1)
      .send({ texto: 'Antes da transferência', clientId: randomUUID() })
      .expect(201);
    const post = await http1
      .post('/publicacoes')
      .set('Authorization', p1)
      .send({ texto: 'Encontro do programa' })
      .expect(201);
    const comentado = await http1
      .post(`/publicacoes/${post.body.id}/comentarios`)
      .set('Authorization', aluno)
      .send({ texto: 'Vou participar' })
      .expect(201);
    const comentarioId = comentado.body.comentariosDetalhes[0].id;

    abortar = new AbortController();
    const stream = await fetch(
      `${await api1.app.getUrl()}/chats/${grupo.id}/events`,
      { headers: { Authorization: aluno }, signal: abortar.signal },
    );
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader(),
      decoder = new TextDecoder();
    let eventos = '';
    const esperar = async (nome: string) => {
      const limite = setTimeout(() => abortar!.abort(), 8_000);
      try {
        while (!eventos.includes(`event: ${nome}`)) {
          const r = await reader.read();
          if (r.done) throw new Error(`Stream encerrou antes de ${nome}`);
          eventos += decoder.decode(r.value, { stream: true });
        }
      } finally {
        clearTimeout(limite);
      }
    };
    await esperar('chat.ready');
    await http2
      .post(`/coordenacao/matching/vinculos/${v.id}/transferir`)
      .set('Authorization', coord)
      .send({
        padrinhoDestinoId: c.p[1].id,
        motivo: 'Melhor acompanhamento',
        operacaoId: randomUUID(),
      })
      .expect(201);
    await esperar('chat.access');
    expect(eventos).toContain('"podeEnviar":false');
    await reader.cancel();
    await http1
      .post(`/chats/${grupo.id}/mensagens`)
      .set('Authorization', p1)
      .send({ texto: 'Depois da transferência', clientId: randomUUID() })
      .expect(201);
    await http1
      .post(`/chats/${grupo.id}/mensagens`)
      .set('Authorization', aluno)
      .send({ texto: 'Envio bloqueado', clientId: randomUUID() })
      .expect(409);
    const historico = await http1
      .get(`/chats/${grupo.id}/mensagens`)
      .set('Authorization', aluno)
      .expect(200);
    expect(
      historico.body.mensagens.map((m: { texto: string }) => m.texto),
    ).toEqual(['Antes da transferência']);
    const chats = await http1
      .get('/chats')
      .query({ programa: c.programa.codigo })
      .set('Authorization', aluno)
      .expect(200);
    expect(JSON.stringify(chats.body)).toContain(c.p[1].usuarioId);
    await http1
      .delete(`/publicacoes/${post.body.id}/comentarios/${comentarioId}`)
      .set('Authorization', p1)
      .expect(403);
    await http2
      .delete(`/publicacoes/${post.body.id}/comentarios/${comentarioId}`)
      .set('Authorization', p2)
      .expect(200);
    expect(
      (
        await http1
          .get('/publicacoes/permissoes')
          .set('Authorization', aluno)
          .expect(200)
      ).body.podeLer,
    ).toBe(true);

    await banco.dados
      .getRepository(ProgramaEntity)
      .update(c.programa.id, { etapaAtual: 'encerramento' });
    expect(
      (
        await http1
          .get('/publicacoes/permissoes')
          .set('Authorization', p2)
          .expect(200)
      ).body,
    ).toMatchObject({
      podeLer: false,
      podePublicar: false,
      podeInteragir: false,
    });
    await http2
      .post('/publicacoes')
      .set('Authorization', p2)
      .send({ texto: 'Após o encerramento' })
      .expect(403);
    await http1
      .get(`/chats/${grupo.id}/mensagens`)
      .set('Authorization', aluno)
      .expect(200);
  }, 90_000);

  it('outbox persiste após falha de confirmação e dois workers não disputam a mesma linha', async () => {
    banco = await bancoMatchingIsolado();
    const c = await semearCenarioMatching(banco.dados);
    await c.operacoes.vincular(c.a[0].id, c.p[0].id, 'coord@teste.local');
    const api = await apiMatchingIsolada(banco.dados);
    apis.push(api);
    await request(api.app.getHttpServer())
      .post('/publicacoes')
      .set('Authorization', `Bearer ${api.token(c.p[0].usuarioId)}`)
      .send({ texto: 'Evento durável' })
      .expect(201);
    const repo = banco.dados.getRepository(FeedOutboxEntity),
      antes = await repo.find();
    expect(antes).toHaveLength(1);
    const falha = {
      disponivel: () => true,
      publicar: async () => {
        throw new Error('Confirmação perdida');
      },
    } as unknown as FeedRabbitService;
    await new FeedOutboxService(banco.dados, falha).despachar();
    expect(
      (await repo.findOneByOrFail({ id: antes[0].id })).publicadoEm,
    ).toBeNull();
    await banco.outra.initialize();
    const entregues: string[] = [];
    const recuperado = {
      disponivel: () => true,
      publicar: async (e: { id: string }) => {
        entregues.push(e.id);
      },
    } as unknown as FeedRabbitService;
    await Promise.all([
      new FeedOutboxService(banco.dados, recuperado).despachar(),
      new FeedOutboxService(banco.outra, recuperado).despachar(),
    ]);
    expect(entregues).toEqual([antes[0].id]);
    expect(
      (await repo.findOneByOrFail({ id: antes[0].id })).publicadoEm,
    ).toBeInstanceOf(Date);
  }, 90_000);
});
