import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ProgramasModule } from '../programas/programas.module.js';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ParticipacoesController } from './participacoes.controller.js';
import { ParticipacoesService } from './participacoes.service.js';

@Module({
  imports: [
    AuthModule,
    ProgramasModule,
    TypeOrmModule.forFeature([ParticipacaoEntity]),
  ],
  controllers: [ParticipacoesController],
  providers: [ParticipacoesService],
  exports: [ParticipacoesService, TypeOrmModule],
})
export class ParticipacoesModule {}
