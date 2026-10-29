import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { PublicacaoEntity } from '../src/publicacoes/entities/publicacao.entity.js';
import { ComentarioEntity } from '../src/publicacoes/entities/comentario.entity.js';
import { CurtidaEntity } from '../src/publicacoes/entities/curtida.entity.js';
import { FeedOutboxEntity } from '../src/publicacoes/entities/feed-outbox.entity.js';
import { FeedTempoReal1793300000000 } from '../src/migrations/1793300000000-FeedTempoReal.js';
import { PublicacoesService } from '../src/publicacoes/publicacoes.service.js';
import { FeedPolicy } from '../src/publicacoes/feed-policy.js';
import { FeedStreamService } from '../src/publicacoes/feed-stream.service.js';
import { FeedRabbitService } from '../src/publicacoes/feed-rabbit.service.js';
import { FeedOutboxService } from '../src/publicacoes/feed-outbox.service.js';
import type { UsuariosService } from '../src/usuarios/usuarios.service.js';
import type { FeedMidiasService } from '../src/publicacoes/feed-midias.service.js';
import { coordenador, aluno } from './helpers/feed.js';

const db = process.env.FEED_TEST_DB_URL;
const amqp = process.env.FEED_TEST_RABBITMQ_URL;
describe.skipIf(!db || !amqp)(
  'Feed PostgreSQL → RabbitMQ → SSE (isolado)',
  () => {
    const schema = `feed_test_${Date.now()}`;
    let dados: DataSource;
    let service: PublicacoesService;
    let streams: FeedStreamService[];
    let rabbits: FeedRabbitService[];
    let outbox: FeedOutboxService;
    beforeAll(async () => {
      dados = new DataSource({
        type: 'postgres',
        url: db,
        schema,
        entities: [
          PublicacaoEntity,
          ComentarioEntity,
          CurtidaEntity,
          FeedOutboxEntity,
        ],
        synchronize: false,
      });
      await dados.initialize();
      await dados.query(`CREATE SCHEMA "${schema}"`);
      await dados.synchronize();
      await dados.query(`DROP TABLE "${schema}".feed_outbox`);
      const runner = dados.createQueryRunner();
      try {
        await new FeedTempoReal1793300000000().up(runner);
      } finally {
        await runner.release();
      }
      streams = [new FeedStreamService(), new FeedStreamService()];
      rabbits = streams.map(
        (stream) =>
          new FeedRabbitService(
            new ConfigService({
              RABBITMQ_URL: amqp,
              RABBITMQ_FEED_EXCHANGE: `ajuda-ai.feed.test.${schema}`,
              RABBITMQ_FEED_QUEUE: `ajuda-ai.feed.test.${schema}`,
            }),
            stream,
          ),
      );
      for (const rabbit of rabbits) rabbit.onModuleInit();
      const limite = Date.now() + 10000;
      while (rabbits.some((r) => !r.disponivel()) && Date.now() < limite)
        await new Promise((r) => setTimeout(r, 50));
      expect(rabbits.every((r) => r.disponivel())).toBe(true);
      outbox = new FeedOutboxService(dados, rabbits[0]);
      service = new PublicacoesService(
        dados.getRepository(PublicacaoEntity),
        dados,
        new FeedPolicy(),
        { buscarPorEmail: async () => null } as unknown as UsuariosService,
        {
          validar: async () => {},
          urls: (keys: string[]) => keys,
        } as unknown as FeedMidiasService,
      );
    }, 20000);
    afterAll(async () => {
      await outbox?.onModuleDestroy();
      for (const rabbit of rabbits ?? []) await rabbit.onModuleDestroy();
      for (const stream of streams ?? []) stream.onModuleDestroy();
      if (dados?.isInitialized) {
        // Somente schema gerado pelo teste; não utiliza o schema/banco da aplicação.
        await dados.query(`DROP SCHEMA "${schema}" CASCADE`);
        await dados.destroy();
      }
    });
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
      const pendente = (
        await dados.getRepository(FeedOutboxEntity).find()
      ).find((v) => v.evento.publicacaoId === post.id)!;
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
  },
);
