import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeedOutboxEntity } from './entities/feed-outbox.entity.js';
import { FeedRabbitService } from './feed-rabbit.service.js';

/** Publica apenas linhas já commitadas. ACK perdido pode repetir evento (id estável). */
@Injectable()
export class FeedOutboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private emExecucao?: Promise<void>;
  private readonly logger = new Logger(FeedOutboxService.name);
  constructor(
    @InjectDataSource() private readonly dados: DataSource,
    private readonly rabbit: FeedRabbitService,
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
      this.logger.warn('Entrega do feed adiada; evento permanece na outbox.');
    } finally {
      this.emExecucao = undefined;
    }
  }

  private async processar(): Promise<void> {
    // Um evento por transação: lock curto e skip_locked permitem múltiplas instâncias.
    for (let i = 0; i < 50 && this.rabbit.disponivel(); i++) {
      const encontrou = await this.dados.transaction(async (manager) => {
        const repo = manager.getRepository(FeedOutboxEntity);
        const item = await repo
          .createQueryBuilder('evento')
          .where('evento.publicado_em IS NULL')
          .orderBy('evento.criado_em', 'ASC')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getOne();
        if (!item) return false;
        await this.rabbit.publicar(item.evento);
        item.publicadoEm = new Date();
        await repo.save(item);
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
