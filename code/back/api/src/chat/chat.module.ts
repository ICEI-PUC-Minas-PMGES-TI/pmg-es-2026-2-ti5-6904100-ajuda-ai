import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  ChatEntity,
  ChatParticipanteEntity,
  MensagemChatEntity,
} from './entities/chat.entity.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

export const ENTIDADES_CHAT = [
  ChatEntity,
  ChatParticipanteEntity,
  MensagemChatEntity,
] as const;

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      ...ENTIDADES_CHAT,
      MatchingVinculoEntity,
      ParticipacaoEntity,
      ProgramaEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService, TypeOrmModule],
})
export class ChatModule {}
