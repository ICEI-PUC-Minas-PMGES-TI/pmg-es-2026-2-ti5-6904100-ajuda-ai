import { afterEach, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { cenarioMatching } from '../../test/helpers/matching-cenario.js';
import { ChatService } from '../chat/chat.service.js';
import { VinculosService } from '../matching/vinculos.service.js';
import { ParticipacoesService } from './participacoes.service.js';

afterEach(() => vi.restoreAllMocks());

describe('ParticipacoesService.vincular chat', () => {
  it('delega ao domínio e cria o chat na transação uma única vez', async () => {
    const c = cenarioMatching({ alunos: 1 });
    const criar = vi
      .spyOn(ChatService, 'criarParaVinculoNaTransacao')
      .mockImplementation(async (tx: EntityManager) => {
        expect(tx).toBe(c.dados.manager);
        return {} as never;
      });
    const operacoes = new VinculosService(
      c.dados,
      c.service,
      new ChatService(c.dados),
    );
    const service = new ParticipacoesService(
      c.repos.ParticipacaoEntity,
      c.repos.ProgramaEntity,
      c.dados,
      operacoes,
    );
    await service.vincular(100, 1, 'coord@pucminas.edu.br');
    await service.vincular(100, 1, 'coord@pucminas.edu.br');
    expect(c.vinculos).toHaveLength(1);
    expect(c.vinculos[0]).toMatchObject({
      origem: 'manual',
      ativo: true,
      padrinhoParticipacaoId: 1,
      apadrinhadoParticipacaoId: 100,
    });
    expect(criar).toHaveBeenCalledExactlyOnceWith(
      c.dados.manager,
      c.vinculos[0].id,
    );
    expect(c.movimentacoes).toHaveLength(1);
  });
});
