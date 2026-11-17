import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { usuarioDoTokenOuNulo } from '../gamificacao.js';
import {
  AtualizarMissaoDto,
  CriarMissaoDto,
  ListarMissoesQuery,
} from './missoes.dto.js';
import { MissoesAdminService } from './missoes-admin.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@Controller('coordenacao/missoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class MissoesAdminController {
  constructor(
    private readonly missoes: MissoesAdminService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar(@Query() filtros: ListarMissoesQuery) {
    return this.missoes.listar(filtros.status, filtros.ciclo);
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.missoes.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarMissaoDto,
  ) {
    return this.missoes.criar(
      dados,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }

  @Patch(':id')
  atualizar(@Param('id', UUID) id: string, @Body() dados: AtualizarMissaoDto) {
    return this.missoes.atualizar(id, dados);
  }

  @Post(':id/ativar')
  @HttpCode(200)
  ativar(@Param('id', UUID) id: string) {
    return this.missoes.definirAtiva(id, true);
  }

  @Post(':id/desativar')
  @HttpCode(200)
  desativar(@Param('id', UUID) id: string) {
    return this.missoes.definirAtiva(id, false);
  }
}
