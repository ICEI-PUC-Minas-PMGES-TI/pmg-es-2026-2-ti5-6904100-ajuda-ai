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
import { eventoChatValido, type EventoChat } from './chat-evento.js';
import { ChatCacheService } from './chat-cache.service.js';
import { ChatStreamService } from './chat-stream.service.js';

@Injectable()
export class ChatRabbitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRabbitService.name);
  private readonly instancia = randomUUID();
  private readonly exchange: string;
  private conexao?: AmqpConnectionManager;
  private canal?: ChannelWrapper;
  private pronto = false;

  constructor(
    private readonly config: ConfigService,
    private readonly stream: ChatStreamService,
    private readonly cache: ChatCacheService,
  ) {
    this.exchange = config.get<string>(
      'RABBITMQ_CHAT_EXCHANGE',
      'ajuda-ai.chat',
    );
  }

  onModuleInit(): void {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        'RABBITMQ_URL ausente; eventos de chat aguardam na outbox.',
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
    this.conexao.on('connectFailed', () =>
      this.logger.warn(
        'RabbitMQ indisponível para o chat; nova tentativa automática.',
      ),
    );
    this.canal = this.conexao.createChannel({
      confirm: true,
      setup: async (canal: ConfirmChannel) => {
        this.pronto = false;
        await canal.assertExchange(this.exchange, 'topic', { durable: true });
        const prefixo = this.config.get<string>(
          'RABBITMQ_CHAT_QUEUE',
          'ajuda-ai.chat.sse',
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
        await canal.bindQueue(queue, this.exchange, 'chat.*');
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
      this.logger.warn(
        'Canal RabbitMQ do chat indisponível; aguardando reconexão.',
      );
    });
  }

  disponivel(): boolean {
    return this.pronto && Boolean(this.conexao?.isConnected());
  }

  async publicar(evento: EventoChat): Promise<void> {
    if (!this.disponivel() || !this.canal)
      throw new Error('RabbitMQ do chat indisponível.');
    await this.canal.publish(
      this.exchange,
      `chat.${evento.chatId}`,
      Buffer.from(JSON.stringify(evento)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: evento.id,
        timeout: 3000,
      },
    );
  }

  private consumir(
    canal: Pick<ConfirmChannel, 'ack' | 'nack'>,
    mensagem: ConsumeMessage | null,
  ): void {
    if (!mensagem) return;
    try {
      const evento: unknown = JSON.parse(mensagem.content.toString('utf8'));
      if (!eventoChatValido(evento)) throw new Error('Evento inválido.');
      this.cache.invalidar(evento.chatId);
      this.stream.receber(evento);
      canal.ack(mensagem);
    } catch {
      canal.nack(mensagem, false, false);
      this.logger.warn('Evento inválido de chat descartado.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pronto = false;
    await this.conexao?.close();
  }
}
