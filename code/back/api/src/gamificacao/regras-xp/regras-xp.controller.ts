import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Roles } from '../../auth/roles.decorator.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import {
  AtualizarRegraXpDto,
  CriarRegraXpDto,
  StatusRegraXpDto,
} from './regras-xp.dto.js';
import { RegrasXpService } from './regras-xp.service.js';

@Controller('coordenacao/regras-xp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class RegrasXpController {
  constructor(private readonly regrasXp: RegrasXpService) {}

  @Get()
  listar() {
    return this.regrasXp.listar();
  }

  @Get(':id')
  detalhe(@Param('id', ParseIntPipe) id: number) {
    return this.regrasXp.detalhe(id);
  }

  @Post()
  criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarRegraXpDto,
  ) {
    return this.regrasXp.criar(dados, requisicao.user.email);
  }

  @Patch(':id')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: AtualizarRegraXpDto,
  ) {
    return this.regrasXp.atualizar(id, dados, requisicao.user.email);
  }

  @Patch(':id/status')
  definirAtivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: StatusRegraXpDto,
  ) {
    return this.regrasXp.definirAtivo(id, dados.ativo);
  }
}
