import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { PucStopsService } from './pucstops.service.js';

it('não propaga SQL e coordenadas da geofence ao logger padrão do Nest', async () => {
  const falha = new QueryFailedError(
    'consulta de geofence',
    [-43.99, -19.92],
    new Error('falha simulada'),
  );
  const qr = {
    connect: vi.fn(),
    startTransaction: vi.fn(),
    query: vi.fn().mockRejectedValue(falha),
    rollbackTransaction: vi.fn(),
    release: vi.fn(),
  };
  const ds = {
    query: vi.fn().mockResolvedValue([{ schema: 'public' }]),
    createQueryRunner: () => qr,
  };
  const servico = new PucStopsService(ds as unknown as DataSource);
  const erro = await servico
    .coletar(1, '00000000-0000-4000-8000-000000000001', {
      latitude: -19.92,
      longitude: -43.99,
    })
    .catch((e: unknown) => e);
  expect(erro).toBeInstanceOf(ServiceUnavailableException);
  expect(erro).not.toHaveProperty('query');
  expect(erro).not.toHaveProperty('parameters');
  expect(String(erro)).not.toContain('-43.99');
  expect(qr.rollbackTransaction).toHaveBeenCalledOnce();
  expect(qr.release).toHaveBeenCalledOnce();
});
