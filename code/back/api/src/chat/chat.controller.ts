import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { ChatService } from './chat.service.js';
import { EnviarMensagemDto } from './dto/enviar-mensagem.dto.js';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chats: ChatService) {}

  @Get()
  listar(
    @Req() req: AuthenticatedRequest,
    @Query('programa') programa?: string,
  ) {
    return this.chats.listar(req.user.email, programa);
  }

  @Get(':id/participantes')
  participantes(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chats.buscarParticipantes(id, req.user.email);
  }

  @Get(':id/mensagens')
  mensagens(
    @Param('id', ParseIntPipe) id: number,
    @Query('antesDe') antesDe: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Query('depoisDe') depoisDe?: string,
  ) {
    const cursor = antesDe === undefined ? undefined : Number(antesDe);
    return this.chats.listarMensagens(
      id,
      req.user.email,
      cursor,
      depoisDe === undefined ? undefined : Number(depoisDe),
    );
  }

  @Get(':id/recibos')
  recibos(
    @Param('id', ParseIntPipe) id: number,
    @Query('depoisDaRevisao', ParseIntPipe) revisao: number,
    @Query('ateMensagemId', ParseIntPipe) ate: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chats.listarRecibos(id, req.user.email, revisao, ate);
  }

  @Sse(':id/events')
  async eventos(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const exp = (req.user as typeof req.user & { exp?: number }).exp;
    const expiraEm = exp ? exp * 1000 : Date.now() + 3600_000;
    return this.chats.observarMensagens(id, req.user.email, expiraEm);
  }

  @Post(':id/mensagens')
  enviar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarMensagemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chats.enviarMensagem(
      id,
      req.user.email,
      dto.texto,
      dto.clientId,
    );
  }

  @Post(':id/imagens')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  enviarImagem(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() arquivo?: { buffer: Buffer },
  ) {
    return this.chats.enviarImagem(id, req.user.email, arquivo?.buffer);
  }
}
