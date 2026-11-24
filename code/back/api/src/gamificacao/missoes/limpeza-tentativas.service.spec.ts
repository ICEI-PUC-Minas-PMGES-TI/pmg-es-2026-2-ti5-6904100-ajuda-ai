import type { DataSource } from 'typeorm';
import {
  INTERVALO_LIMPEZA_TENTATIVAS_MS,
  LimpezaTentativasService,
} from './limpeza-tentativas.service.js';

function banco(falhar = false) {
  const comandos: string[] = [];
  const dataSource = {
    query: vi.fn(async (sql: string) => {
      comandos.push(sql);
      if (falhar) throw new Error('banco fora');
      return [];
    }),
  } as unknown as DataSource;
  return { comandos, service: new LimpezaTentativasService(dataSource) };
}

describe('LimpezaTentativasService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('apaga só as tentativas que já saíram da janela de uma hora', async () => {
    const { service, comandos } = banco();
    await service.limpar();
    expect(comandos).toEqual([
      `DELETE FROM "gamificacao"."missoes_tentativas_codigo" WHERE "criado_em" <= now() - interval '1 hour'`,
    ]);
  });

  it('limpa ao subir e depois a cada hora, até o módulo parar', async () => {
    vi.useFakeTimers();
    const { service, comandos } = banco();
    service.onModuleInit();
    expect(comandos).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(INTERVALO_LIMPEZA_TENTATIVAS_MS);
    expect(comandos).toHaveLength(2);
    await service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(3 * INTERVALO_LIMPEZA_TENTATIVAS_MS);
    expect(comandos).toHaveLength(2);
  });

  it('falha no banco só gera log', async () => {
    const { service } = banco(true);
    await expect(service.limpar()).resolves.toBeUndefined();
  });
});
