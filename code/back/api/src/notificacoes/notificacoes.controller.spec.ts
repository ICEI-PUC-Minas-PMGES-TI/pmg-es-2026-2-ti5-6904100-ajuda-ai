import type { DataSource } from 'typeorm';
import { aluno } from '../../test/helpers/feed.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import type { ParticipacoesService } from '../participacoes/participacoes.service.js';
import type { PermissoesAlunoService } from '../participacoes/permissoes-aluno.service.js';
import { NotificacoesController } from './notificacoes.controller.js';
import type { NotificacoesService } from './notificacoes.service.js';

const banco = {
  options: {},
  query: async (_sql: string, [id]: [number]) => [{ id, email: aluno.email }],
} as unknown as DataSource;

interface Registro {
  id: number;
  papel: string;
  grupo: string | null;
  status?: string;
}

function montar(
  permissoes: () => Promise<unknown>,
  dupla: {
    registro?: Registro | null;
    vinculados?: number[];
    padrinhoDoGrupo?: number | null;
    apadrinhadosDoGrupo?: Array<{ id: number; status: string }>;
  } = {},
) {
  const service = {
    sincronizarVinculo: vi.fn(async () => {}),
    sincronizarMissoes: vi.fn(async () => {}),
    listar: vi.fn(async () => ({ naoLidas: 0, itens: [] })),
  };
  const participacoes = {
    registroPrincipal: vi.fn(async () =>
      dupla.registro === undefined
        ? { id: 10, papel: 'apadrinhado', grupo: null }
        : dupla.registro,
    ),
    listarVinculados: vi.fn(async () =>
      (dupla.vinculados ?? [21]).map((id) => ({
        participacao: { id },
        vinculoId: id + 100,
      })),
    ),
    buscarPadrinhoDoGrupo: vi.fn(async () =>
      dupla.padrinhoDoGrupo ? { id: dupla.padrinhoDoGrupo } : null,
    ),
    listarApadrinhadosDoGrupo: vi.fn(
      async () => dupla.apadrinhadosDoGrupo ?? [],
    ),
  };
  const controller = new NotificacoesController(
    service as unknown as NotificacoesService,
    banco,
    { doUsuario: vi.fn(permissoes) } as unknown as PermissoesAlunoService,
    participacoes as unknown as ParticipacoesService,
  );
  return { controller, service, participacoes };
}

const comDupla = (papel: 'padrinho' | 'apadrinhado') => async () => ({
  podeColetarTotens: true,
  podePublicar: papel === 'padrinho',
  vinculoAtivo: true,
  papel,
  programa: '2026/2',
});

const req = { user: aluno } as AuthenticatedRequest;

describe('NotificacoesController', () => {
  it('participante recebe os avisos de missão do ciclo antes da lista', async () => {
    const { controller, service } = montar(async () => ({
      podeColetarTotens: true,
      podePublicar: true,
      vinculoAtivo: true,
      papel: 'padrinho',
      programa: '2026/2',
    }));
    await controller.listar(req, {});
    expect(service.sincronizarMissoes).toHaveBeenCalledWith(1, '2026/2', {
      podePublicar: true,
      temPar: true,
      papel: 'padrinho',
    });
    expect(service.listar).toHaveBeenCalledWith(1, undefined, undefined);
    expect(service.sincronizarMissoes.mock.invocationCallOrder[0]).toBeLessThan(
      service.listar.mock.invocationCallOrder[0],
    );
  });

  it('vínculo confirmado: avisa cada pessoa da dupla atual, antes da lista', async () => {
    const { controller, service, participacoes } = montar(
      comDupla('apadrinhado'),
    );
    await controller.listar(req, {});
    expect(participacoes.registroPrincipal).toHaveBeenCalledWith(
      aluno.email,
      '2026/2',
    );
    expect(service.sincronizarVinculo).toHaveBeenCalledWith(
      1,
      '2026/2',
      'apadrinhado',
      [21],
    );
    expect(
      service.sincronizarVinculo.mock.invocationCallOrder[0],
    ).toBeLessThan(service.listar.mock.invocationCallOrder[0]);
  });

  it('padrinho com vários apadrinhados: um aviso por apadrinhado', async () => {
    const { controller, service } = montar(comDupla('padrinho'), {
      registro: { id: 10, papel: 'padrinho', grupo: 'Grupo-10' },
      vinculados: [21, 22],
    });
    await controller.listar(req, {});
    expect(service.sincronizarVinculo).toHaveBeenCalledWith(
      1,
      '2026/2',
      'padrinho',
      [21, 22],
    );
  });

  it('grupo legado sem vínculo do matching: usa o padrinho ou os apadrinhados em andamento', async () => {
    const apadrinhado = montar(comDupla('apadrinhado'), {
      registro: { id: 10, papel: 'apadrinhado', grupo: 'Grupo-30' },
      vinculados: [],
      padrinhoDoGrupo: 30,
    });
    await apadrinhado.controller.listar(req, {});
    expect(apadrinhado.service.sincronizarVinculo).toHaveBeenCalledWith(
      1,
      '2026/2',
      'apadrinhado',
      [30],
    );
    const padrinho = montar(comDupla('padrinho'), {
      registro: { id: 30, papel: 'padrinho', grupo: 'Grupo-30' },
      vinculados: [],
      apadrinhadosDoGrupo: [
        { id: 10, status: 'em_andamento' },
        { id: 11, status: 'concluido' },
      ],
    });
    await padrinho.controller.listar(req, {});
    expect(padrinho.service.sincronizarVinculo).toHaveBeenCalledWith(
      1,
      '2026/2',
      'padrinho',
      [10],
    );
  });

  it('falha ao buscar a dupla não impede os avisos de missão nem a lista', async () => {
    const { controller, service, participacoes } = montar(
      comDupla('apadrinhado'),
    );
    participacoes.registroPrincipal.mockRejectedValueOnce(
      new Error('banco fora'),
    );
    await controller.listar(req, {});
    expect(service.sincronizarVinculo).toHaveBeenCalledWith(
      1,
      '2026/2',
      'apadrinhado',
      [],
    );
    expect(service.sincronizarMissoes).toHaveBeenCalled();
    expect(service.listar).toHaveBeenCalled();
  });

  it('sem vínculo confirmado não avisa vínculo', async () => {
    const { controller, service } = montar(async () => ({
      podeColetarTotens: true,
      vinculoAtivo: false,
      papel: 'apadrinhado',
      programa: '2026/2',
    }));
    await controller.listar(req, {});
    expect(service.sincronizarVinculo).not.toHaveBeenCalled();
    expect(service.sincronizarMissoes).toHaveBeenCalled();
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
