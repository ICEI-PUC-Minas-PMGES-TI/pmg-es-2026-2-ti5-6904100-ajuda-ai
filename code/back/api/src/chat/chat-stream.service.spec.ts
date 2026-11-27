import { NotFoundException } from '@nestjs/common';
import { ChatStreamService } from './chat-stream.service.js';

describe('ChatStreamService', () => {
  it('encerra o stream e não publica eventos após revogação do acesso', async () => {
    const stream = new ChatStreamService();
    const eventos: string[] = [];
    let membroAtivo = true;
    let finalizar!: () => void;
    const finalizado = new Promise<void>((resolve) => {
      finalizar = resolve;
    });
    const verificarAcesso = async () => {
      if (!membroAtivo) throw new NotFoundException();
    };

    stream.observar(5, Date.now() + 60_000, verificarAcesso).subscribe({
      next: (evento) => eventos.push(evento.type),
      complete: finalizar,
    });

    stream.receber({
      id: '00000000-0000-4000-8000-000000000001',
      tipo: 'chat.message',
      chatId: 5,
      mensagemId: 11,
      ocorridoEm: new Date().toISOString(),
    });
    await vi.waitFor(() => expect(eventos).toContain('chat.message'));

    membroAtivo = false;
    stream.receber({
      id: '00000000-0000-4000-8000-000000000002',
      tipo: 'chat.message',
      chatId: 5,
      mensagemId: 12,
      ocorridoEm: new Date().toISOString(),
    });
    await finalizado;
    stream.onModuleDestroy();

    expect(eventos).toEqual(['chat.ready', 'chat.message', 'chat.access']);
  });

  it('encerra a conexão quando o token expira', async () => {
    const stream = new ChatStreamService();
    const eventos: string[] = [];
    let finalizar!: () => void;
    const finalizado = new Promise<void>((resolve) => {
      finalizar = resolve;
    });

    stream
      .observar(5, Date.now() - 1, async () => {})
      .subscribe({
        next: (evento) => eventos.push(evento.type),
        complete: finalizar,
      });
    await finalizado;
    stream.onModuleDestroy();

    expect(eventos).toEqual(['chat.ready']);
  });
});
