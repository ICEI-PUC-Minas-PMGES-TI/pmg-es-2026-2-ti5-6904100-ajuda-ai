import {
  Body,
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
import { ParticipacoesService } from '../participacoes/participacoes.service.js';
import { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';
import { ListarNotificacoesQuery, MarcarTodasDto } from './notificacoes.dto.js';
import { NotificacoesService } from './notificacoes.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@Controller('me/notificacoes')
@UseGuards(JwtAuthGuard)
export class NotificacoesController {
  constructor(
    private readonly notificacoes: NotificacoesService,
    private readonly dataSource: DataSource,
    private readonly permissoes: PermissoesAlunoService,
    private readonly participacoes: ParticipacoesService,
  ) {}

  @Get()
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() consulta: ListarNotificacoesQuery,
  ) {
    const usuarioId = await usuarioDoToken(this.dataSource, req.user);
    // Avisos novos só entram na primeira página.
    if (consulta.antes === undefined) await this.sincronizar(req, usuarioId);
    return this.notificacoes.listar(
      usuarioId,
      consulta.limite === undefined ? undefined : Number(consulta.limite),
      consulta.antes,
    );
  }

  @Patch('lidas')
  async marcarTodas(
    @Req() req: AuthenticatedRequest,
    @Body() dados: MarcarTodasDto,
  ) {
    return this.notificacoes.marcarTodas(
      await usuarioDoToken(this.dataSource, req.user),
      dados?.ateId,
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

  /**
   * Avisos derivados do estado (vínculo confirmado, missões novas) nascem
   * aqui, na leitura do sino. A chave única impede o aviso repetido.
   */
  private async sincronizar(
    req: AuthenticatedRequest,
    usuarioId: number,
  ): Promise<void> {
    const permissoes = await this.permissoes
      .doUsuario(req.user)
      .catch(() => null);
    if (!permissoes?.podeColetarTotens) return;
    if (permissoes.vinculoAtivo && permissoes.papel) {
      const parceiros = await this.parceiros(
        String(req.user.email ?? ''),
        permissoes.programa,
      ).catch(() => []);
      await this.notificacoes.sincronizarVinculo(
        usuarioId,
        permissoes.programa,
        permissoes.papel,
        parceiros,
      );
    }
    await this.notificacoes.sincronizarMissoes(usuarioId, permissoes.programa, {
      podePublicar: permissoes.podePublicar,
      temPar: permissoes.vinculoAtivo,
      papel: permissoes.papel,
    });
  }

  /**
   * Participações da dupla atual: o padrinho do apadrinhado ou os
   * apadrinhados do padrinho. Vínculos do matching e, sem eles, o grupo
   * legado (o mesmo critério de `vinculoAtivo`).
   */
  private async parceiros(email: string, programa: string): Promise<number[]> {
    const registro = await this.participacoes.registroPrincipal(
      email,
      programa,
    );
    if (!registro) return [];
    const vinculados = await this.participacoes.listarVinculados(registro);
    if (vinculados.length > 0) {
      return vinculados.map((v) => v.participacao.id);
    }
    const grupo = registro.grupo?.trim();
    if (!grupo) return [];
    if (registro.papel === 'apadrinhado') {
      const padrinho = await this.participacoes.buscarPadrinhoDoGrupo(
        programa,
        grupo,
      );
      return padrinho ? [padrinho.id] : [];
    }
    return (
      await this.participacoes.listarApadrinhadosDoGrupo(programa, grupo)
    )
      .filter((a) => a.status === 'em_andamento')
      .map((a) => a.id);
  }
}
