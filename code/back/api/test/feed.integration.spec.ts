import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { FeedOutboxEntity } from '../src/publicacoes/entities/feed-outbox.entity.js';
import { CurtidaComentarioEntity } from '../src/publicacoes/entities/curtida-comentario.entity.js';
import { ThreadsComentariosFeed1793400000000 } from '../src/migrations/1793400000000-ThreadsComentariosFeed.js';
import type { PublicacoesService } from '../src/publicacoes/publicacoes.service.js';
import { FeedStreamService } from '../src/publicacoes/feed-stream.service.js';
import { FeedRabbitService } from '../src/publicacoes/feed-rabbit.service.js';
import { FeedOutboxService } from '../src/publicacoes/feed-outbox.service.js';
import { coordenador } from './helpers/feed.js';
import {
  bancoMatchingIsolado,
  semearCenarioMatching,
} from './helpers/matching-postgres.js';
import { apiMatchingIsolada } from './helpers/matching-http.js';
import type { AccessTokenPayload } from '../src/auth/authenticated-request.js';

const amqp = process.env.FEED_TEST_RABBITMQ_URL;
describe.skipIf(
  !process.env.MATCHING_TEST_DB_URL ||
    process.env.MATCHING_TEST_DB_ISOLATED !== 'true' ||
    !amqp,
)('Feed PostgreSQL → RabbitMQ → SSE (isolado)', () => {
  let banco: Awaited<ReturnType<typeof bancoMatchingIsolado>>;
  let api: Awaited<ReturnType<typeof apiMatchingIsolada>>;
  let dados: DataSource, service: PublicacoesService;
  let streams: FeedStreamService[] = [],
    rabbits: FeedRabbitService[] = [];
  let outbox: FeedOutboxService;
  let aluno: AccessTokenPayload;
  beforeAll(async () => {
    banco = await bancoMatchingIsolado();
    dados = banco.dados;
    const c = await semearCenarioMatching(dados);
    await c.operacoes.vincular(c.a[0].id, c.p[0].id, coordenador.email);
    aluno = {
      sub: c.a[0].usuarioId,
      email: c.a[0].usuarioId,
      perfil: 'apadrinhado',
      escopo: 'acesso',
    };
    api = await apiMatchingIsolada(dados);
    service = api.publicacoes;
    streams = [new FeedStreamService(), new FeedStreamService()];
    const config = new ConfigService({
      RABBITMQ_URL: amqp,
      RABBITMQ_FEED_EXCHANGE: `ajuda-ai.teste.${banco.schema}`,
      RABBITMQ_FEED_QUEUE: `ajuda-ai.teste.${banco.schema}`,
    });
    rabbits = streams.map((stream) => new FeedRabbitService(config, stream));
    rabbits.forEach((r) => r.onModuleInit());
    const limite = Date.now() + 15_000;
    while (!rabbits.every((r) => r.disponivel())) {
      if (Date.now() > limite) throw new Error('Broker de teste indisponível.');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    outbox = new FeedOutboxService(dados, rabbits[0]);
  }, 90_000);
  afterAll(async () => {
    await outbox?.onModuleDestroy();
    await Promise.all(rabbits.map((r) => r.onModuleDestroy()));
    streams.forEach((s) => s.onModuleDestroy());
    await api?.app.close();
    await banco?.limpar();
  }, 30_000);
  it('evento persistido é entregue a duas instâncias SSE após publicação confirmada', async () => {
    const aguardando = streams.map((s) =>
      firstValueFrom(
        s.observar(Date.now() + 10000).pipe(
          filter((e) => e.type === 'feed.post.created'),
          timeout(5000),
        ),
      ),
    );
    const post = await service.criar(
      { texto: 'Comunicado integrado' },
      coordenador,
    );
    const pendente = (await dados.getRepository(FeedOutboxEntity).find()).find(
      (v) => v.evento.publicacaoId === post.id,
    )!;
    expect(pendente.publicadoEm).toBeNull();
    await outbox.despachar();
    const eventos = await Promise.all(aguardando);
    expect(
      eventos.map((e) => (e.data as { publicacaoId: number }).publicacaoId),
    ).toEqual([post.id, post.id]);
    expect(
      (
        await dados
          .getRepository(FeedOutboxEntity)
          .findOneByOrFail({ id: pendente.id })
      ).publicadoEm,
    ).toBeInstanceOf(Date);
  });
  it('curtidas concorrentes são idempotentes e comentário gera atualização SSE', async () => {
    const post = await service.criar({ texto: 'Concorrência' }, coordenador);
    await Promise.all(
      Array.from({ length: 10 }, () => service.curtir(post.id, 1, aluno)),
    );
    expect((await service.obter(post.id, aluno)).curtidas).toBe(1);
    const recebeu = firstValueFrom(
      streams[1].observar(Date.now() + 10000).pipe(
        filter(
          (e) =>
            e.type === 'feed.comment.created' &&
            (e.data as { publicacaoId: number }).publicacaoId === post.id,
        ),
        timeout(5000),
      ),
    );
    await service.comentar(post.id, 'Comentário integrado', aluno);
    await outbox.despachar();
    expect(
      ((await recebeu).data as { publicacaoId: number }).publicacaoId,
    ).toBe(post.id);
    const likes = await dados.getRepository(FeedOutboxEntity).find();
    expect(
      likes.filter(
        (v) =>
          v.evento.tipo === 'feed.like.updated' &&
          v.evento.publicacaoId === post.id,
      ),
    ).toHaveLength(1);
  });
  it('threads, cascade, curtidas concorrentes e evento de comentário chegam às duas instâncias SSE', async () => {
    const post = await service.criar(
      { texto: 'Thread integrada' },
      coordenador,
    );
    const raiz = (await service.comentar(post.id, 'Raiz', aluno))
      .comentariosDetalhes[0];
    const reply = (
      await service.comentar(post.id, 'Resposta', coordenador, raiz.id)
    ).comentariosDetalhes[1];
    await service.comentar(post.id, 'Resposta de resposta', aluno, reply.id);
    const recebendo = streams.map((stream) =>
      firstValueFrom(
        stream.observar(Date.now() + 10000).pipe(
          filter(
            (e) =>
              e.type === 'feed.comment.like.updated' &&
              (e.data as { publicacaoId: number }).publicacaoId === post.id,
          ),
          timeout(5000),
        ),
      ),
    );
    await Promise.all(
      Array.from({ length: 10 }, () =>
        service.curtirComentario(post.id, reply.id, 1, aluno),
      ),
    );
    const r = await service.obter(post.id, aluno);
    expect(r.comentariosDetalhes.map((c) => c.paiId)).toEqual([
      null,
      raiz.id,
      raiz.id,
    ]);
    expect(r.comentariosDetalhes[1].curtidas).toBe(1);
    expect(r.curtidas).toBe(0);
    await outbox.despachar();
    await Promise.all(recebendo);
    const eventos = await dados.getRepository(FeedOutboxEntity).find();
    expect(
      eventos.filter(
        (e) =>
          e.evento.publicacaoId === post.id &&
          e.evento.tipo === 'feed.comment.like.updated',
      ),
    ).toHaveLength(1);
    const runner = dados.createQueryRunner();
    try {
      await expect(
        new ThreadsComentariosFeed1793400000000().down(runner),
      ).rejects.toThrow('Rollback recusado');
    } finally {
      await runner.release();
    }
    const final = await service.removerComentario(
      post.id,
      raiz.id,
      coordenador,
    );
    expect(final.comentarios).toBe(0);
    expect(await dados.getRepository(CurtidaComentarioEntity).count()).toBe(0);
  });
});
