import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { usuarioDoToken } from '../gamificacao.js';
import { ColetarPucStopDto } from './pucstops.dto.js';
import { PucStopsService } from './pucstops.service.js';

/**
 * PucStops do campus. Leitura pública (como o resto de `/mapa`); a coleta
 * exige JWT e o usuário vem do token, nunca do corpo.
 */
@Controller('mapa/pucstops')
export class PucStopsController {
  constructor(
    private readonly pucstops: PucStopsService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar() {
    return this.pucstops.listar();
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.pucstops.detalhe(id);
  }

  /** POST porque a coordenada vai no corpo (fora de URL e de log de acesso). */
  @Post(':id/claim')
  @UseGuards(JwtAuthGuard)
  async coletar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() leitura: ColetarPucStopDto,
  ) {
    return this.pucstops.coletar(
      await usuarioDoToken(this.dataSource, requisicao.user),
      id,
      leitura,
    );
  }
}

/** PucStops que o próprio usuário já coletou (estado "coletado" no app). */
@Controller('me/pucstops')
@UseGuards(JwtAuthGuard)
export class MinhasColetasController {
  constructor(
    private readonly pucstops: PucStopsService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async listar(@Req() requisicao: AuthenticatedRequest) {
    return this.pucstops.minhasColetas(
      await usuarioDoToken(this.dataSource, requisicao.user),
    );
  }
}
