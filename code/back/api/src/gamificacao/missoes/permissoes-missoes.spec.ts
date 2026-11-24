import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../auth/authenticated-request.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import {
  aluno,
  coordenador,
  criarFeedTeste,
  padrinho,
  somenteMapa,
} from '../../../test/helpers/feed.js';
import { MissoesAdminController } from './missoes-admin.controller.js';
import { MissoesController } from './missoes.controller.js';
import type { MissoesService } from './missoes.service.js';

const ID = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';

const banco = {
  options: {},
  query: async (_sql: string, [id]: [number]) => [
    {
      id,
      email: [aluno, padrinho, somenteMapa, coordenador].find(
        (u) => u.sub === String(id),
      )!.email,
    },
  ],
} as unknown as DataSource;

const req = (user: AuthenticatedRequest['user']) =>
  ({ user }) as AuthenticatedRequest;

function contexto(
  user: AuthenticatedRequest['user'],
  rota: keyof MissoesAdminController,
): ExecutionContext {
  return {
    getHandler: () => MissoesAdminController.prototype[rota],
    getClass: () => MissoesAdminController,
    switchToHttp: () => ({ getRequest: () => req(user) }),
  } as unknown as ExecutionContext;
}

describe('Permissões das missões', () => {
  const guard = new RolesGuard(new Reflector());
  const rotas: Array<keyof MissoesAdminController> = [
    'listar',
    'detalhe',
    'criar',
    'atualizar',
    'ativar',
    'desativar',
  ];

  it.each([aluno, padrinho, somenteMapa])(
    '$email recebe 403 em todas as rotas da coordenação',
    (usuario) => {
      for (const rota of rotas) {
        expect(() => guard.canActivate(contexto(usuario, rota))).toThrow(
          ForbiddenException,
        );
      }
    },
  );

  it('coordenador passa nas rotas da coordenação', () => {
    for (const rota of rotas) {
      expect(guard.canActivate(contexto(coordenador, rota))).toBe(true);
    }
  });

  function montarAluno() {
    const { permissoes, tabelas } = criarFeedTeste();
    const service = {
      listar: vi.fn(async () => ({ missoes: [] })),
      concluir: vi.fn(async () => ({ xp: 10 })),
    };
    return {
      tabelas,
      service,
      controller: new MissoesController(
        service as unknown as MissoesService,
        banco,
        permissoes,
      ),
    };
  }

  it('participante do ciclo lista e conclui com o id do token', async () => {
    const { controller, service } = montarAluno();
    await controller.listar(req({ ...aluno, perfil: 'nenhuma' }));
    await controller.concluir(req({ ...aluno, perfil: 'nenhuma' }), ID, {
      codigo: 'CALOURO26',
    });
    const acesso = { podePublicar: false, temPar: true };
    expect(service.listar).toHaveBeenCalledWith(1, expect.any(Date), acesso);
    expect(service.concluir).toHaveBeenCalledWith(
      1,
      ID,
      expect.any(Date),
      { codigo: 'CALOURO26' },
      acesso,
    );
  });

  it.each([
    ['só do mapa', somenteMapa, () => {}],
    ['coordenação', coordenador, () => {}],
    [
      'ex-participante',
      aluno,
      (t: Record<string, any[]>) =>
        (t.ParticipacaoEntity[1].programa = '2020/1'),
    ],
  ] as const)('%s não lista nem conclui missões', async (_n, usuario, prep) => {
    const { controller, service, tabelas } = montarAluno();
    prep(tabelas);
    await expect(controller.listar(req(usuario))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(controller.concluir(req(usuario), ID, {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.listar).not.toHaveBeenCalled();
    expect(service.concluir).not.toHaveBeenCalled();
  });
});
