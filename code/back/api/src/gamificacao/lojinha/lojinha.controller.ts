import {
  Body,
  Controller,
  Get,
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
import { usuarioDoToken } from '../gamificacao.js';
import {
  CriarRecompensaDto,
  PublicarRecompensaDto,
  ResgatarDto,
} from './lojinha.dto.js';
import { LojinhaService } from './lojinha.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@Controller('coordenacao/recompensas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class RecompensasAdminController {
  constructor(private readonly lojinha: LojinhaService) {}

  @Get() listar() {
    return this.lojinha.listar(false);
  }
  @Post() criar(@Body() dados: CriarRecompensaDto) {
    return this.lojinha.criar(dados);
  }
  @Patch(':id/publicacao')
  publicar(
    @Param('id', uuid) id: string,
    @Body() dados: PublicarRecompensaDto,
  ) {
    return this.lojinha.publicar(id, dados.publicada);
  }
}

@Controller('me/lojinha')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('padrinho', 'apadrinhado')
export class LojinhaController {
  constructor(
    private readonly lojinha: LojinhaService,
    private readonly db: DataSource,
  ) {}

  @Get() async listar(@Req() req: AuthenticatedRequest) {
    await usuarioDoToken(this.db, req.user);
    return this.lojinha.listar();
  }
  @Get('resgates') async historico(@Req() req: AuthenticatedRequest) {
    return this.lojinha.historico(await usuarioDoToken(this.db, req.user));
  }
  @Post(':id/resgatar') async resgatar(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() dados: ResgatarDto,
  ) {
    return this.lojinha.resgatar(
      await usuarioDoToken(this.db, req.user),
      id,
      dados.chaveIdempotencia,
    );
  }
}
