import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChatOutboxEntity } from './entities/chat.entity.js';
import { ChatRabbitService } from './chat-rabbit.service.js';

@Injectable()
export class ChatOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatOutboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private emExecucao?: Promise<void>;

  constructor(
    @InjectDataSource() private readonly dados: DataSource,
    private readonly rabbit: ChatRabbitService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.despachar();
    }, 1000);
    this.timer.unref();
  }

  async despachar(): Promise<void> {
    if (this.emExecucao || !this.rabbit.disponivel()) return;
    this.emExecucao = this.processar();
    try {
      await this.emExecucao;
    } catch {
      this.logger.warn(
        'Entrega de mensagem adiada; evento permanece na outbox.',
      );
    } finally {
      this.emExecucao = undefined;
    }
  }

  private async processar(): Promise<void> {
    for (let i = 0; i < 50 && this.rabbit.disponivel(); i++) {
      const encontrou = await this.dados.transaction(async (manager) => {
        const repo = manager.getRepository(ChatOutboxEntity);
        const evento = await repo
          .createQueryBuilder('evento')
          .where('evento.publicado_em IS NULL')
          .orderBy('evento.criado_em', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getOne();
        if (!evento) return false;
        await this.rabbit.publicar(evento.evento);
        evento.publicadoEm = new Date();
        await repo.save(evento);
        return true;
      });
      if (!encontrou) break;
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.emExecucao;
  }
}
