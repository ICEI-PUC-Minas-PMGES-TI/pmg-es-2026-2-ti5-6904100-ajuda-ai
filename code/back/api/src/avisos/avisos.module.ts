import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvisosController } from './avisos.controller.js';
import { AvisosService } from './avisos.service.js';
import { AvisoEntity } from './entities/aviso.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AvisoEntity])],
  controllers: [AvisosController],
  providers: [AvisosService],
  exports: [AvisosService],
})
export class AvisosModule {}
