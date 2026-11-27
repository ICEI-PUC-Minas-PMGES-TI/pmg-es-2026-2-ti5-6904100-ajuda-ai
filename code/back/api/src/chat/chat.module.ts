import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { MatchingGrupoEntity } from '../matching/entities/grupo.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  ChatEntity,
  ChatOutboxEntity,
  ChatParticipanteEntity,
  MensagemChatEntity,
  ChatPeriodoEntity,
  ChatDestinatarioEntity,
} from './entities/chat.entity.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatCacheService } from './chat-cache.service.js';
import { ChatOutboxService } from './chat-outbox.service.js';
import { ChatRabbitService } from './chat-rabbit.service.js';
import { ChatStreamService } from './chat-stream.service.js';

export const ENTIDADES_CHAT = [
  ChatEntity,
  ChatOutboxEntity,
  ChatParticipanteEntity,
  MensagemChatEntity,
  ChatPeriodoEntity,
  ChatDestinatarioEntity,
] as const;

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    StorageModule,
    TypeOrmModule.forFeature([
      ...ENTIDADES_CHAT,
      MatchingVinculoEntity,
      MatchingGrupoEntity,
      ParticipacaoEntity,
      ProgramaEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatCacheService,
    ChatStreamService,
    ChatRabbitService,
    ChatOutboxService,
  ],
  exports: [ChatService, ChatStreamService, TypeOrmModule],
})
export class ChatModule {}
