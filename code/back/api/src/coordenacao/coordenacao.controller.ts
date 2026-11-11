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
import type { EntradaVerificacao } from '../participacoes/verificacao-academica.js';
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

  /** Filtros: programa, papel (candidato|apadrinhado), status e conferencia. */
  @Get('candidaturas')
  candidaturas(
    @Query('programa') programa?: string,
    @Query('status') status?: string,
    @Query('papel') papel?: string,
    @Query('conferencia') conferencia?: string,
  ) {
    const ciclo = programa?.trim();
    if (!ciclo) {
      return this.coordenacaoService.obterDashboard().then((dash) => {
        if (!dash.programa) return [];
        return this.coordenacaoService.listarCandidaturas(
          dash.programa.codigo,
          status,
          papel,
          conferencia,
        );
      });
    }
    return this.coordenacaoService.listarCandidaturas(
      ciclo,
      status,
      papel,
      conferencia,
    );
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

  /** Conferência acadêmica: `{ itens: [{ id, atende }], observacoes? }`. */
  @Put('candidaturas/:id/verificacao')
  registrarVerificacao(
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: EntradaVerificacao,
  ) {
    return this.coordenacaoService.registrarVerificacao(
      id,
      corpo,
      requisicao.user.email,
    );
  }

  @Post('candidaturas/:id/vinculos/:vinculoId/encerrar')
  encerrarVinculo(
    @Param('id', ParseIntPipe) id: number,
    @Param('vinculoId', ParseIntPipe) vinculoId: number,
  ) {
    return this.coordenacaoService.encerrarVinculo(id, vinculoId);
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

  @Post('candidaturas/:id/desvincular')
  desvincular(@Param('id', ParseIntPipe) id: number) {
    return this.coordenacaoService.desvincularCandidatura(id);
  }

  @Post('candidaturas/:id/revogar')
  revogar(
    @Body() corpo: { justificativa?: string },
    @Req() requisicao: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.coordenacaoService.revogarAprovacao(
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
  vincular(
    @Body() corpo: { apadrinhadoId?: unknown; padrinhoId?: unknown },
    @Req() requisicao: AuthenticatedRequest,
  ) {
    return this.coordenacaoService.vincular(corpo, requisicao.user.email);
  }

  @Get('programas')
  programas() {
    return this.coordenacaoService.listarProgramas();
  }

  @Get('programas/item')
  programa(@Query('codigo') codigo: string) {
    return this.coordenacaoService.obterPrograma(codigo ?? '');
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

  @Post('programas/encerrar-inscricoes')
  encerrarInscricoes(@Query('codigo') codigo: string) {
    return this.coordenacaoService.encerrarInscricoes(codigo);
  }

  @Post('programas/liberar-matching')
  liberarMatching(@Query('codigo') codigo: string) {
    return this.coordenacaoService.liberarMatching(codigo);
  }

  @Get('formularios')
  formularios(@Query('programa') programa?: string) {
    return this.coordenacaoService.listarFormularios(programa);
  }

  @Delete('formularios/:tipo')
  excluirFormulario(
    @Param('tipo') tipo: string,
    @Query('programa') programa?: string,
  ) {
    return this.coordenacaoService.excluirFormulario(tipo, programa);
  }

  @Post('formularios/:tipo/encerrar')
  encerrarFormulario(
    @Param('tipo') tipo: string,
    @Body() corpo: { programa?: string },
  ) {
    return this.coordenacaoService.encerrarFormulario(tipo, corpo?.programa);
  }

  @Post('formularios/:tipo/duplicar')
  duplicarFormulario(
    @Param('tipo') tipo: string,
    @Body() corpo: { programaOrigem?: string; programaDestino?: string },
  ) {
    return this.coordenacaoService.duplicarFormulario(tipo, corpo ?? {});
  }

  @Get('formularios/:tipo/respostas')
  respostasFormulario(
    @Param('tipo') tipo: string,
    @Query('programa') programa?: string,
  ) {
    return this.coordenacaoService.respostasFormulario(tipo, programa);
  }

  @Get('formularios/:tipo/respostas/por-pergunta')
  respostasPorPergunta(
    @Param('tipo') tipo: string,
    @Query('programa') programa?: string,
  ) {
    return this.coordenacaoService.respostasPorPergunta(tipo, programa);
  }

  /**
   * Conjunto elegível para vínculos manuais. Recusa se o matching não foi
   * liberado — o bloqueio vale mesmo chamando o endpoint direto.
   */
  @Get('matching/pool')
  matching(@Query('programa') programa?: string) {
    return this.coordenacaoService.obterMatching(programa);
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
