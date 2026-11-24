import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Roles } from '../../auth/roles.decorator.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { responsavelDoToken } from '../gamificacao.js';
import {
  AjustarXpDto,
  ExtratoXpQuery,
  ListarXpQuery,
  type ResultadoAjusteXpDto,
} from './xp-admin.dto.js';
import { XpAdminService } from './xp-admin.service.js';

/** XP dos participantes pela coordenação (F26): consulta e ajustes. */
@Controller('coordenacao/xp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class XpAdminController {
  constructor(
    private readonly xp: XpAdminService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar(@Query() filtros: ListarXpQuery) {
    return this.xp.listar(filtros.busca);
  }

  @Get(':usuarioId')
  extrato(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query() consulta: ExtratoXpQuery,
  ) {
    return this.xp.extrato(
      usuarioId,
      consulta.limite === undefined ? undefined : Number(consulta.limite),
      consulta.antes === undefined ? undefined : Number(consulta.antes),
    );
  }

  @Post(':usuarioId/ajustes')
  async ajustar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body() dados: AjustarXpDto,
  ): Promise<ResultadoAjusteXpDto> {
    return this.xp.ajustar(
      usuarioId,
      dados,
      await responsavelDoToken(this.dataSource, requisicao.user),
    );
  }
}
