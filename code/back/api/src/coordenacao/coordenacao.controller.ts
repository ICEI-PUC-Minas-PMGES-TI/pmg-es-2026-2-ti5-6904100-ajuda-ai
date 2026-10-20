import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CadastroService } from '../cadastro/cadastro.service.js';
import { RejeitarCadastroDto } from '../cadastro/dto/rejeitar-cadastro.dto.js';
import { CoordenacaoService } from './coordenacao.service.js';

@Controller('coordenacao')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class CoordenacaoController {
  constructor(
    private readonly coordenacaoService: CoordenacaoService,
    private readonly cadastroService: CadastroService,
  ) {}

  @Get('dashboard')
  dashboard(@Query('programa') programa?: string) {
    return this.coordenacaoService.obterDashboard(programa);
  }

  @Get('candidaturas')
  candidaturas(
    @Query('programa') programa?: string,
    @Query('status') status?: string,
  ) {
    const ciclo = programa?.trim();
    if (!ciclo) {
      return this.coordenacaoService.obterDashboard().then((dash) => {
        if (!dash.programa) return [];
        return this.coordenacaoService.listarCandidaturas(
          dash.programa.codigo,
          status,
        );
      });
    }
    return this.coordenacaoService.listarCandidaturas(ciclo, status);
  }

  @Post('candidaturas/acoes')
  acaoEmMassa(
    @Req() requisicao: AuthenticatedRequest,
    @Body() corpo: { ids?: unknown; acao?: string; justificativa?: string },
  ) {
    return this.coordenacaoService.acaoEmMassa(corpo, requisicao.user.email);
  }

  @Get('candidaturas/:id')
  detalhe(@Param('id', ParseIntPipe) id: number) {
    return this.coordenacaoService.detalharCandidatura(id);
  }

  @Patch('candidaturas/:id')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: { status?: string; observacoes?: string | null },
  ) {
    return this.coordenacaoService.atualizarCandidatura(id, corpo);
  }

  @Post('candidaturas/:id/aprovar')
  aprovar(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coordenacaoService.aprovarCandidatura(
      id,
      requisicao.user.email,
    );
  }

  @Post('candidaturas/:id/rejeitar')
  rejeitar(
    @Body() corpo: { justificativa?: string },
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coordenacaoService.rejeitarCandidatura(
      id,
      requisicao.user.email,
      corpo.justificativa,
    );
  }

  /* ===== Solicitações de cadastro (padrinhos e apadrinhados) ===== */

  /** `status=pendente|aprovado|rejeitado`; sem status, todos. */
  @Get('cadastros')
  cadastros(
    @Query('status') status?: string,
    @Query('programa') programa?: string,
  ) {
    return this.cadastroService.listar(status, programa);
  }

  @Get('cadastros/:id')
  cadastro(
    @Param('id', ParseIntPipe) id: number,
    @Query('programa') programa?: string,
  ) {
    return this.cadastroService.detalhar(id, programa);
  }

  @Post('cadastros/:id/aprovar')
  aprovarCadastro(
    @Query('programa') programa: string | undefined,
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cadastroService.aprovar(id, requisicao.user.email, programa);
  }

  @Post('cadastros/:id/rejeitar')
  rejeitarCadastro(
    @Query('programa') programa: string | undefined,
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: RejeitarCadastroDto,
  ) {
    return this.cadastroService.rejeitar(
      id,
      corpo.motivo,
      requisicao.user.email,
      programa,
    );
  }

  @Get('usuarios')
  usuarios(
    @Query('programa') programa?: string,
    @Query('papel') papel?: string,
  ) {
    return this.coordenacaoService.listarUsuarios(programa, papel);
  }

  @Post('vinculos')
  vincular(@Body() corpo: { apadrinhadoId?: unknown; padrinhoId?: unknown }) {
    return this.coordenacaoService.vincular(corpo);
  }

  @Get('programas')
  programas() {
    return this.coordenacaoService.listarProgramas();
  }

  @Post('programas')
  criarPrograma(@Body() corpo: { codigo?: string } & Record<string, unknown>) {
    return this.coordenacaoService.criarNovoCiclo(corpo.codigo, corpo);
  }

  /** O código contém barra; segue o padrão PATCH com ?codigo=AAAA/semestre. */
  @Delete('programas')
  excluirPrograma(
    @Query('codigo') codigo: string,
    @Body() corpo: { confirmacao?: unknown },
  ) {
    return this.coordenacaoService.excluirPrograma(codigo, corpo?.confirmacao);
  }

  /** O código tem barra (2026/2), então vem em query: ?codigo=2026/2 */
  @Patch('programas')
  atualizarPrograma(
    @Query('codigo') codigo: string,
    @Body() corpo: Record<string, unknown>,
  ) {
    return this.coordenacaoService.atualizarPrograma(codigo ?? '', corpo);
  }

  @Get('formularios/:tipo')
  formulario(
    @Param('tipo') tipo: string,
    @Query('programa') programa?: string,
  ) {
    return this.coordenacaoService.obterFormulario(tipo, programa);
  }

  @Put('formularios/:tipo')
  salvarFormulario(
    @Param('tipo') tipo: string,
    @Body()
    corpo: { programa?: string; publicado?: boolean; perguntas?: unknown },
  ) {
    return this.coordenacaoService.salvarFormulario(tipo, corpo);
  }

  @Post('comunicados')
  comunicado(
    @Body()
    corpo: {
      titulo?: string;
      descricao?: string;
      publico?: string;
      programa?: string;
    },
  ) {
    return this.coordenacaoService.criarComunicado(corpo);
  }
}
