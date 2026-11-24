import type { DataSource } from 'typeorm';
import { aluno } from '../../test/helpers/feed.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import type { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';
import { NotificacoesController } from './notificacoes.controller.js';
import type { NotificacoesService } from './notificacoes.service.js';

const banco = {
  options: {},
  query: async (_sql: string, [id]: [number]) => [{ id, email: aluno.email }],
} as unknown as DataSource;

function montar(permissoes: () => Promise<unknown>) {
  const service = {
    sincronizarMissoes: vi.fn(async () => {}),
    listar: vi.fn(async () => ({ naoLidas: 0, itens: [] })),
  };
  const controller = new NotificacoesController(
    service as unknown as NotificacoesService,
    banco,
    { doUsuario: vi.fn(permissoes) } as unknown as PermissoesAlunoService,
  );
  return { controller, service };
}

const req = { user: aluno } as AuthenticatedRequest;

describe('NotificacoesController', () => {
  it('participante recebe os avisos de missão do ciclo antes da lista', async () => {
    const { controller, service } = montar(async () => ({
      podeColetarTotens: true,
      podePublicar: true,
      vinculoAtivo: true,
      programa: '2026/2',
    }));
    await controller.listar(req, {});
    expect(service.sincronizarMissoes).toHaveBeenCalledWith(1, '2026/2', {
      podePublicar: true,
      temPar: true,
    });
    expect(service.listar).toHaveBeenCalledWith(1, undefined, undefined);
    expect(service.sincronizarMissoes.mock.invocationCallOrder[0]).toBeLessThan(
      service.listar.mock.invocationCallOrder[0],
    );
  });

  it('quem não participa do ciclo só lista', async () => {
    const { controller, service } = montar(async () => ({
      podeColetarTotens: false,
      programa: '2026/2',
    }));
    await controller.listar(req, { limite: 5 });
    expect(service.sincronizarMissoes).not.toHaveBeenCalled();
    expect(service.listar).toHaveBeenCalledWith(1, 5, undefined);
  });

  it('página seguinte (antes) não cria avisos de missão de novo', async () => {
    const { controller, service } = montar(async () => ({
      podeColetarTotens: true,
      programa: '2026/2',
    }));
    const antes = '11111111-1111-4111-8111-111111111111';
    await controller.listar(req, { antes });
    expect(service.sincronizarMissoes).not.toHaveBeenCalled();
    expect(service.listar).toHaveBeenCalledWith(1, undefined, antes);
  });

  it('falha ao ler a participação não impede a lista', async () => {
    const { controller, service } = montar(async () => {
      throw new Error('banco fora');
    });
    await expect(controller.listar(req, {})).resolves.toEqual({
      naoLidas: 0,
      itens: [],
    });
    expect(service.sincronizarMissoes).not.toHaveBeenCalled();
  });
});
