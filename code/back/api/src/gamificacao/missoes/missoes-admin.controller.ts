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
import { usuarioDoTokenOuNulo } from '../gamificacao.js';
import {
  AtualizarMissaoDto,
  CriarMissaoDto,
  LiberarCodigoDto,
  ListarMissoesQuery,
} from './missoes.dto.js';
import { MissoesAdminService } from './missoes-admin.service.js';

const UUID = new ParseUUIDPipe({ version: '4' });

@Controller('coordenacao/missoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class MissoesAdminController {
  constructor(
    private readonly missoes: MissoesAdminService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  listar(@Query() filtros: ListarMissoesQuery) {
    return this.missoes.listar(filtros.status, filtros.ciclo);
  }

  @Get(':id')
  detalhe(@Param('id', UUID) id: string) {
    return this.missoes.detalhe(id);
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarMissaoDto,
  ) {
    return this.missoes.criar(
      dados,
      await usuarioDoTokenOuNulo(this.dataSource, requisicao.user),
    );
  }

  @Patch(':id')
  atualizar(@Param('id', UUID) id: string, @Body() dados: AtualizarMissaoDto) {
    return this.missoes.atualizar(id, dados);
  }

  @Post(':id/ativar')
  @HttpCode(200)
  ativar(@Param('id', UUID) id: string) {
    return this.missoes.definirAtiva(id, true);
  }

  /** Arquiva: sai da lista dos alunos; as conclusões ficam. */
  @Post(':id/desativar')
  @HttpCode(200)
  desativar(@Param('id', UUID) id: string) {
    return this.missoes.definirAtiva(id, false);
  }

  /**
   * Libera o código (CODIGO e EVENTO) por alguns minutos, na hora da
   * atividade. Fora disso, o aluno recebe 422 `codigo-fechado`.
   */
  @Post(':id/codigo')
  @HttpCode(200)
  liberarCodigo(
    @Param('id', UUID) id: string,
    @Body() dados: LiberarCodigoDto,
  ) {
    return this.missoes.liberarCodigo(id, dados.minutos);
  }

  /** Fecha o código antes do tempo. */
  @Delete(':id/codigo')
  @HttpCode(200)
  encerrarCodigo(@Param('id', UUID) id: string) {
    return this.missoes.encerrarCodigo(id);
  }

  /** Só rascunho; missão publicada responde 409 `missao-publicada`. */
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', UUID) id: string): Promise<void> {
    await this.missoes.excluir(id);
  }
}
