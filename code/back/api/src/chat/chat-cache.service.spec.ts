import { ChatCacheService } from './chat-cache.service.js';
import type { MensagemChatEntity } from './entities/chat.entity.js';

describe('ChatCacheService', () => {
  it('não permite que uma leitura antiga repovoe o cache após invalidação', () => {
    const cache = new ChatCacheService();
    const versao = cache.versaoAtual();
    const pagina = [{ id: 1 }] as MensagemChatEntity[];

    cache.invalidar(8);

    expect(cache.salvarSeAtual(8, pagina, false, versao)).toBe(false);
    expect(cache.obter(8)).toBeUndefined();
  });

  it('salva páginas quando nenhuma invalidação ocorreu durante a consulta', () => {
    const cache = new ChatCacheService();
    const versao = cache.versaoAtual();
    const pagina = [{ id: 1 }] as MensagemChatEntity[];

    expect(cache.salvarSeAtual(8, pagina, true, versao)).toBe(true);
    expect(cache.obter(8)).toMatchObject({
      mensagens: [{ id: 1 }],
      temMais: true,
    });
  });
});
