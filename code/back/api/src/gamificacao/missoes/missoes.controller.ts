import {
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

  private async participante(req: AuthenticatedRequest): Promise<number> {
    await this.permissoes.exigir(
      req.user,
      'podeColetarTotens',
      'As missões são só para participantes do apadrinhamento deste semestre.',
    );
    return usuarioDoToken(this.dataSource, req.user);
  }

  @Get()
  async listar(@Req() req: AuthenticatedRequest) {
    return this.missoes.listar(await this.participante(req));
  }

  @Post(':id/concluir')
  async concluir(
    @Req() req: AuthenticatedRequest,
    @Param('id', UUID) id: string,
  ) {
    return this.missoes.concluir(await this.participante(req), id);
  }
}
