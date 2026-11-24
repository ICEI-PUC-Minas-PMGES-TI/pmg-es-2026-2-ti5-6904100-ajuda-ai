import { VinculosService } from './vinculos.service.js';
import { TransferirApadrinhadoDto } from './dto/matching.dto.js';
import {
  BadRequestException,
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
import { CriterioCatalogoService } from './criterio-catalogo.service.js';
import {
  AtualizarCriterioCatalogoDto,
  SalvarCriterioCatalogoDto,
} from './dto/criterio-catalogo.dto.js';
import {
  LiberarMatchingDto,
  ProgramaMatchingDto,
  RecusarSugestaoDto,
  ReconsiderarParDto,
  SalvarConfiguracaoMatchingDto,
} from './dto/matching.dto.js';
import { MatchingService } from './matching.service.js';

@Controller('coordenacao/matching')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coordenador')
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly catalogo: CriterioCatalogoService,
    private readonly vinculos: VinculosService,
  ) {}

  @Get()
  visao(@Query('programa') programa: string) {
    return this.matching.visao(programa);
  }

  @Get('criterios')
  listarCriterios(@Query('busca') busca?: string) {
    return this.catalogo.listar(busca);
  }

  @Get('criterios/ativos')
  criteriosAtivos() {
    return this.catalogo.listarAtivosParaFormulario();
  }

  @Get('criterios/semelhantes')
  semelhantes(
    @Query('nome') nome?: string,
    @Query('excetoId') excetoId?: string,
  ) {
    const id = Number(excetoId);
    return this.catalogo.sugerirSemelhantes(
      nome ?? '',
      Number.isInteger(id) && id > 0 ? id : undefined,
    );
  }

  @Get('criterios/:id')
  obterCriterio(@Param('id', ParseIntPipe) id: number) {
    return this.catalogo.obter(id);
  }

  @Post('criterios')
  criarCriterio(
    @Body() dto: SalvarCriterioCatalogoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalogo.criar(dto, req.user.email);
  }

  @Put('criterios/:id')
  atualizarCriterio(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarCriterioCatalogoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalogo.atualizar(id, dto, req.user.email);
  }

  @Patch('criterios/:id/ativo')
  alternarAtivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: { ativo: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalogo.desativar(id, corpo.ativo === true, req.user.email);
  }

  @Delete('criterios/:id')
  excluirCriterio(@Param('id', ParseIntPipe) id: number) {
    return this.catalogo.excluir(id);
  }

  @Get('pares/recusados')
  paresRecusados(@Query('programa') programa: string) {
    return this.matching.listarParesRecusados(programa);
  }

  @Get('grupos')
  grupos(@Query('programa') programa: string) {
    return this.vinculos.grupos(programa);
  }

  @Get('destinos')
  destinos(
    @Query('apadrinhadoId', ParseIntPipe) apadrinhadoId: number,
    @Query('vinculoOrigemId') origem?: string,
  ) {
    if (origem !== undefined && !/^[1-9]\d*$/.test(origem))
      throw new BadRequestException('Vínculo de origem inválido.');
    return this.vinculos.destinos(
      apadrinhadoId,
      origem ? Number(origem) : undefined,
    );
  }

  @Post('vinculos/:id/transferir')
  transferir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferirApadrinhadoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vinculos.transferir(id, dto, req.user.email);
  }

  @Post('pares/:id/reconsiderar')
  reconsiderarPar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReconsiderarParDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matching.reconsiderarPar(id, req.user.email, dto.justificativa);
  }

  @Get('config')
  configuracao(@Query('programa') programa: string) {
    return this.matching.obterConfiguracao(programa);
  }

  @Put('config')
  salvarConfiguracao(
    @Body() dto: SalvarConfiguracaoMatchingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matching.salvarConfiguracao(dto, req.user.email);
  }

  @Post('liberar')
  liberar(@Body() dto: LiberarMatchingDto, @Req() req: AuthenticatedRequest) {
    return this.matching.liberar(dto.programa, dto.liberado, req.user.email);
  }

  @Post('executar')
  executar(@Body() dto: ProgramaMatchingDto, @Req() req: AuthenticatedRequest) {
    return this.matching.executar(dto.programa, req.user.email);
  }

  @Get('execucoes')
  execucoes(@Query('programa') programa: string) {
    return this.matching.listarExecucoes(programa);
  }

  @Get('sugestoes')
  sugestoes(
    @Query('programa') programa: string,
    @Query('status') status?: string,
  ) {
    return this.matching.listarSugestoes(programa, status);
  }

  @Get('sugestao/:id')
  sugestao(@Param('id', ParseIntPipe) id: number) {
    return this.matching.obterSugestao(id);
  }

  @Post('sugestao/:id/aprovar')
  aprovar(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matching.aprovar(id, req.user.email);
  }

  @Post('sugestao/:id/recusar')
  recusar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecusarSugestaoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.matching.recusar(id, req.user.email, dto.motivo);
  }
}
