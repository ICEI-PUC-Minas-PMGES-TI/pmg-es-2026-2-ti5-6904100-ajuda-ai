import {
  Body,
  Controller,
  Get,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { PermissoesAlunoService } from '../../participacoes/permissoes-aluno.service.js';
import { acessoConquistas } from '../conquistas/conquistas.controller.js';
import { ConquistasService } from '../conquistas/conquistas.service.js';
import { usuarioDoToken } from '../gamificacao.js';
import { ColetarPucStopDto } from './pucstops.dto.js';
import { PucStopsService } from './pucstops.service.js';

/**
 * PucStops do campus. Leitura pública (como o resto de `/mapa`); a coleta
 * exige JWT e o usuário vem do token, nunca do corpo.
 */
@Controller('mapa/pucstops')
export class PucStopsController {
  constructor(
    private readonly pucstops: PucStopsService,
    private readonly dataSource: DataSource,
    private readonly permissoes: PermissoesAlunoService,
    @Optional() private readonly conquistas?: ConquistasService,
  ) {}

  @Get()
  listar() {
    return this.pucstops.listar();
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.pucstops.detalhe(id);
  }

  /** POST porque a coordenada vai no corpo (fora de URL e de log de acesso). */
  @Post(':id/claim')
  @UseGuards(JwtAuthGuard)
  async coletar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() leitura: ColetarPucStopDto,
  ) {
    // Só participantes do ciclo ganham XP (DP-07), inclusive aprovados sem par (DP-22).
    const permissoes = await this.permissoes.exigir(
      requisicao.user,
      'podeColetarTotens',
      'Os totens dão XP só para participantes do apadrinhamento deste semestre.',
    );
    const usuarioId = await usuarioDoToken(this.dataSource, requisicao.user);
    const resultado = await this.pucstops.coletar(usuarioId, id, leitura);
    // Depois do commit da coleta: conquistas de totens coletados (F32).
    await this.conquistas?.sincronizarComSeguranca(
      usuarioId,
      acessoConquistas(permissoes),
    );
    return resultado;
  }
}

/** PucStops que o próprio usuário já coletou (estado "coletado" no app). */
@Controller('me/pucstops')
@UseGuards(JwtAuthGuard)
export class MinhasColetasController {
  constructor(
    private readonly pucstops: PucStopsService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async listar(@Req() requisicao: AuthenticatedRequest) {
    return this.pucstops.minhasColetas(
      await usuarioDoToken(this.dataSource, requisicao.user),
    );
  }
}
