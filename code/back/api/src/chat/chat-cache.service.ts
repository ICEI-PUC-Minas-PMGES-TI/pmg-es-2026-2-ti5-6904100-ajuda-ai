import { Injectable } from '@nestjs/common';
import type { MensagemChatEntity } from './entities/chat.entity.js';

interface PaginaMensagens {
  mensagens: MensagemChatEntity[];
  temMais: boolean;
  expiraEm: number;
}

const LIMITE_CHATS = 100;
const DURACAO_CACHE_MS = 20_000;

@Injectable()
export class ChatCacheService {
  private readonly recentes = new Map<number, PaginaMensagens>();

  obter(chatId: number): PaginaMensagens | undefined {
    const pagina = this.recentes.get(chatId);
    if (!pagina) return undefined;
    if (pagina.expiraEm <= Date.now()) {
      this.recentes.delete(chatId);
      return undefined;
    }
    this.recentes.delete(chatId);
    this.recentes.set(chatId, pagina);
    return {
      mensagens: pagina.mensagens.map((mensagem) => ({ ...mensagem })),
      temMais: pagina.temMais,
      expiraEm: pagina.expiraEm,
    };
  }

  salvar(
    chatId: number,
    mensagens: MensagemChatEntity[],
    temMais: boolean,
  ): void {
    this.recentes.delete(chatId);
    this.recentes.set(chatId, {
      mensagens: mensagens.map((mensagem) => ({ ...mensagem })),
      temMais,
      expiraEm: Date.now() + DURACAO_CACHE_MS,
    });
    if (this.recentes.size > LIMITE_CHATS) {
      const maisAntigo = this.recentes.keys().next().value;
      if (maisAntigo !== undefined) this.recentes.delete(maisAntigo);
    }
  }

  invalidar(chatId: number): void {
    this.recentes.delete(chatId);
  }
}
