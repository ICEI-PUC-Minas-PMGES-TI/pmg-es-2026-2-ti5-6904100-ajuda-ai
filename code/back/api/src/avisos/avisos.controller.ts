import { Controller, Get, Query } from '@nestjs/common';
import { AvisosService } from './avisos.service.js';

@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisosService: AvisosService) {}

  /** `publico=padrinhos|apadrinhados` filtra os comunicados direcionados. */
  @Get()
  listar(@Query('publico') publico?: string) {
    return this.avisosService.listar(publico);
  }
}
