import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CoordenacaoService } from './coordenacao.service.js';

@Controller('coordenacao')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class CoordenacaoController {
  constructor(private readonly coordenacaoService: CoordenacaoService) {}

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
  acaoEmMassa(@Body() corpo: { ids?: unknown; acao?: string }) {
    return this.coordenacaoService.acaoEmMassa(corpo);
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
  aprovar(@Param('id', ParseIntPipe) id: number) {
    return this.coordenacaoService.aprovarCandidatura(id);
  }

  @Post('candidaturas/:id/rejeitar')
  rejeitar(@Param('id', ParseIntPipe) id: number) {
    return this.coordenacaoService.rejeitarCandidatura(id);
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
  criarPrograma(@Body() corpo: { codigo?: string }) {
    return this.coordenacaoService.criarNovoCiclo(corpo.codigo);
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
