import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Roles } from '../../auth/roles.decorator.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { usuarioDoTokenOuNulo } from '../gamificacao.js';
import { AtualizarPucStopDto, CriarPucStopDto } from './pucstops-admin.dto.js';
import { PucStopsAdminService } from './pucstops-admin.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

/**
 * Administração dos PucStops pela coordenação (mesmos guards de
 * `/coordenacao`). Nada de DELETE: "excluir" é `POST :id/desativar`, que
 * preserva coletas e ledger. A leitura pública continua em `/mapa/pucstops`.
 */
@Controller('coordenacao/pucstops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class PucStopsAdminController {
  constructor(
    private readonly pucstops: PucStopsAdminService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar() {
    return this.pucstops.listar();
  }

  /** Antes de `:id`: região onde um PucStop pode ser criado. */
  @Get('campus')
  campus() {
    return this.pucstops.campus();
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.pucstops.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarPucStopDto,
  ) {
    return this.pucstops.criar(
      dados,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }

  @Patch(':id')
  atualizar(@Param('id', UUID) id: string, @Body() dados: AtualizarPucStopDto) {
    return this.pucstops.atualizar(id, dados);
  }

  @Post(':id/desativar')
  @HttpCode(200)
  desativar(@Param('id', UUID) id: string) {
    return this.pucstops.definirAtivo(id, false);
  }

  @Post(':id/ativar')
  @HttpCode(200)
  ativar(@Param('id', UUID) id: string) {
    return this.pucstops.definirAtivo(id, true);
  }
}
