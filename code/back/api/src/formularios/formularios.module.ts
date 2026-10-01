import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormularioEntity } from './entities/formulario.entity.js';
import { FormulariosController } from './formularios.controller.js';
import { FormulariosService } from './formularios.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FormularioEntity])],
  controllers: [FormulariosController],
  providers: [FormulariosService],
  exports: [FormulariosService],
})
export class FormulariosModule {}
