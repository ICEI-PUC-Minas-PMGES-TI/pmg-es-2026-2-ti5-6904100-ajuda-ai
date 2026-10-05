import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComentarioEntity } from './entities/comentario.entity.js';
import { CurtidaEntity } from './entities/curtida.entity.js';
import { PublicacaoEntity } from './entities/publicacao.entity.js';
import { PublicacoesController } from './publicacoes.controller.js';
import { PublicacoesService } from './publicacoes.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PublicacaoEntity,
      ComentarioEntity,
      CurtidaEntity,
    ]),
  ],
  controllers: [PublicacoesController],
  providers: [PublicacoesService],
})
export class PublicacoesModule {}
