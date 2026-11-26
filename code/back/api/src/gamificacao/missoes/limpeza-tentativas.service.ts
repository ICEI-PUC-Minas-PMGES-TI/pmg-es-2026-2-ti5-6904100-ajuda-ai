import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';
import { JANELA_TENTATIVAS_CODIGO } from './missoes.js';

export const INTERVALO_LIMPEZA_TENTATIVAS_MS = 60 * 60 * 1000;

@Injectable()
export class LimpezaTentativasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Missoes');
  private timer?: ReturnType<typeof setInterval>;
  private emExecucao?: Promise<void>;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    void this.limpar();
    this.timer = setInterval(() => {
      void this.limpar();
    }, INTERVALO_LIMPEZA_TENTATIVAS_MS);
    this.timer.unref();
  }

  async limpar(): Promise<void> {
    if (this.emExecucao) return;
    this.emExecucao = this.apagarVencidas();
    try {
      await this.emExecucao;
    } finally {
      this.emExecucao = undefined;
    }
  }

  private async apagarVencidas(): Promise<void> {
    try {
      await this.dataSource.query(
        `DELETE FROM "${SCHEMA_GAMIFICACAO}"."missoes_tentativas_codigo" ` +
          `WHERE "criado_em" <= now() - interval '${JANELA_TENTATIVAS_CODIGO}'`,
      );
    } catch (erro) {
      this.logger.warn(
        `falha ao limpar tentativas de código: ${(erro as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.emExecucao;
  }
}
