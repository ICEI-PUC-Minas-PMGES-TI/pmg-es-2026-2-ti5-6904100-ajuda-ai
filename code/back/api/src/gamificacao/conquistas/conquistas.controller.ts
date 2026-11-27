import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Roles } from '../../auth/roles.decorator.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import type { PermissoesAluno } from '../../participacoes/permissoes-aluno.service.js';
import { PermissoesAlunoService } from '../../participacoes/permissoes-aluno.service.js';
import { usuarioDoToken, usuarioDoTokenOuNulo } from '../gamificacao.js';
import { ConquistasAdminService } from './conquistas-admin.service.js';
import {
  AtualizarConquistaDto,
  CriarConquistaDto,
  ListarConquistasQuery,
} from './conquistas.dto.js';
import {
  type AcessoConquistas,
  ConquistasService,
} from './conquistas.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

/** Acesso do aluno às conquistas a partir das permissões do ciclo. */
export function acessoConquistas(
  permissoes: Pick<PermissoesAluno, 'podeColetarTotens' | 'papel' | 'podePublicar'> | null,
): AcessoConquistas {
  return {
    participante: permissoes?.podeColetarTotens === true,
    papel: permissoes?.papel ?? null,
    podePublicar: permissoes?.podePublicar === true,
  };
}

/** Cadastro de conquistas (F32). Perfil coordenador; aluno recebe 403. */
@Controller('coordenacao/conquistas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class ConquistasAdminController {
  constructor(
    private readonly conquistas: ConquistasAdminService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar(@Query() filtros: ListarConquistasQuery) {
    return this.conquistas.listar(filtros.estado);
  }

  /** Condições suportadas (critério, faixa da meta, escopo). */
  @Get('criterios')
  criterios() {
    return this.conquistas.criterios();
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.conquistas.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarConquistaDto,
  ) {
    return this.conquistas.criar(
      dados,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }

  @Patch(':id')
  atualizar(
    @Param('id', UUID) id: string,
    @Body() dados: AtualizarConquistaDto,
  ) {
    return this.conquistas.atualizar(id, dados);
  }

  @Post(':id/publicar')
  @HttpCode(200)
  publicar(@Param('id', UUID) id: string) {
    return this.conquistas.publicar(id);
  }

  @Post(':id/arquivar')
  @HttpCode(200)
  arquivar(@Param('id', UUID) id: string) {
    return this.conquistas.arquivar(id);
  }

  /** Só sem uso; com desbloqueios responde 409 `conquista-em-uso`. */
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', UUID) id: string): Promise<void> {
    await this.conquistas.excluir(id);
  }
}

/**
 * Coleção do aluno: as obtidas (sempre, mesmo de ciclos passados) e, para
 * quem participa do ciclo, as disponíveis com o critério e o progresso.
 * Consultar já confere e desbloqueia o que tiver a meta cumprida.
 */
@Controller('me/conquistas')
@UseGuards(JwtAuthGuard)
export class ConquistasController {
  constructor(
    private readonly conquistas: ConquistasService,
    private readonly dataSource: DataSource,
    private readonly permissoes: PermissoesAlunoService,
  ) {}

  @Get()
  async listar(@Req() req: AuthenticatedRequest) {
    const usuarioId = await usuarioDoToken(this.dataSource, req.user);
    const permissoes = await this.permissoes
      .doUsuario(req.user)
      .catch(() => null);
    return this.conquistas.listar(usuarioId, acessoConquistas(permissoes));
  }
}
