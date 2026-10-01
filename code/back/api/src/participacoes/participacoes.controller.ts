import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ParticipacoesService } from './participacoes.service.js';

@Controller('participacoes')
export class ParticipacoesController {
  constructor(private readonly participacoesService: ParticipacoesService) {}

  @Get()
  listar(
    @Headers('x-user-id') headerUsuarioId?: string,
    @Query('usuarioId') queryUsuarioId?: string,
  ) {
    return this.participacoesService.listarPorUsuario(
      this.usuarioId(headerUsuarioId, queryUsuarioId),
    );
  }

  @Post('candidatura-padrinho')
  registrarCandidatura(
    @Body() corpo: { usuarioId?: string; programa?: string },
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    return this.participacoesService.registrarCandidaturaPadrinho({
      usuarioId: this.usuarioId(headerUsuarioId, corpo.usuarioId),
      programa: corpo.programa,
    });
  }

  @Post('confirmar')
  confirmar(
    @Body()
    corpo: {
      usuarioId?: string;
      papel?: 'padrinho' | 'apadrinhado';
      programa?: string;
      grupo?: string;
      apadrinhados?: number;
      inicioEm?: string;
    },
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    return this.participacoesService.confirmarIngresso({
      usuarioId: this.usuarioId(headerUsuarioId, corpo.usuarioId),
      papel: corpo.papel ?? 'padrinho',
      programa: corpo.programa,
      grupo: corpo.grupo,
      apadrinhados: corpo.apadrinhados,
      inicioEm: corpo.inicioEm,
    });
  }

  @Post('rejeitar-candidatura')
  rejeitar(
    @Body() corpo: { usuarioId?: string; programa?: string },
    @Headers('x-user-id') headerUsuarioId?: string,
  ) {
    return this.participacoesService.rejeitarCandidatura({
      usuarioId: this.usuarioId(headerUsuarioId, corpo.usuarioId),
      programa: corpo.programa,
    });
  }

  private usuarioId(header?: string, fallback?: string): string {
    return (header?.trim() || fallback?.trim() || '').toLowerCase();
  }
}
