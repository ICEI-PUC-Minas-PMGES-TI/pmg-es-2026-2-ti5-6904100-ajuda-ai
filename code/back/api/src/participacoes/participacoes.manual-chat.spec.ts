import { afterEach, vi } from 'vitest';
import type { EntityManager } from 'typeorm';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { ChatService } from '../chat/chat.service.js';
import { ParticipacaoEntity } from './entities/participacao.entity.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';
import {
  conectarRepositorios,
  repositorioEmMemoria,
} from '../../test/helpers/repositorio-memoria.js';
import { ParticipacoesService } from './participacoes.service.js';

afterEach(() => vi.restoreAllMocks());

describe('ParticipacoesService.vincular chat', () => {
  it('cria o chat dentro da transação e reutiliza o vínculo ao repetir', async () => {
    const registros = [
      {
        id: 1,
        usuarioId: 'padrinho@example.com',
        programa: '2026/2',
        papel: 'candidato',
        status: 'aprovado',
        grupo: null,
        apadrinhados: 0,
        inicioEm: null,
        terminoEm: null,
        respostas: null,
        observacoes: null,
        verificacao: null,
      },
      {
        id: 2,
        usuarioId: 'apadrinhado@example.com',
        programa: '2026/2',
        papel: 'apadrinhado',
        status: 'em_andamento',
        grupo: null,
        apadrinhados: 0,
        inicioEm: null,
        terminoEm: null,
        respostas: null,
        observacoes: null,
        verificacao: null,
      },
    ] as ParticipacaoEntity[];
    const ciclo = [
      { id: 1, codigo: '2026/2', etapaAtual: 'formacao' },
    ] as ProgramaEntity[];
    const vinculos: MatchingVinculoEntity[] = [];
    const participacoesRepo = repositorioEmMemoria(registros);
    const programasRepo = repositorioEmMemoria(ciclo);
    const vinculosRepo = repositorioEmMemoria(vinculos);
    conectarRepositorios({
      ParticipacaoEntity: participacoesRepo,
      ProgramaEntity: programasRepo,
      MatchingVinculoEntity: vinculosRepo,
    });
    const manager = participacoesRepo.manager as EntityManager;
    const chatsCriados = new Set<number>();
    const criarParaVinculo = vi
      .spyOn(ChatService, 'criarParaVinculoNaTransacao')
      .mockImplementation(async (tx: EntityManager, id: number) => {
        expect(tx).toBe(manager);
        chatsCriados.add(id);
        return {} as never;
      });
    const service = new ParticipacoesService(
      participacoesRepo,
      programasRepo,
      { isInitialized: true } as never,
    );

    await service.vincular(2, 1, 'coord@example.com');
    await service.vincular(2, 1, 'coord@example.com');

    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]).toMatchObject({
      programaId: 1,
      padrinhoParticipacaoId: 1,
      apadrinhadoParticipacaoId: 2,
      ativo: true,
      origem: 'manual',
    });
    expect(registros[0]).toMatchObject({
      papel: 'padrinho',
      status: 'em_andamento',
      grupo: 'Grupo-1',
      apadrinhados: 1,
    });
    expect(registros[1].grupo).toBe('Grupo-1');
    expect(criarParaVinculo).toHaveBeenCalledTimes(2);
    expect(criarParaVinculo).toHaveBeenNthCalledWith(1, manager, vinculos[0].id);
    expect(criarParaVinculo).toHaveBeenNthCalledWith(2, manager, vinculos[0].id);
    expect(chatsCriados).toEqual(new Set([vinculos[0].id]));
  });
});
