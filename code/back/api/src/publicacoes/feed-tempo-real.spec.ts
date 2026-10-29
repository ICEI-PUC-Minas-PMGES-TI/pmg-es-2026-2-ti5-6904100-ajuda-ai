import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { filter, firstValueFrom } from 'rxjs';
import { FeedStreamService } from './feed-stream.service.js';
import { FeedRabbitService } from './feed-rabbit.service.js';
import { FeedOutboxService } from './feed-outbox.service.js';
import { novoEventoFeed } from './feed-evento.js';
import { FeedMidiasService } from './feed-midias.service.js';
import type { AzureBlobStorageService } from '../storage/azure-blob-storage.service.js';

describe('entrega de eventos do feed', () => {
  it('consumidor entrega RabbitMQ → SSE com ACK e deduplicação', async () => {
    const stream = new FeedStreamService();
    const rabbit = new FeedRabbitService(new ConfigService({}), stream);
    const evento = novoEventoFeed('feed.post.created', 1);
    const canal = { ack: vi.fn(), nack: vi.fn() };
    const recebidos: any[] = [];
    const sub = stream
      .observar(Date.now() + 60000)
      .subscribe((e) => recebidos.push(e));
    rabbit.consumir(
      canal as unknown as ConfirmChannel,
      {
        content: Buffer.from(
          JSON.stringify({ ...evento, segredo: 'não repassar' }),
        ),
      } as ConsumeMessage,
    );
    rabbit.consumir(
      canal as unknown as ConfirmChannel,
      { content: Buffer.from(JSON.stringify(evento)) } as ConsumeMessage,
    );
    expect(recebidos.filter((e) => e.type === 'feed.post.created')).toEqual([
      { type: evento.tipo, id: evento.id, data: evento },
    ]);
    expect(canal.ack).toHaveBeenCalledTimes(2);
    sub.unsubscribe();
    stream.receber(novoEventoFeed('feed.like.updated', 1));
    expect(recebidos).toHaveLength(2);
    stream.onModuleDestroy();
  });
  it('descarta eventos inválidos sem requeue infinito', () => {
    const stream = new FeedStreamService();
    const rabbit = new FeedRabbitService(new ConfigService({}), stream);
    const canal = { ack: vi.fn(), nack: vi.fn() };
    rabbit.consumir(
      canal as unknown as ConfirmChannel,
      { content: Buffer.from('invalido') } as ConsumeMessage,
    );
    expect(canal.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(canal.ack).not.toHaveBeenCalled();
    stream.onModuleDestroy();
  });
  it('sem RabbitMQ não bloqueia inicialização nem tenta publicar indefinidamente', async () => {
    const stream = new FeedStreamService();
    const rabbit = new FeedRabbitService(new ConfigService({}), stream);
    rabbit.onModuleInit();
    expect(rabbit.disponivel()).toBe(false);
    await expect(
      rabbit.publicar(novoEventoFeed('feed.like.updated', 1)),
    ).rejects.toThrow('indisponível');
    await rabbit.onModuleDestroy();
    stream.onModuleDestroy();
  });
  it('outbox só marca entregue após confirmação e preserva evento em falha', async () => {
    const item = {
      evento: novoEventoFeed('feed.comment.created', 1),
      publicadoEm: null as Date | null,
    };
    const salvar = vi.fn();
    const query: any = {
      where: () => query,
      orderBy: () => query,
      setLock: () => query,
      setOnLocked: () => query,
      getOne: async () => (item.publicadoEm ? null : item),
    };
    const manager = {
      getRepository: () => ({ createQueryBuilder: () => query, save: salvar }),
    };
    const dados = {
      transaction: async (acao: any) => acao(manager),
    } as unknown as DataSource;
    const publicar = vi
      .fn()
      .mockRejectedValueOnce(new Error('broker fora'))
      .mockResolvedValue(undefined);
    const rabbit = {
      disponivel: () => true,
      publicar,
    } as unknown as FeedRabbitService;
    const outbox = new FeedOutboxService(dados, rabbit);
    await outbox.despachar();
    expect(item.publicadoEm).toBeNull();
    expect(salvar).not.toHaveBeenCalled();
    await outbox.despachar();
    expect(item.publicadoEm).toBeInstanceOf(Date);
    expect(salvar).toHaveBeenCalledTimes(1);
  });
  it('SSE encerra quando expira a sessão e remove assinaturas', async () => {
    const stream = new FeedStreamService();
    await firstValueFrom(stream.observar(Date.now() + 1000));
    await new Promise<void>((resolve) =>
      stream.observar(Date.now() + 10).subscribe({ complete: resolve }),
    );
    stream.onModuleDestroy();
  });
  it('reconexão do broker pede ressincronização aos clientes conectados', async () => {
    const stream = new FeedStreamService();
    const evento = firstValueFrom(
      stream
        .observar(Date.now() + 10000)
        .pipe(
          filter(
            (e) => (e.data as { conectado?: boolean })?.conectado === true,
          ),
        ),
    );
    stream.conectado();
    expect((await evento).type).toBe('feed.ready');
    stream.onModuleDestroy();
  });
});

describe('mídias do feed', () => {
  it('reutiliza storage e salva apenas chave estável, com SAS renovada na leitura', async () => {
    const storage = {
      enviar: vi.fn(async (_: string, nome: string) => ({
        chave: `feed/${nome}`,
      })),
      sasLeitura: vi.fn(() => ({ url: 'https://storage.test/temporaria' })),
      existe: vi.fn(async () => true),
    };
    const midias = new FeedMidiasService(
      storage as unknown as AzureBlobStorageService,
    );
    const blob = await midias.enviar(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      'coord@teste',
    );
    expect(blob.chave).toMatch(/^feed\/publicacoes\//);
    await midias.validar([blob.chave], 'coord@teste');
    expect(midias.urls([blob.chave])).toEqual([
      'https://storage.test/temporaria',
    ]);
    await expect(midias.validar([blob.chave], 'outro@teste')).rejects.toThrow();
    await expect(
      midias.enviar(Buffer.from('arquivo falso'), 'coord@teste'),
    ).rejects.toThrow();
  });
});
