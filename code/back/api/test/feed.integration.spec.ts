import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { PublicacaoEntity } from '../src/publicacoes/entities/publicacao.entity.js';
import { ComentarioEntity } from '../src/publicacoes/entities/comentario.entity.js';
import { CurtidaEntity } from '../src/publicacoes/entities/curtida.entity.js';
import { CurtidaComentarioEntity } from '../src/publicacoes/entities/curtida-comentario.entity.js';
import { FeedOutboxEntity } from '../src/publicacoes/entities/feed-outbox.entity.js';
import { FeedTempoReal1793300000000 } from '../src/migrations/1793300000000-FeedTempoReal.js';
import { ThreadsComentariosFeed1793400000000 } from '../src/migrations/1793400000000-ThreadsComentariosFeed.js';
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
          CurtidaComentarioEntity,
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
        // Simula o schema anterior: a migration nova deve preservar comentários já existentes.
        await dados.query(`DROP TABLE "${schema}".curtidas_comentarios`);
        await dados.query(
          `ALTER TABLE "${schema}".comentarios DROP COLUMN pai_id CASCADE`,
        );
        const [legado] = (await dados.query(`INSERT INTO "${schema}".publicacoes
          (autor, iniciais, descricao_autor, categoria, texto, owner_id)
          VALUES ('Autor legado', 'AL', 'Programa', 'Comunicados', 'Legado', 'legado') RETURNING id`)) as {
          id: number;
        }[];
        await dados.query(
          `INSERT INTO "${schema}".comentarios(publicacao_id, autor_id, texto)
          VALUES ($1, 'legado', 'Comentário anterior à migration')`,
          [legado.id],
        );
        await new ThreadsComentariosFeed1793400000000().up(runner);
        const [comentarioLegado] = await dados.query(
          `SELECT texto, pai_id FROM "${schema}".comentarios WHERE publicacao_id = $1`,
          [legado.id],
        );
        expect(comentarioLegado).toEqual({
          texto: 'Comentário anterior à migration',
          pai_id: null,
        });
        await dados.query(`DELETE FROM "${schema}".publicacoes WHERE id = $1`, [
          legado.id,
        ]);
        await new ThreadsComentariosFeed1793400000000().down(runner);
        await new ThreadsComentariosFeed1793400000000().up(runner);
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
        {
          buscarPorEmail: async () => null,
          buscarAutoresPorEmails: async () => [],
        } as unknown as UsuariosService,
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
      expect(await dados.getRepository(CurtidaComentarioEntity).count()).toBe(
        0,
      );
    });
  },
);
