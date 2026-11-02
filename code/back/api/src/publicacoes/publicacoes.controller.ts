import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { FeedAdminGuard, FeedPolicy, FeedPublishGuard } from './feed-policy.js';
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
  ) {}
  @Get()
  listar(@Req() req: AuthenticatedRequest) {
    return this.publicacoes.listar(req.user);
  }
  @Get('permissoes')
  permissoes(@Req() req: AuthenticatedRequest): FeedPermissoesDto {
    return {
      podePublicar: this.policy.podePublicar(req.user),
      podeAdministrar: this.policy.podeAdministrar(req.user),
      podeInteragir: this.policy.podeInteragir(req.user),
    };
  }
  @Sse('events')
  eventos(@Req() req: AuthenticatedRequest) {
    const exp = (req.user as typeof req.user & { exp?: number }).exp;
    return this.stream.observar(exp ? exp * 1000 : Date.now() + 3600_000);
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
  obter(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.obter(id, req.user);
  }
  @Post()
  @UseGuards(FeedPublishGuard)
  criar(@Body() corpo: PublicacaoDto, @Req() req: AuthenticatedRequest) {
    return this.publicacoes.criar(corpo, req.user);
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
  @UseGuards(FeedAdminGuard)
  remover(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.remover(id, req.user);
  }
  @Post(':id/comentarios')
  comentar(
    @Param('id', ParseIntPipe) id: number,
    @Body() corpo: ComentarioDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.comentar(id, corpo.texto, req.user, corpo.paiId);
  }
  @Delete(':id/comentarios/:comentarioId')
  removerComentario(
    @Param('id', ParseIntPipe) id: number,
    @Param('comentarioId', ParseIntPipe) comentarioId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicacoes.removerComentario(id, comentarioId, req.user);
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
