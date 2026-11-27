import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Optional,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ConquistasService } from '../gamificacao/conquistas/conquistas.service.js';
import {
  FeedAdminGuard,
  FeedLeituraGuard,
  FeedPolicy,
  FeedPublishGuard,
} from './feed-policy.js';
import { FeedMidiasService } from './feed-midias.service.js';
import { FeedStreamService } from './feed-stream.service.js';
import { ComentarioDto, CurtidaDto, PublicacaoDto } from './publicacoes.dto.js';
import type { FeedPermissoesDto } from './publicacoes.dto.js';
import { PublicacoesService } from './publicacoes.service.js';

@Controller('publicacoes')
@UseGuards(JwtAuthGuard)
export class PublicacoesController {
  constructor(
    private readonly publicacoes: PublicacoesService,
    private readonly stream: FeedStreamService,
    private readonly midias: FeedMidiasService,
    private readonly policy: FeedPolicy,
    @Optional() private readonly conquistas?: ConquistasService,
  ) {}
  @Get()
  @UseGuards(FeedLeituraGuard)
  listar(
    @Req() req: AuthenticatedRequest,
    @Query('programa') programa?: string,
  ) {
    return this.publicacoes.listar(req.user, programa);
  }
  /** Semestres com publicações, para o seletor da coordenação. */
  @Get('ciclos')
  @UseGuards(FeedAdminGuard)
  ciclos() {
    return this.publicacoes.ciclos();
  }
  @Get('permissoes')
  async permissoes(
    @Req() req: AuthenticatedRequest,
  ): Promise<FeedPermissoesDto> {
    return this.policy.resumo(req.user);
  }
  @Sse('events')
  @UseGuards(FeedLeituraGuard)
  eventos(
    @Req() req: AuthenticatedRequest,
    @Query('programa') programa?: string,
  ) {
    if (programa && !/^\d{4}\/[12]$/.test(programa))
      throw new BadRequestException('Semestre inválido.');
    const exp = (req.user as typeof req.user & { exp?: number }).exp;
    return this.stream.observarAutorizado(
      exp ? exp * 1000 : Date.now() + 3600_000,
      () => this.policy.resumo(req.user),
      programa,
    );
  }
  @Post('midias')
  @UseGuards(FeedPublishGuard)
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  enviarMidia(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() arquivo?: { buffer: Buffer },
  ) {
    return this.midias.enviar(arquivo?.buffer, req.user.email);
  }
  @Get(':id')
  @UseGuards(FeedLeituraGuard)
  obter(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.obter(id, req.user);
  }
  @Post()
  @UseGuards(FeedPublishGuard)
  async criar(@Body() corpo: PublicacaoDto, @Req() req: AuthenticatedRequest) {
    // Elegibilidade de quando a ação é aceita (F32): um encerramento do
    // ciclo logo depois do commit não tira a conquista.
    const aceita = await this.conquistas?.elegibilidadeNoFeed(req.user);
    // Logo depois do commit, com o ciclo gravado (F32: FEED_PUBLICACOES),
    // antes e independente da releitura da resposta.
    return this.publicacoes.criar(corpo, req.user, ({ programa }) =>
      this.conferirConquistas(req, programa, aceita),
    );
  }
  @Patch(':id')
  @UseGuards(FeedAdminGuard)
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: PublicacaoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.atualizar(id, corpo, req.user);
  }
  @Delete(':id')
  remover(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.remover(id, req.user);
  }
  @Post(':id/comentarios')
  async comentar(
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: ComentarioDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const aceita = await this.conquistas?.elegibilidadeNoFeed(req.user);
    // Logo depois do commit, com o ciclo do post comentado (F32:
    // FEED_COMENTARIOS): se a releitura falhar (ciclo fechou no
    // intervalo), o comentário gravado ainda conta.
    return this.publicacoes.comentar(
      id,
      corpo.texto,
      req.user,
      corpo.paiId,
      ({ programa }) => this.conferirConquistas(req, programa, aceita),
    );
  }

  /** Conquistas do feed (F32). Nunca falha: a ação já foi gravada. */
  private async conferirConquistas(
    req: AuthenticatedRequest,
    programa: string | null,
    aceita:
      Awaited<ReturnType<ConquistasService['elegibilidadeNoFeed']>> | undefined,
  ): Promise<void> {
    await this.conquistas?.aposAtividadeNoFeed(req.user, programa, aceita);
  }
  @Delete(':id/comentarios/:comentarioId')
  removerComentario(
    @Param('id', ParseIntPipe) id: number,
    @Param('comentarioId', ParseIntPipe) comentarioId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.removerComentario(id, comentarioId, req.user);
  }
  @Get(':id/curtidas')
  @UseGuards(FeedLeituraGuard)
  curtidores(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.curtidores(id, req.user);
  }
  @Get(':id/comentarios/:comentarioId/curtidas')
  @UseGuards(FeedLeituraGuard)
  curtidoresComentario(
    @Param('id', ParseIntPipe) id: number,
    @Param('comentarioId', ParseIntPipe) comentarioId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.curtidoresComentario(id, comentarioId, req.user);
  }
  @Post(':id/curtidas')
  curtir(
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: CurtidaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.curtir(id, corpo.delta, req.user);
  }
  @Post(':id/comentarios/:comentarioId/curtidas')
  curtirComentario(
    @Param('id', ParseIntPipe) id: number,
    @Param('comentarioId', ParseIntPipe) comentarioId: number,
    @Body() corpo: CurtidaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.curtirComentario(
      id,
      comentarioId,
      corpo.delta,
      req.user,
    );
  }
}
