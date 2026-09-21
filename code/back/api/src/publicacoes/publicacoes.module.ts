import { Module } from '@nestjs/common';
import { PublicacoesController } from './publicacoes.controller.js';
import { PublicacoesService } from './publicacoes.service.js';

@Module({
  controllers: [PublicacoesController],
  providers: [PublicacoesService],
})
export class PublicacoesModule {}
