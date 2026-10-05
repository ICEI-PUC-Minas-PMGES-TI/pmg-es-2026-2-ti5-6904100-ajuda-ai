import { Controller, Get, Param, Query } from '@nestjs/common';
import { FormulariosService } from './formularios.service.js';

/** Leitura pública do formulário publicado (usado no cadastro do aluno). */
@Controller('formularios')
export class FormulariosController {
  constructor(private readonly formulariosService: FormulariosService) {}

  @Get(':tipo')
  obter(@Param('tipo') tipo: string, @Query('programa') programa?: string) {
    return this.formulariosService.obterPublicado(
      FormulariosService.validarTipo(tipo),
      programa,
    );
  }
}
