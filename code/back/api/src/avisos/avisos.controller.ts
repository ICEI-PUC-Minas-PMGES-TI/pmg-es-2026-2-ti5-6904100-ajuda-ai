import { Controller, Get } from '@nestjs/common';
import { AvisosService } from './avisos.service.js';

@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  @Get()
  listar() {
    return this.avisosService.listar();
  }
}
