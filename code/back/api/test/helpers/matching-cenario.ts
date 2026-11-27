import {
  ChatEntity,
  ChatParticipanteEntity,
  ChatPeriodoEntity,
  ChatDestinatarioEntity,
  MensagemChatEntity,
} from '../../src/chat/entities/chat.entity.js';
import { In, type DataSource, type Repository } from 'typeorm';
import {
  conectarRepositorios,
  repositorioEmMemoria,
} from './repositorio-memoria.js';
import { ChatService } from '../../src/chat/chat.service.js';
import type { AzureBlobStorageService } from '../../src/storage/azure-blob-storage.service.js';
import { MatchingService } from '../../src/matching/matching.service.js';
import { VinculosService } from '../../src/matching/vinculos.service.js';
import {
  MatchingGrupoEntity,
  MatchingVinculoEventoEntity,
} from '../../src/matching/entities/grupo.entity.js';
import { ProgramaEntity } from '../../src/programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../../src/participacoes/entities/participacao.entity.js';
import { FormularioEntity } from '../../src/formularios/entities/formulario.entity.js';
import { MatchingParDecisaoEntity } from '../../src/matching/entities/par-decisao.entity.js';
import {
  MatchingConfiguracaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
  MatchingDecisaoEntity,
  MatchingChatOutboxEntity,
} from '../../src/matching/entities/matching.entity.js';
import {
  MatchingCriterioEntity,
  MatchingCriterioVersaoEntity,
} from '../../src/matching/entities/criterio-catalogo.entity.js';

/** Fixture transacional com rollback e fila; não simula o lock manager do PostgreSQL. */
export function cenarioMatching(
  opcoes: {
    chatReal?: boolean;
    padrinhos?: number;
    alunos?: number;
    capacidade?: number;
    participantes?: ParticipacaoEntity[];
    programas?: ProgramaEntity[];
    vinculos?: MatchingVinculoEntity[];
    sugestoes?: MatchingSugestaoEntity[];
  } = {},
) {
  const programas =
    opcoes.programas ??
    ([
      {
        id: 1,
        codigo: '2026/2',
        etapaAtual: 'formacao',
        inscricoesAbertas: false,
        matchingPendente: false,
      },
    ] as ProgramaEntity[]);
  const configs = programas.map((programa) => ({
    id: programa.id,
    programaId: programa.id,
    versao: 1,
    capacidadePorPadrinho: opcoes.capacidade ?? 3,
    capacidadePorApadrinhado: 1,
    criterios: [{ campoCadastro: 'areas', operacao: 'intersecao', peso: 100 }],
  })) as MatchingConfiguracaoEntity[];
  const participantes =
    opcoes.participantes ??
    ([
      ...Array.from({ length: opcoes.padrinhos ?? 1 }, (_, i) => ({
        id: i + 1,
        papel: 'candidato',
        status: 'aprovado',
      })),
      ...Array.from({ length: opcoes.alunos ?? 2 }, (_, i) => ({
        id: i + 100,
        papel: 'apadrinhado',
        status: 'em_andamento',
      })),
    ].map((p) => ({
      ...p,
      programa: '2026/2',
      usuarioId: `u${p.id}@pucminas.edu.br`,
      respostas: { nome: `Pessoa ${p.id}`, areas: ['Tecnologia'] },
    })) as ParticipacaoEntity[]);
  const execucoes: MatchingExecucaoEntity[] = [];
  const sugestoes: MatchingSugestaoEntity[] = opcoes.sugestoes ?? [];
  const vinculos: MatchingVinculoEntity[] = opcoes.vinculos ?? [];
  const decisoes: MatchingDecisaoEntity[] = [];
  const eventos: MatchingParDecisaoEntity[] = [];
  const grupos: MatchingGrupoEntity[] = [];
  const movimentacoes: MatchingVinculoEventoEntity[] = [];
  const conversas: ChatEntity[] = [],
    membros: ChatParticipanteEntity[] = [],
    periodos: ChatPeriodoEntity[] = [],
    mensagens: MensagemChatEntity[] = [],
    recibos: ChatDestinatarioEntity[] = [];
  const locks: string[] = [];
  const tabelas = new Map<Function, any[]>([
    [ChatEntity, conversas],
    [ChatParticipanteEntity, membros],
    [ChatPeriodoEntity, periodos],
    [MensagemChatEntity, mensagens],
    [ChatDestinatarioEntity, recibos],
    [ProgramaEntity, programas],
    [ParticipacaoEntity, participantes],
    [MatchingConfiguracaoEntity, configs],
    [MatchingExecucaoEntity, execucoes],
    [MatchingSugestaoEntity, sugestoes],
    [MatchingVinculoEntity, vinculos],
    [MatchingDecisaoEntity, decisoes],
    [MatchingParDecisaoEntity, eventos],
    [MatchingGrupoEntity, grupos],
    [MatchingVinculoEventoEntity, movimentacoes],
    [MatchingChatOutboxEntity, []],
    [FormularioEntity, []],
    [MatchingCriterioEntity, []],
    [MatchingCriterioVersaoEntity, []],
  ]);
  const repos: Record<string, Repository<any>> = {};
  for (const [entidade, linhas] of tabelas) {
    const repo = repositorioEmMemoria(linhas);
    const encontrar = repo.find.bind(repo);
    repo.find = async (opts?: any) => {
      const resultado = await encontrar(opts);
      if (opts?.order)
        resultado.sort((a, b) => {
          for (const [campo, ordem] of Object.entries(opts.order)) {
            if (a[campo] !== b[campo])
              return (
                (a[campo] > b[campo] ? 1 : -1) * (ordem === 'DESC' ? -1 : 1)
              );
          }
          return 0;
        });
      return resultado;
    };
    const salvar = repo.save.bind(repo);
    repo.save = (async (dados: any) => {
      if (
        entidade === MatchingParDecisaoEntity ||
        entidade === MatchingDecisaoEntity
      )
        for (const d of Array.isArray(dados) ? dados : [dados])
          d.decididaEm ??= new Date();
      return salvar(dados);
    }) as typeof repo.save;
    repo.createQueryBuilder = (() => {
      let parametros: Record<string, any> = {};
      let ordem: Record<string, string> | undefined;
      let limite: number | undefined;
      let modo: string | undefined;
      const buscar = async () => {
        if (modo) locks.push(`${entidade.name}:${modo}`);
        const where = { ...parametros };
        if (where.ids) {
          where.id = In(where.ids);
          delete where.ids;
        }
        const resultado = await repo.find({ where, order: ordem } as any);
        return limite ? resultado.slice(0, limite) : resultado;
      };
      const query = {
        where: (_sql: string, params: Record<string, any>) => {
          parametros = params;
          return query;
        },
        setLock: (valor: string) => {
          modo = valor;
          return query;
        },
        orderBy: (campo: string, direcao: string) => {
          ordem = { [campo.split('.').at(-1)!]: direcao };
          return query;
        },
        limit: (n: number) => {
          limite = n;
          return query;
        },
        getMany: buscar,
        getOne: async () => (await buscar())[0] ?? null,
        getOneOrFail: async () => {
          const r = (await buscar())[0];
          if (!r) throw new Error('Registro esperado ausente');
          return r;
        },
      };
      return query;
    }) as typeof repo.createQueryBuilder;
    repos[entidade.name] = repo;
  }
  conectarRepositorios(repos);
  const manager = repos.ProgramaEntity.manager;
  const armazenamento: Pick<
    AzureBlobStorageService,
    'enviar' | 'excluir' | 'sasLeitura'
  > = {
    enviar: async (container, blobName) => ({
      container,
      blobName,
      chave: `${container}/${blobName}`,
      url: null,
    }),
    excluir: async () => {},
    sasLeitura: (container, blobName) => ({
      container,
      blobName,
      chave: `${container}/${blobName}`,
      url: `https://storage.test/${container}/${blobName}`,
      expiraEm: new Date(),
    }),
  };
  let falharChat = false;
  const chats: number[] = [];
  const chat = {
    criarParaVinculo: async (_manager: unknown, id: number) => {
      if (falharChat) throw new Error('Falha no chat');
      if (opcoes.chatReal) {
        const criada = await servicoChat.criarParaVinculo(_manager as any, id);
        chats.push(id);
        return criada;
      }
      chats.push(id);
    },
  } as unknown as ChatService;
  let depoisDaTransacao: ((resultado: any) => void | Promise<void>) | undefined;
  const dados = {
    isInitialized: true,
    manager,
    getRepository: (alvo: Function) => repos[alvo.name],
    transaction: async (fn: (m: typeof manager) => Promise<any>) => {
      const resultado = await manager.transaction(async (m) => {
        locks.push('TX');
        return fn(m);
      });
      await depoisDaTransacao?.(resultado);
      return resultado;
    },
  } as unknown as DataSource;
  const servicoChat = new ChatService(dados, armazenamento);
  return {
    servicoChat,
    armazenamento,
    conversas,
    membros,
    periodos,
    mensagens,
    recibos,
    service: new MatchingService(dados, chat),
    operacoes: new VinculosService(
      dados,
      new MatchingService(dados, chat),
      chat,
    ),
    dados,
    repos,
    programas,
    configs,
    participantes,
    execucoes,
    sugestoes,
    vinculos,
    decisoes,
    eventos,
    grupos,
    movimentacoes,
    locks,
    chats,
    falharChat: (valor: boolean) => {
      falharChat = valor;
    },
    aposTransacao: (fn?: typeof depoisDaTransacao) => {
      depoisDaTransacao = fn;
    },
    gerar: () =>
      new MatchingService(dados, chat).executar(
        '2026/2',
        'coord@pucminas.edu.br',
      ),
  };
}
