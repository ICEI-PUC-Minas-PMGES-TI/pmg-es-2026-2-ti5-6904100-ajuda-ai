import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AzureBlobStorageService } from '../../storage/azure-blob-storage.service.js';
import type { RestaurantesService } from '../restaurantes/restaurantes.service.js';
import { CardapiosService } from './cardapios.service.js';

describe('cleanup secundário do cardápio', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('storage que não responde não prende a exclusão já confirmada pelo banco', async () => {
    vi.useFakeTimers();
    const aviso = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const id = '10000000-0000-4000-8000-000000000001';
    const arquivo = `restaurantes/20000000-0000-4000-8000-000000000002/cardapios/${id}.png`;
    const query = vi.fn().mockResolvedValue([{ arquivo }]);
    let liberar!: () => void;
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const excluir = vi.fn(() => pendente);
    const service = new CardapiosService(
      { query } as unknown as DataSource,
      { excluir } as unknown as AzureBlobStorageService,
      {} as RestaurantesService,
    );
    const resultado = service.remover(id);
    await vi.advanceTimersByTimeAsync(3_001);
    await expect(resultado).resolves.toEqual({ removido: true });
    expect(query).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('limpeza-pendente'),
    );
    expect(excluir).toHaveBeenCalledWith('restaurant-menus', arquivo);
    // A requisição remota pode terminar depois do prazo; o resultado principal
    // já está confirmado e a operação tardia só alcança a chave removida.
    liberar();
    await pendente;
  });
});
