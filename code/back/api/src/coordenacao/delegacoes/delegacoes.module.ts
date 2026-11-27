import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DelegacaoGuard } from './delegacao.guard.js';
import {
  DelegacoesController,
  MinhasDelegacoesController,
} from './delegacoes.controller.js';
import { DelegacoesService } from './delegacoes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DelegacoesController, MinhasDelegacoesController],
  providers: [DelegacoesService, DelegacaoGuard],
  exports: [DelegacoesService, DelegacaoGuard],
})
export class DelegacoesModule {}
