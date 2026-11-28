import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { usuarioDoToken } from '../gamificacao/gamificacao.js';
import { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';
import { EncontrosPresencaService } from './encontros-presenca.service.js';
import {
  ConfirmarPresencaDto,
  CriarEncontroDto,
  EditarEncontroDto,
  ListarEncontrosQuery,
  ResponderConviteDto,
} from './encontros.dto.js';
import { EncontrosService } from './encontros.service.js';

const SO_PARTICIPANTES =
  'Os encontros são só para participantes do apadrinhamento deste semestre.';

@Controller('me/encontros')
@UseGuards(JwtAuthGuard)
export class EncontrosController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly encontros: EncontrosService,
    private readonly presencas: EncontrosPresencaService,
    private readonly permissoes: PermissoesAlunoService,
  ) {}

  private async padrinho(requisicao: AuthenticatedRequest): Promise<number> {
    const permissoes = await this.permissoes.exigir(
      requisicao.user,
      'podeColetarTotens',
      SO_PARTICIPANTES,
    );
    if (permissoes.papel !== 'padrinho') {
      throw new ForbiddenException('Só o padrinho marca encontros.');
    }
    return usuarioDoToken(this.dataSource, requisicao.user);
  }

  @Get()
  async listar(
    @Req() requisicao: AuthenticatedRequest,
    @Query() query: ListarEncontrosQuery,
  ) {
    return this.encontros.listar(
      await usuarioDoToken(this.dataSource, requisicao.user),
      query.quando,
    );
  }

  @Get('apadrinhados')
  async apadrinhados(@Req() requisicao: AuthenticatedRequest) {
    return this.encontros.apadrinhadosVinculados(
      await this.padrinho(requisicao),
    );
  }

  @Get(':id')
  async detalhe(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.encontros.detalhe(
      await usuarioDoToken(this.dataSource, requisicao.user),
      id,
    );
  }

  @Post()
  async criar(
    @Req() requisicao: AuthenticatedRequest,
    @Body() dados: CriarEncontroDto,
  ) {
    return this.encontros.criar(await this.padrinho(requisicao), dados);
  }

  @Patch(':id')
  async editar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dados: EditarEncontroDto,
  ) {
    return this.encontros.editar(
      await usuarioDoToken(this.dataSource, requisicao.user),
      id,
      dados,
    );
  }

  @Post(':id/cancelar')
  @HttpCode(200)
  async cancelar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.encontros.cancelar(
      await usuarioDoToken(this.dataSource, requisicao.user),
      id,
      requisicao.user.email,
    );
  }

  @Post(':id/responder')
  @HttpCode(200)
  async responder(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dados: ResponderConviteDto,
  ) {
    return this.encontros.responder(
      await usuarioDoToken(this.dataSource, requisicao.user),
      id,
      dados,
    );
  }

  @Post(':id/presenca')
  @HttpCode(200)
  async confirmarPresenca(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() leitura: ConfirmarPresencaDto,
  ) {
    return this.presencas.confirmar(
      await usuarioDoToken(this.dataSource, requisicao.user),
      id,
      leitura ?? {},
    );
  }
}
