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
import { ResgatarDto } from './lojinha.dto.js';
import { type Aluno, LojinhaService } from './lojinha.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Lojinha do aluno (F28). O cadastro pela coordenação (F27) fica em
 * `/coordenacao/recompensas` (`../recompensas`). Consultar e resgatar exige
 * participar do ciclo atual (DP-07); histórico e comprovantes continuam
 * visíveis para quem já participou.
 */
@Controller('me/lojinha')
@UseGuards(JwtAuthGuard)
export class LojinhaController {
  constructor(
    private readonly lojinha: LojinhaService,
    private readonly db: DataSource,
    private readonly permissoes: PermissoesAlunoService,
  ) {}

  /** Papel vem da participação no ciclo, não do claim `perfil` do JWT. */
  private async aluno(req: AuthenticatedRequest): Promise<Aluno> {
    const { papel } = await this.permissoes.exigir(
      req.user,
      'podeUsarLojinha',
      'A lojinha é só para participantes do apadrinhamento deste semestre.',
    );
    return {
      id: await usuarioDoToken(this.db, req.user),
      email: String(req.user.email ?? '').toLowerCase(),
      perfil: papel ?? 'apadrinhado',
    };
  }

  @Get() async listar(@Req() req: AuthenticatedRequest) {
    return this.lojinha.listar(await this.aluno(req));
  }
  @Get('resgates') async historico(@Req() req: AuthenticatedRequest) {
    return this.lojinha.historico(await usuarioDoToken(this.db, req.user));
  }
  @Get('resgates/:id') async comprovante(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.lojinha.comprovante(
      await usuarioDoToken(this.db, req.user),
      id,
    );
  }
  @Get(':id') async detalhe(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
  ) {
    return this.lojinha.detalhe(await this.aluno(req), id);
  }
  @Post(':id/resgatar') async resgatar(
    @Req() req: AuthenticatedRequest,
    @Param('id', uuid) id: string,
    @Body() dados: ResgatarDto,
  ) {
    return this.lojinha.resgatar(
      await this.aluno(req),
      id,
      dados.chaveIdempotencia,
      { versao: dados.versao, custoXp: dados.custoXp },
    );
  }
}
