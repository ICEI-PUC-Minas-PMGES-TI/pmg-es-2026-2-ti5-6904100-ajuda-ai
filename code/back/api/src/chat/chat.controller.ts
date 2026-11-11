import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChatService } from './chat.service.js';
import { EnviarMensagemDto } from './dto/enviar-mensagem.dto.js';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chats: ChatService) {}

  @Get()
  listar(@Req() req: AuthenticatedRequest) {
    return this.chats.listar(req.user.email);
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
  ) {
    const cursor = antesDe === undefined ? undefined : Number(antesDe);
    return this.chats.listarMensagens(id, req.user.email, cursor);
  }

  @Post(':id/mensagens')
  enviar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnviarMensagemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chats.enviarMensagem(id, req.user.email, dto.texto);
  }
}
