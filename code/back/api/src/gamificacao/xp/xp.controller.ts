import {
  Controller,
  Get,
  Optional,
  Query,
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
import { MovimentacoesXpQuery } from './xp.dto.js';
import { XpService } from './xp.service.js';

/** Tabela dos 10 níveis (pública: só nomes e limiares). */
@Controller('gamificacao/niveis')
export class NiveisController {
  constructor(private readonly xp: XpService) {}

  @Get()
  listar() {
    return this.xp.niveis();
  }
}

/** XP global do próprio usuário (do JWT; nunca de parâmetro). */
@Controller('me/xp')
@UseGuards(JwtAuthGuard)
export class XpController {
  constructor(
    private readonly xp: XpService,
    private readonly dataSource: DataSource,
    @Optional() private readonly permissoes?: PermissoesAlunoService,
    @Optional() private readonly conquistas?: ConquistasService,
  ) {}

  @Get()
  async resumo(@Req() requisicao: AuthenticatedRequest) {
    const usuarioId = await usuarioDoToken(this.dataSource, requisicao.user);
    // Web e app leem o XP ao abrir Início e Perfil: é quando o nível e o
    // feed (sem gancho próprio) liberam conquistas (F32). Antes do resumo,
    // para o XP de uma conquista já aparecer.
    if (this.permissoes && this.conquistas) {
      const permissoes = await this.permissoes
        .doUsuario(requisicao.user)
        .catch(() => null);
      await this.conquistas.sincronizarComSeguranca(
        usuarioId,
        acessoConquistas(permissoes),
      );
    }
    return this.xp.resumo(usuarioId);
  }

  @Get('movimentacoes')
  async movimentacoes(
    @Req() requisicao: AuthenticatedRequest,
    @Query() consulta: MovimentacoesXpQuery,
  ) {
    // O ValidationPipe global valida a conversão, mas sem `transform` o
    // handler recebe as strings originais da query.
    return this.xp.movimentacoes(
      await usuarioDoToken(this.dataSource, requisicao.user),
      consulta.limite === undefined ? undefined : Number(consulta.limite),
      consulta.antes === undefined ? undefined : Number(consulta.antes),
    );
  }
}
