import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
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
  listar(@Headers('x-user-id') usuarioId?: string) {
    return this.publicacoesService.listar(this.usuarioId(usuarioId));
  }

  @Post()
  criar(
    @Body() corpo: CriarPublicacaoDto,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.criar(corpo, this.usuarioId(usuarioId));
  }

  @Post(':id/comentarios')
  comentar(
    @Param('id') id: string,
    @Body() corpo: CriarComentarioDto,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.comentar(
      Number(id),
      corpo.texto ?? '',
      this.usuarioId(usuarioId),
    );
  }

  @Post(':id/curtidas')
  curtir(
    @Param('id') id: string,
    @Body() corpo: AlterarCurtidaDto,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.curtir(
      Number(id),
      corpo.delta ?? 1,
      this.usuarioId(usuarioId),
    );
  }

  @Delete(':id')
  remover(@Param('id') id: string, @Headers('x-user-id') usuarioId?: string) {
    return this.publicacoesService.remover(
      Number(id),
      this.usuarioId(usuarioId),
    );
  }

  private usuarioId(valor?: string): string {
    return valor?.trim() || 'visitante';
  }
}
