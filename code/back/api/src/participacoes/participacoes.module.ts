import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ParticipacoesController } from './participacoes.controller.js';
import { ParticipacoesService } from './participacoes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ParticipacaoEntity])],
  controllers: [ParticipacoesController],
  providers: [ParticipacoesService],
  exports: [ParticipacoesService, TypeOrmModule],
})
export class ParticipacoesModule {}
