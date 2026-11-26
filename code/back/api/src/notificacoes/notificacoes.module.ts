import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ParticipacoesModule } from '../participacoes/participacoes.module.js';
import { NotificacoesServicoModule } from './notificacoes-servico.module.js';
import { NotificacoesController } from './notificacoes.controller.js';

@Module({
  imports: [AuthModule, ParticipacoesModule, NotificacoesServicoModule],
  controllers: [NotificacoesController],
  exports: [NotificacoesServicoModule],
})
export class NotificacoesModule {}
