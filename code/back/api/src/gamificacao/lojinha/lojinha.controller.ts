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
import { Roles } from '../../auth/roles.decorator.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { usuarioDoToken } from '../gamificacao.js';
import { ResgatarDto } from './lojinha.dto.js';
import { type Aluno, LojinhaService } from './lojinha.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Lojinha do aluno (F28). O cadastro pela coordenação (F27) fica em
 * `/coordenacao/recompensas` (`../recompensas`).
 */
@Controller('me/lojinha')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('padrinho', 'apadrinhado')
export class LojinhaController {
  constructor(
    private readonly lojinha: LojinhaService,
    private readonly db: DataSource,
  ) {}

  private async aluno(req: AuthenticatedRequest): Promise<Aluno> {
    return {
      id: await usuarioDoToken(this.db, req.user),
      email: String(req.user.email ?? '').toLowerCase(),
      perfil: req.user.perfil === 'padrinho' ? 'padrinho' : 'apadrinhado',
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
