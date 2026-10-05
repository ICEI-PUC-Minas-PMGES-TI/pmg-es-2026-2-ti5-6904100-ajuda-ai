import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramaEntity } from './entities/programa.entity.js';
import { ProgramasService } from './programas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProgramaEntity])],
  providers: [ProgramasService],
  exports: [ProgramasService],
})
export class ProgramasModule {}
