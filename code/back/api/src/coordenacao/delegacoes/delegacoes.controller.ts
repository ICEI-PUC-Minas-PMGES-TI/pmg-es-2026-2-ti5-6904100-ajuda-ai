import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { usuarioDoToken } from '../../gamificacao/gamificacao.js';
import { ConcederDelegacaoDto, ListarAlunosQuery } from './delegacoes.dto.js';
import { ehFuncionalidadeDelegavel } from './delegacoes.js';
import { DelegacoesService } from './delegacoes.service.js';

@Controller('coordenacao/alunos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class DelegacoesController {
  constructor(private readonly delegacoes: DelegacoesService) {}

  @Get()
  listar(@Query() query: ListarAlunosQuery) {
    return this.delegacoes.listar(query.busca);
  }

  @Get(':id')
  detalhe(@Param('id', ParseIntPipe) id: number) {
    return this.delegacoes.detalhe(id);
  }

  @Post(':id/delegacoes')
  conceder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: ConcederDelegacaoDto,
    @Req() requisicao: AuthenticatedRequest,
  ) {
    return this.delegacoes.conceder(
      id,
      dados.funcionalidade,
      requisicao.user.email,
    );
  }

  @Delete(':id/delegacoes/:funcionalidade')
  revogar(
    @Param('id', ParseIntPipe) id: number,
    @Param('funcionalidade') funcionalidade: string,
    @Req() requisicao: AuthenticatedRequest,
  ) {
    if (!ehFuncionalidadeDelegavel(funcionalidade)) {
      throw new NotFoundException('Funcionalidade não encontrada.');
    }
    return this.delegacoes.revogar(id, funcionalidade, requisicao.user.email);
  }
}

@Controller('me/delegacoes')
@UseGuards(JwtAuthGuard)
export class MinhasDelegacoesController {
  constructor(
    private readonly dados: DataSource,
    private readonly delegacoes: DelegacoesService,
  ) {}

  @Get()
  async listar(@Req() requisicao: AuthenticatedRequest) {
    const id = await usuarioDoToken(this.dados, requisicao.user);
    return this.delegacoes.listarAtivas(id);
  }
}
