import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { CelebracaoIndisponivelError } from '../celebracoes.js';
import { usuarioDoToken } from '../gamificacao.js';
import { ConfirmarCelebracaoDto, MovimentacoesXpQuery } from './xp.dto.js';
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
  ) {}

  @Get()
  async resumo(@Req() requisicao: AuthenticatedRequest) {
    return this.xp.resumo(
      await usuarioDoToken(this.dataSource, requisicao.user),
    );
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

  /**
   * Confirma que a animação de conquista do nível foi exibida (não volta a
   * aparecer em nenhum aparelho). Só avança, limitado ao nível real.
   */
  @Post('celebracoes')
  @HttpCode(200)
  async confirmarCelebracao(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: ConfirmarCelebracaoDto,
  ) {
    const usuarioId = await usuarioDoToken(this.dataSource, requisicao.user);
    try {
      return await this.xp.confirmarCelebracao(usuarioId, Number(corpo.nivel));
    } catch (erro) {
      if (erro instanceof CelebracaoIndisponivelError)
        throw new ServiceUnavailableException(erro.message);
      throw erro;
    }
  }
}
