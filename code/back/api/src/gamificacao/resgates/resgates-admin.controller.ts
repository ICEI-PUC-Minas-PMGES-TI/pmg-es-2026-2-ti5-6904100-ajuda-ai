import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  CancelarResgateDto,
  ListarResgatesQuery,
} from './resgates-admin.dto.js';
import { ResgatesAdminService } from './resgates-admin.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

/**
 * Resgates da lojinha vistos pela coordenação (F29): lista com filtros,
 * detalhe, entrega e cancelamento justificado (com estorno de XP).
 */
@Controller('coordenacao/resgates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class ResgatesAdminController {
  constructor(
    private readonly resgates: ResgatesAdminService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar(@Query() filtros: ListarResgatesQuery) {
    return this.resgates.listar(filtros);
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.resgates.detalhe(id);
  }

  @Post(':id/entregar')
  @HttpCode(200)
  async entregar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', UUID) id: string,
  ) {
    return this.resgates.entregar(
      id,
      await responsavelDoToken(this.dataSource, requisicao.user),
    );
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  async cancelar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', UUID) id: string,
    @Body() dados: CancelarResgateDto,
  ) {
    return this.resgates.cancelar(
      id,
      dados.motivo,
      await responsavelDoToken(this.dataSource, requisicao.user),
    );
  }
}
