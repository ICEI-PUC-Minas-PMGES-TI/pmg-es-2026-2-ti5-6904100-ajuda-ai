import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificacoesController } from './notificacoes.controller.js';
import { NotificacoesService } from './notificacoes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificacoesController],
  providers: [NotificacoesService],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
