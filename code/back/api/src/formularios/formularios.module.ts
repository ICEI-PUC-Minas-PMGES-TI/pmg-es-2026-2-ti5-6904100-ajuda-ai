import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramasModule } from '../programas/programas.module.js';
import { FormularioEntity } from './entities/formulario.entity.js';
import { FormulariosController } from './formularios.controller.js';
import { FormulariosService } from './formularios.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FormularioEntity]), ProgramasModule],
  controllers: [FormulariosController],
  providers: [FormulariosService],
  exports: [FormulariosService],
})
export class FormulariosModule {}
