import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ProgramasModule } from '../programas/programas.module.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import { ParticipacoesController } from './participacoes.controller.js';
import { ParticipacoesService } from './participacoes.service.js';
import { PermissoesAlunoService } from './permissoes-aluno.service.js';

@Module({
  imports: [
    AuthModule,
    ProgramasModule,
    TypeOrmModule.forFeature([ParticipacaoEntity, ProgramaEntity]),
  ],
  controllers: [ParticipacoesController],
  providers: [ParticipacoesService, PermissoesAlunoService],
  exports: [ParticipacoesService, PermissoesAlunoService, TypeOrmModule],
})
export class ParticipacoesModule {}
