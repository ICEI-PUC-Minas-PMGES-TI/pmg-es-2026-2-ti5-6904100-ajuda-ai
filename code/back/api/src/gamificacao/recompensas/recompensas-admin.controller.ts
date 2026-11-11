import {
  Body,
  Controller,
  Delete,
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
  AjustarEstoqueDto,
  AtualizarRecompensaDto,
  CriarRecompensaDto,
  ListarRecompensasQuery,
} from './recompensas-admin.dto.js';
import {
  RecompensasAdminService,
  type Responsavel,
} from './recompensas-admin.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

/**
 * Cadastro de recompensas da lojinha pela coordenação (F27), com os mesmos
 * guards de `/coordenacao`. DELETE só para recompensa sem transações; as
 * usadas vão para `POST :id/arquivar`. Estoque muda só por `POST :id/estoque`.
 */
@Controller('coordenacao/recompensas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class RecompensasAdminController {
  constructor(
    private readonly recompensas: RecompensasAdminService,
    private readonly dataSource: DataSource,
  ) {}

  private async responsavel(
    requisicao: AuthenticatedRequest,
  ): Promise<Responsavel> {
    const email = String(requisicao.user?.email ?? '')
      .trim()
      .toLowerCase();
    return {
      id: await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
      email: email || 'coordenacao',
    };
  }

  @Get()
  listar(@Query() filtros: ListarRecompensasQuery) {
    return this.recompensas.listar(filtros.status);
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.recompensas.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarRecompensaDto,
  ) {
    return this.recompensas.criar(dados, await this.responsavel(requisicao));
  }

  @Patch(':id')
  async atualizar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', UUID) id: string,
    @Body() dados: AtualizarRecompensaDto,
  ) {
    return this.recompensas.atualizar(
      id,
      dados,
      await this.responsavel(requisicao),
    );
  }

  @Post(':id/estoque')
  @HttpCode(200)
  async ajustarEstoque(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', UUID) id: string,
    @Body() dados: AjustarEstoqueDto,
  ) {
    return this.recompensas.ajustarEstoque(
      id,
      dados,
      await this.responsavel(requisicao),
    );
  }

  @Post(':id/publicar')
  @HttpCode(200)
  publicar(@Param('id', UUID) id: string) {
    return this.recompensas.publicar(id);
  }

  @Post(':id/desativar')
  @HttpCode(200)
  desativar(@Param('id', UUID) id: string) {
    return this.recompensas.desativar(id);
  }

  @Post(':id/arquivar')
  @HttpCode(200)
  arquivar(@Param('id', UUID) id: string) {
    return this.recompensas.arquivar(id);
  }

  @Delete(':id')
  excluir(@Param('id', UUID) id: string) {
    return this.recompensas.excluir(id);
  }
}
