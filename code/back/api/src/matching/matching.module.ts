import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { CriterioCatalogoService } from './criterio-catalogo.service.js';
import {
  MatchingCriterioEntity,
  MatchingCriterioVersaoEntity,
} from './entities/criterio-catalogo.entity.js';
import {
  MatchingChatOutboxEntity,
  MatchingConfiguracaoEntity,
  MatchingDecisaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from './entities/matching.entity.js';
import { MatchingController } from './matching.controller.js';
import { MatchingService } from './matching.service.js';

export const ENTIDADES_MATCHING = [
  MatchingConfiguracaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingDecisaoEntity,
  MatchingVinculoEntity,
  MatchingChatOutboxEntity,
  MatchingCriterioEntity,
  MatchingCriterioVersaoEntity,
] as const;

@Module({
  imports: [
    AuthModule,
    ChatModule,
    TypeOrmModule.forFeature([
      ProgramaEntity,
      ParticipacaoEntity,
      FormularioEntity,
      ...ENTIDADES_MATCHING,
    ]),
  ],
  controllers: [MatchingController],
  providers: [MatchingService, CriterioCatalogoService],
  exports: [MatchingService, CriterioCatalogoService, TypeOrmModule],
})
export class MatchingModule {}
