import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { eventoFeedValido, type EventoFeed } from './feed-evento.js';
import { FeedStreamService } from './feed-stream.service.js';

/** Usa amqplib + amqp-connection-manager, as bibliotecas AMQP recomendadas pelo Nest. */
@Injectable()
export class FeedRabbitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedRabbitService.name);
  private conexao?: AmqpConnectionManager;
  private canal?: ChannelWrapper;
  private pronto = false;
  private readonly instancia = randomUUID();
  private readonly exchange: string;

  constructor(
    private readonly config: ConfigService,
    private readonly stream: FeedStreamService,
  ) {
    this.exchange = config.get<string>(
      'RABBITMQ_FEED_EXCHANGE',
      'ajuda-ai.feed',
    );
  }

  onModuleInit(): void {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL ausente; eventos ficam na outbox até configurar o broker.',
      );
      return;
    }
    this.conexao = amqp.connect([url], {
      heartbeatIntervalInSeconds: 10,
      reconnectTimeInSeconds: 5,
      connectionOptions: { timeout: 3000 },
    });
    this.conexao.on('disconnect', () => {
      this.pronto = false;
      this.stream.brokerConectado = false;
    });
    // Não registrar o erro bruto: ele pode conter URL/credenciais do broker.
    this.conexao.on('connectFailed', () =>
      this.logger.warn('RabbitMQ indisponível; nova tentativa automática.'),
    );
    this.canal = this.conexao.createChannel({
      confirm: true,
      setup: async (canal: ConfirmChannel) => {
        this.pronto = false;
        await canal.assertExchange(this.exchange, 'fanout', { durable: true });
        // Uma fila por instância: todos os servidores SSE recebem todos os eventos.
        const prefixo = this.config.get<string>(
          'RABBITMQ_FEED_QUEUE',
          'ajuda-ai.feed.sse',
        );
        const { queue } = await canal.assertQueue(
          `${prefixo}.${this.instancia}`,
          {
            exclusive: true,
            durable: false,
            autoDelete: true,
            arguments: { 'x-message-ttl': 60_000, 'x-max-length': 10000 },
          },
        );
        await canal.bindQueue(queue, this.exchange, '');
        await canal.prefetch(50);
        await canal.consume(
          queue,
          (mensagem) => this.consumir(canal, mensagem),
          { noAck: false },
        );
        this.pronto = true;
        this.stream.conectado();
      },
    });
    this.canal.on('error', () => {
      this.pronto = false;
      this.stream.brokerConectado = false;
      this.logger.warn('Canal RabbitMQ indisponível; aguardando reconexão.');
    });
  }

  disponivel(): boolean {
    return this.pronto && Boolean(this.conexao?.isConnected());
  }

  async publicar(evento: EventoFeed): Promise<void> {
    if (!this.disponivel() || !this.canal)
      throw new Error('RabbitMQ indisponível.');
    await this.canal.publish(
      this.exchange,
      '',
      Buffer.from(JSON.stringify(evento)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: evento.id,
        timeout: 3000,
      },
    );
  }

  consumir(
    canal: Pick<ConfirmChannel, 'ack' | 'nack'>,
    mensagem: ConsumeMessage | null,
  ): void {
    if (!mensagem) return;
    try {
      const evento: unknown = JSON.parse(mensagem.content.toString('utf8'));
      if (!eventoFeedValido(evento)) throw new Error('Evento inválido.');
      // Reconstroi a mensagem permitida; campos extras não atravessam o SSE.
      this.stream.receber({
        id: evento.id,
        tipo: evento.tipo,
        publicacaoId: evento.publicacaoId,
        ocorridoEm: evento.ocorridoEm,
        ...(evento.programaCodigo
          ? { programaCodigo: evento.programaCodigo }
          : {}),
      });
      canal.ack(mensagem);
    } catch {
      canal.nack(mensagem, false, false);
      this.logger.warn('Evento inválido do feed descartado.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pronto = false;
    await this.conexao?.close();
  }
}
