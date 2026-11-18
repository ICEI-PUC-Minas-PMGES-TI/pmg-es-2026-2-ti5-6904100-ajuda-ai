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
import { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';
import { ListarNotificacoesQuery } from './notificacoes.dto.js';
import { NotificacoesService } from './notificacoes.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@Controller('me/notificacoes')
@UseGuards(JwtAuthGuard)
export class NotificacoesController {
  constructor(
    private readonly notificacoes: NotificacoesService,
    private readonly dataSource: DataSource,
    private readonly permissoes: PermissoesAlunoService,
  ) {}

  @Get()
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() consulta: ListarNotificacoesQuery,
  ) {
    const usuarioId = await usuarioDoToken(this.dataSource, req.user);
    await this.avisarMissoes(req, usuarioId);
    return this.notificacoes.listar(
      usuarioId,
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

  private async avisarMissoes(
    req: AuthenticatedRequest,
    usuarioId: number,
  ): Promise<void> {
    const permissoes = await this.permissoes
      .doUsuario(req.user)
      .catch(() => null);
    if (permissoes?.podeColetarTotens) {
      await this.notificacoes.sincronizarMissoes(
        usuarioId,
        permissoes.programa,
      );
    }
  }
}
