import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { ComentarioEntity } from './entities/comentario.entity.js';
import { CurtidaEntity } from './entities/curtida.entity.js';
import { CurtidaComentarioEntity } from './entities/curtida-comentario.entity.js';
import { PublicacaoEntity } from './entities/publicacao.entity.js';
import { PublicacoesController } from './publicacoes.controller.js';
import { PublicacoesService } from './publicacoes.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { ConfigModule } from '@nestjs/config';
import { FeedAdminGuard, FeedPolicy, FeedPublishGuard } from './feed-policy.js';
import { FeedMidiasService } from './feed-midias.service.js';
import { FeedStreamService } from './feed-stream.service.js';
import { FeedRabbitService } from './feed-rabbit.service.js';
import { FeedOutboxService } from './feed-outbox.service.js';
import { FeedOutboxEntity } from './entities/feed-outbox.entity.js';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      PublicacaoEntity,
      ComentarioEntity,
      CurtidaEntity,
      CurtidaComentarioEntity,
      FeedOutboxEntity,
    ]),
  ],
  controllers: [PublicacoesController],
  providers: [
    PublicacoesService,
    FeedPolicy,
    FeedPublishGuard,
    FeedAdminGuard,
    FeedMidiasService,
    FeedStreamService,
    FeedRabbitService,
    FeedOutboxService,
  ],
})
export class PublicacoesModule {}
