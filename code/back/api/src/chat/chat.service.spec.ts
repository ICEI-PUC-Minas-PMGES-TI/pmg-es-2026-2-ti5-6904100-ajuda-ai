import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { MatchingVinculoEntity } from '../matching/entities/matching.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ChatCacheService } from './chat-cache.service.js';
import {
  ChatEntity,
  ChatOutboxEntity,
  ChatParticipanteEntity,
  MensagemChatEntity,
} from './entities/chat.entity.js';
import { ChatService } from './chat.service.js';

function managerEmMemoria() {
  const vinculos = new Map<number, Partial<MatchingVinculoEntity>>();
  const participacoes = new Map<number, Partial<ParticipacaoEntity>>();
  const programas = new Map<number, Partial<ProgramaEntity>>();
  const chats = new Map<number, Partial<ChatEntity>>();
  const membros: Partial<ChatParticipanteEntity>[] = [];
  let proximoChatId = 1;
  const repository = <T extends object>(
    registros: Map<number, Partial<T>>,
  ) => ({
    create: (dados: Partial<T>) => dados,
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      [...registros.values()].find((item) =>
        Object.entries(where).every(
          ([chave, valor]) => item[chave as keyof T] === valor,
        ),
      ) ?? null,
    save: async (dados: Partial<T> | Partial<T>[]) => {
      const lista = Array.isArray(dados) ? dados : [dados];
      const salvos = lista.map((item) => {
        const id = typeof item.id === 'number' ? item.id : proximoChatId++;
        const salvo = { ...item, id };
        registros.set(id, salvo);
        return salvo;
      });
      return Array.isArray(dados) ? salvos : salvos[0];
    },
    createQueryBuilder: () => ({
      setLock: () => ({
        where: () => ({
          getOne: async () => [...registros.values()][0] ?? null,
        }),
      }),
    }),
  });
  const repositorios = new Map<Function, ReturnType<typeof repository>>();
  repositorios.set(MatchingVinculoEntity, repository(vinculos));
  repositorios.set(ParticipacaoEntity, repository(participacoes));
  repositorios.set(ProgramaEntity, repository(programas));
  repositorios.set(ChatEntity, repository(chats));
  repositorios.set(ChatParticipanteEntity, {
    create: (dados: Partial<ChatParticipanteEntity>) => dados,
    save: async (dados: Partial<ChatParticipanteEntity>[]) => {
      membros.push(...dados);
      return dados;
    },
  } as ReturnType<typeof repository>);
  return {
    manager: {
      getRepository: (entity: Function) => repositorios.get(entity),
    } as unknown as EntityManager,
    vinculos,
    participacoes,
    programas,
    chats,
    membros,
  };
}

function criarService(dados: DataSource) {
  return new ChatService(
    dados,
    {} as never,
    { invalidar: vi.fn(), obter: vi.fn(), salvar: vi.fn() } as never,
    { observar: vi.fn() } as never,
  );
}

describe('ChatService.criarParaVinculo', () => {
  it('cria um chat persistido com padrinho e apadrinhado como participantes', async () => {
    const memoria = managerEmMemoria();
    memoria.vinculos.set(7, {
      id: 7,
      programaId: 3,
      padrinhoParticipacaoId: 11,
      apadrinhadoParticipacaoId: 12,
      ativo: true,
    });
    memoria.programas.set(3, { id: 3, codigo: '2026/2' });
    memoria.participacoes.set(11, {
      id: 11,
      programa: '2026/2',
      papel: 'padrinho',
      status: 'em_andamento',
    });
    memoria.participacoes.set(12, {
      id: 12,
      programa: '2026/2',
      papel: 'apadrinhado',
      status: 'em_andamento',
    });

    const service = criarService({} as never);
    const chat = await service.criarParaVinculo(memoria.manager, 7);

    expect(chat).toMatchObject({
      id: 1,
      programaId: 3,
      matchingVinculoId: 7,
      ativo: true,
    });
    expect(memoria.membros).toEqual([
      expect.objectContaining({ chatId: 1, participacaoId: 11 }),
      expect.objectContaining({ chatId: 1, participacaoId: 12 }),
    ]);
    await expect(service.criarParaVinculo(memoria.manager, 7)).resolves.toBe(
      chat,
    );
    expect(memoria.chats.size).toBe(1);
    expect(memoria.membros).toHaveLength(2);
  });

  it('recusa vínculo inexistente ou inativo', async () => {
    const memoria = managerEmMemoria();
    const service = criarService({} as never);
    await expect(
      service.criarParaVinculo(memoria.manager, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
    memoria.vinculos.set(7, {
      id: 7,
      ativo: false,
    });
    await expect(
      service.criarParaVinculo(memoria.manager, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('não cria chat se o vínculo não tiver os dois papéis ativos', async () => {
    const memoria = managerEmMemoria();
    memoria.vinculos.set(7, {
      id: 7,
      programaId: 3,
      padrinhoParticipacaoId: 11,
      apadrinhadoParticipacaoId: 12,
      ativo: true,
    });
    memoria.programas.set(3, { id: 3, codigo: '2026/2' });
    memoria.participacoes.set(11, {
      id: 11,
      programa: '2026/2',
      papel: 'candidato',
      status: 'aprovado',
    });
    memoria.participacoes.set(12, {
      id: 12,
      programa: '2026/2',
      papel: 'apadrinhado',
      status: 'em_andamento',
    });
    const service = criarService({} as never);
    await expect(
      service.criarParaVinculo(memoria.manager, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(memoria.chats.size).toBe(0);
    expect(memoria.membros).toHaveLength(0);
  });
});

describe('ChatService.enviarMensagem', () => {
  it('persiste a mensagem e a outbox do evento na mesma transação', async () => {
    const participacao = {
      id: 11,
      usuarioId: 'aluno@example.com',
      respostas: { nome: 'Aluno' },
    } as ParticipacaoEntity;
    const membro = { chatId: 5, participacaoId: 11 };
    const mensagem = {
      id: 24,
      chatId: 5,
      remetenteParticipacaoId: 11,
      texto: 'Olá!',
      imagemChave: null,
      estado: 'enviada',
      entregueEm: null,
      lidaEm: null,
      criadaEm: new Date(),
    };
    const mensagemRepo = {
      create: vi.fn((valor) => valor),
      save: vi.fn().mockResolvedValue(mensagem),
    };
    const outboxRepo = {
      create: vi.fn((valor) => valor),
      save: vi.fn().mockImplementation((valor) => valor),
    };
    const chatRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 5, matchingVinculoId: null }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const repositorios = new Map<Function, object>([
      [ParticipacaoEntity, { find: vi.fn().mockResolvedValue([participacao]) }],
      [ChatParticipanteEntity, { findOne: vi.fn().mockResolvedValue(membro) }],
      [ChatEntity, chatRepo],
      [MensagemChatEntity, mensagemRepo],
      [ChatOutboxEntity, outboxRepo],
    ]);
    const manager = {
      getRepository: (entity: Function) => repositorios.get(entity),
    } as unknown as EntityManager;
    const ordem: string[] = [];
    const dados = {
      transaction: async (acao: (tx: EntityManager) => Promise<unknown>) => {
        const resultado = await acao(manager);
        ordem.push('commit');
        return resultado;
      },
    } as unknown as DataSource;
    const invalidar = vi.fn(() => ordem.push('invalidar'));
    const service = new ChatService(
      dados,
      {} as never,
      { invalidar, obter: vi.fn(), salvar: vi.fn() } as never,
      {} as never,
    );

    await expect(
      service.enviarMensagem(5, 'aluno@example.com', ' Olá! '),
    ).resolves.toMatchObject({ id: 24, texto: 'Olá!', imagemUrl: null });
    expect(mensagemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ texto: 'Olá!', remetenteParticipacaoId: 11 }),
    );
    expect(outboxRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        evento: expect.objectContaining({
          tipo: 'chat.message',
          chatId: 5,
          mensagemId: 24,
        }),
      }),
    );
    expect(invalidar).toHaveBeenCalledWith(5);
    expect(ordem).toEqual(['commit', 'invalidar']);
  });

  it('recusa enviar mensagens quando o vínculo do chat está encerrado', async () => {
    const membro = { chatId: 5, participacaoId: 11 };
    const participacao = {
      id: 11,
      usuarioId: 'aluno@example.com',
    } as ParticipacaoEntity;
    const chat = { id: 5, matchingVinculoId: 7, ativo: true } as ChatEntity;
    const vinculo = { id: 7, ativo: false } as MatchingVinculoEntity;
    const salvarMensagem = vi.fn();
    const atualizarChat = vi.fn();
    const repositorios = new Map<Function, object>([
      [ParticipacaoEntity, { find: vi.fn().mockResolvedValue([participacao]) }],
      [ChatParticipanteEntity, { findOne: vi.fn().mockResolvedValue(membro) }],
      [
        ChatEntity,
        { findOne: vi.fn().mockResolvedValue(chat), update: atualizarChat },
      ],
      [MatchingVinculoEntity, { findOne: vi.fn().mockResolvedValue(vinculo) }],
      [
        MensagemChatEntity,
        {
          create: vi.fn((mensagem) => mensagem),
          save: salvarMensagem,
        },
      ],
    ]);
    const manager = {
      getRepository: (entity: Function) => repositorios.get(entity),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: (acao: (tx: EntityManager) => Promise<unknown>) =>
        acao(manager),
    } as unknown as DataSource;
    const service = criarService(dataSource);

    await expect(
      service.enviarMensagem(5, 'aluno@example.com', 'Mensagem de teste'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(salvarMensagem).not.toHaveBeenCalled();
    expect(atualizarChat).not.toHaveBeenCalled();
  });
});

describe('ChatService.listarMensagens', () => {
  it('informa mensagens anteriores e pagina pelo ID da mensagem', async () => {
    const registros = Array.from({ length: 51 }, (_, indice) => ({
      id: indice + 1,
      chatId: 5,
      remetenteParticipacaoId: 22,
      texto: `Mensagem ${indice + 1}`,
      imagemChave: null,
      estado: 'entregue',
      entregueEm: new Date(),
      lidaEm: null,
      criadaEm: new Date(),
    }));
    let cursor: number | undefined;
    let limite = 0;
    const builder = {
      update: () => builder,
      set: () => builder,
      where: () => builder,
      andWhere: (condicao: string, parametros: Record<string, number>) => {
        if (condicao === 'mensagem.id < :antesDe') cursor = parametros.antesDe;
        return builder;
      },
      execute: async () => ({ affected: 0 }),
      orderBy: () => builder,
      take: (tamanho: number) => {
        limite = tamanho;
        return builder;
      },
      getMany: async () =>
        registros
          .filter((mensagem) => cursor === undefined || mensagem.id < cursor)
          .sort((a, b) => b.id - a.id)
          .slice(0, limite),
    };
    const repositorios = new Map<Function, object>([
      [
        ParticipacaoEntity,
        {
          find: vi
            .fn()
            .mockResolvedValue([{ id: 11, usuarioId: 'aluno@example.com' }]),
        },
      ],
      [
        ChatParticipanteEntity,
        {
          findOne: vi.fn().mockResolvedValue({ chatId: 5, participacaoId: 11 }),
        },
      ],
      [MensagemChatEntity, { createQueryBuilder: () => builder }],
    ]);
    const manager = {
      getRepository: (entity: Function) => repositorios.get(entity),
    } as unknown as EntityManager;
    const cache = new ChatCacheService();
    const service = new ChatService(
      { manager } as unknown as DataSource,
      {} as never,
      cache,
      {} as never,
    );

    const recente = await service.listarMensagens(5, 'aluno@example.com');
    expect(recente.mensagens.map((mensagem) => mensagem.id)).toEqual(
      Array.from({ length: 50 }, (_, indice) => indice + 2),
    );
    expect(recente.temMais).toBe(true);

    const anterior = await service.listarMensagens(
      5,
      'aluno@example.com',
      recente.mensagens[0].id,
    );
    expect(anterior.mensagens.map((mensagem) => mensagem.id)).toEqual([1]);
    expect(anterior.temMais).toBe(false);
    await expect(
      service.listarMensagens(
        5,
        'aluno@example.com',
        Number.MAX_SAFE_INTEGER + 1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
