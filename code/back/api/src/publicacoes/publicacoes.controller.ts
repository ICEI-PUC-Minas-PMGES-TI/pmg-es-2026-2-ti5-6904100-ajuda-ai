import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtOpcionalGuard } from '../auth/jwt-opcional.guard.js';
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

/**
 * Com token, a identidade vem dele (e-mail) e `x-user-id` é ignorado; sem
 * token, vale o modo antigo do app (`x-user-id`). Dívida técnica: exigir token.
 */
@Controller('publicacoes')
@UseGuards(JwtOpcionalGuard)
export class PublicacoesController {
  constructor(private readonly publicacoesService: PublicacoesService) {}

  @Get()
  listar(
    @Req() requisicao: AuthenticatedRequest,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.listar(
      this.usuarioId(requisicao, usuarioId),
    );
  }

  @Post()
  criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: CriarPublicacaoDto,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.criar(
      corpo,
      this.usuarioId(requisicao, usuarioId),
    );
  }

  @Post(':id/comentarios')
  comentar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() corpo: CriarComentarioDto,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.comentar(
      Number(id),
      corpo.texto ?? '',
      this.usuarioId(requisicao, usuarioId),
    );
  }

  @Post(':id/curtidas')
  curtir(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() corpo: AlterarCurtidaDto,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.curtir(
      Number(id),
      corpo.delta ?? 1,
      this.usuarioId(requisicao, usuarioId),
    );
  }

  @Delete(':id')
  remover(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Headers('x-user-id') usuarioId?: string,
  ) {
    return this.publicacoesService.remover(
      Number(id),
      this.usuarioId(requisicao, usuarioId),
    );
  }

  /** Token prevalece; `x-user-id` só sem token (modo antigo). */
  private usuarioId(requisicao: AuthenticatedRequest, valor?: string): string {
    return requisicao.user?.email || valor?.trim() || 'visitante';
  }
}
