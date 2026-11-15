import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import {
  aluno,
  coordenador,
  criarFeedTeste,
  padrinho,
  somenteMapa,
} from '../../test/helpers/feed.js';
import { LojinhaController } from './lojinha/lojinha.controller.js';
import type { LojinhaService } from './lojinha/lojinha.service.js';
import { PucStopsController } from './pucstops/pucstops.controller.js';
import type { PucStopsService } from './pucstops/pucstops.service.js';

/** `usuarioDoToken` confere `sub` + e-mail numa linha de `usuarios`. */
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

function montar() {
  const { permissoes, tabelas } = criarFeedTeste();
  const lojinha = { listar: vi.fn(async () => []) };
  const pucstops = { coletar: vi.fn(async () => ({ xp: 10 })) };
  return {
    tabelas,
    lojinha,
    pucstops,
    loja: new LojinhaController(
      lojinha as unknown as LojinhaService,
      banco,
      permissoes,
    ),
    totens: new PucStopsController(
      pucstops as unknown as PucStopsService,
      banco,
      permissoes,
    ),
  };
}

const leitura = { latitude: -19.92, longitude: -43.99 };

describe('Lojinha e totens pela participação no ciclo (RN-001, DP-07)', () => {
  it.each([
    [padrinho, 'padrinho'],
    [aluno, 'apadrinhado'],
  ] as const)(
    'conta real ($email) usa a lojinha com o papel do ciclo, não o do JWT',
    async (usuario, papel) => {
      const { loja, lojinha } = montar();
      await loja.listar(req({ ...usuario, perfil: 'nenhuma' }));
      expect(lojinha.listar).toHaveBeenCalledWith(
        expect.objectContaining({ perfil: papel, email: usuario.email }),
      );
    },
  );

  it('conta real vinculada coleta totem', async () => {
    const { totens, pucstops } = montar();
    await totens.coletar(req({ ...aluno, perfil: 'nenhuma' }), 'abc', leitura);
    expect(pucstops.coletar).toHaveBeenCalledWith(1, 'abc', leitura);
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
  ] as const)(
    '%s não usa a lojinha nem ganha XP em totens',
    async (_nome, usuario, preparar) => {
      const { loja, totens, lojinha, pucstops, tabelas } = montar();
      preparar(tabelas);
      await expect(loja.listar(req(usuario))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        totens.coletar(req(usuario), 'abc', leitura),
      ).rejects.toThrow(ForbiddenException);
      expect(lojinha.listar).not.toHaveBeenCalled();
      expect(pucstops.coletar).not.toHaveBeenCalled();
    },
  );
});
