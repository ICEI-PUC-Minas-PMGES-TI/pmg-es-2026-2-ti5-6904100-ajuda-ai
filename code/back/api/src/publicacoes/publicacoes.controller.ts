import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { PublicacoesService } from './publicacoes.service.js';

interface CriarPublicacaoDto {
  autor?: string;
  iniciais?: string;
  descricaoAutor?: string;
  tempo?: string;
  categoria?: string;
  texto?: string;
  imagens?: string[];
}

interface CriarComentarioDto {
  texto?: string;
}

interface AlterarCurtidaDto {
  delta?: number;
}

@Controller('publicacoes')
export class PublicacoesController {
  constructor(private readonly publicacoesService: PublicacoesService) {}

  @Get()
  listar() {
    return this.publicacoesService.listar();
  }

  @Post()
  criar(@Body() corpo: CriarPublicacaoDto) {
    return this.publicacoesService.criar(corpo);
  }

  @Post(':id/comentarios')
  comentar(@Param('id') id: string, @Body() corpo: CriarComentarioDto) {
    return this.publicacoesService.comentar(Number(id), corpo.texto ?? '');
  }

  @Post(':id/curtidas')
  curtir(@Param('id') id: string, @Body() corpo: AlterarCurtidaDto) {
    return this.publicacoesService.curtir(Number(id), corpo.delta ?? 1);
  }

  @Delete(':id')
  remover(@Param('id') id: string) {
    return this.publicacoesService.remover(Number(id));
  }
}
