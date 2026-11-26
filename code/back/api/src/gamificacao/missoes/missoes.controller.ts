import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { PermissoesAlunoService } from '../../participacoes/permissoes-aluno.service.js';
import { usuarioDoToken } from '../gamificacao.js';
import { ConcluirMissaoDto } from './missoes.dto.js';
import type { AcessoMissoes } from './missoes.js';
import { MissoesService } from './missoes.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@Controller('me/missoes')
@UseGuards(JwtAuthGuard)
export class MissoesController {
  constructor(
    private readonly missoes: MissoesService,
    private readonly dataSource: DataSource,
    private readonly permissoes: PermissoesAlunoService,
  ) {}

  private async participante(
    req: AuthenticatedRequest,
  ): Promise<{ usuarioId: number; acesso: AcessoMissoes }> {
    const permissoes = await this.permissoes.exigir(
      req.user,
      'podeColetarTotens',
      'As missões são só para participantes do apadrinhamento deste semestre.',
    );
    return {
      usuarioId: await usuarioDoToken(this.dataSource, req.user),
      acesso: {
        podePublicar: permissoes.podePublicar,
        temPar: permissoes.vinculoAtivo,
        papel: permissoes.papel,
      },
    };
  }

  @Get()
  async listar(@Req() req: AuthenticatedRequest) {
    const { usuarioId, acesso } = await this.participante(req);
    return this.missoes.listar(usuarioId, new Date(), acesso);
  }

  @Post(':id/concluir')
  async concluir(
    @Req() req: AuthenticatedRequest,
    @Param('id', UUID) id: string,
    @Body() leitura: ConcluirMissaoDto,
  ) {
    const { usuarioId, acesso } = await this.participante(req);
    return this.missoes.concluir(usuarioId, id, new Date(), leitura, acesso);
  }
}
