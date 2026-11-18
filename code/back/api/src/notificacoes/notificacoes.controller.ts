import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { usuarioDoToken } from '../gamificacao/gamificacao.js';
import { ListarNotificacoesQuery } from './notificacoes.dto.js';
import { NotificacoesService } from './notificacoes.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@Controller('me/notificacoes')
@UseGuards(JwtAuthGuard)
export class NotificacoesController {
  constructor(
    private readonly notificacoes: NotificacoesService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() consulta: ListarNotificacoesQuery,
  ) {
    return this.notificacoes.listar(
      await usuarioDoToken(this.dataSource, req.user),
      consulta.limite === undefined ? undefined : Number(consulta.limite),
    );
  }

  @Patch('lidas')
  async marcarTodas(@Req() req: AuthenticatedRequest) {
    return this.notificacoes.marcarTodas(
      await usuarioDoToken(this.dataSource, req.user),
    );
  }

  @Patch(':id/lida')
  async marcarLida(
    @Req() req: AuthenticatedRequest,
    @Param('id', UUID) id: string,
  ) {
    return this.notificacoes.marcarLida(
      await usuarioDoToken(this.dataSource, req.user),
      id,
    );
  }
}
