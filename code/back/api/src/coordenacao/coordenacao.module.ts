import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AvisosModule } from '../avisos/avisos.module.js';
import { FormulariosModule } from '../formularios/formularios.module.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ParticipacoesModule } from '../participacoes/participacoes.module.js';
import { ProgramasModule } from '../programas/programas.module.js';
import { CoordenacaoController } from './coordenacao.controller.js';
import { CoordenacaoService } from './coordenacao.service.js';

@Module({
  imports: [
    AuthModule,
    AvisosModule,
    FormulariosModule,
    ProgramasModule,
    ParticipacoesModule,
    TypeOrmModule.forFeature([ParticipacaoEntity]),
  ],
  controllers: [CoordenacaoController],
  providers: [CoordenacaoService],
})
export class CoordenacaoModule {}
