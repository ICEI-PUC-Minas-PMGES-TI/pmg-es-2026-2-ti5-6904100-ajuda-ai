import type { DataSource, EntityManager } from 'typeorm';
import type { ChatService } from '../chat/chat.service.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { RespostasCadastro } from '../participacoes/entities/participacao.entity.js';
import { FormularioEntity } from '../formularios/entities/formulario.entity.js';
import {
  MatchingConfiguracaoEntity,
  MatchingExecucaoEntity,
  MatchingSugestaoEntity,
  MatchingVinculoEntity,
} from './entities/matching.entity.js';
import { MatchingParDecisaoEntity } from './entities/par-decisao.entity.js';
import { MatchingService } from './matching.service.js';

const p = (
  id: number,
  papel: 'candidato' | 'apadrinhado',
  respostas: RespostasCadastro = {},
) =>
  ({
    id,
    papel,
    programa: '2026/2',
    usuarioId: `aluno${id}@pucminas.edu.br`,
    status: papel === 'candidato' ? 'aprovado' : 'em_andamento',
    respostas: { nome: `Aluno ${id}`, ...respostas },
  }) as ParticipacaoEntity;

function preparar(
  registros: ParticipacaoEntity[],
  vinculos: Array<Partial<MatchingVinculoEntity>> = [],
  obrigatorio = false,
) {
  const programa = {
    id: 1,
    codigo: '2026/2',
    etapaAtual: 'formacao',
    inscricoesAbertas: false,
  };
  const config = {
    id: 1,
    programaId: 1,
    versao: 1,
    capacidadePorPadrinho: 3,
    capacidadePorApadrinhado: 1,
    criterios: [
      {
        campoCadastro: 'areas',
        operacao: 'intersecao',
        peso: 100,
        obrigatorio,
      },
    ],
  };
  const execucoes: MatchingExecucaoEntity[] = [];
  const sugestoes: MatchingSugestaoEntity[] = [];
  const repo = <T extends { id?: number }>(lista: T[]) => {
    const salvar = (d: T) => {
      (d as any).criadoEm ??= new Date();
      if (!d.id) {
        d.id = lista.length + 1;
        lista.push(d);
      }
      return d;
    };
    const query = {
      setLock: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      getMany: async () => lista,
      getOne: async () => lista[0] ?? null,
      getOneOrFail: async () => lista[0],
    };
    return {
      create: (d: T) => d,
      find: async () => lista,
      findOne: async () =>
        lista.find((d) => (d as { status?: string }).status === 'executando') ??
        null,
      createQueryBuilder: () => query,
      save: async (d: T | T[]) =>
        Array.isArray(d) ? d.map(salvar) : salvar(d),
      update: async () => ({ affected: 0 }),
    };
  };
  const repos = new Map<unknown, unknown>([
    [ProgramaEntity, repo([programa])],
    [MatchingConfiguracaoEntity, repo([config])],
    [ParticipacaoEntity, repo(registros)],
    [FormularioEntity, repo([])],
    [MatchingParDecisaoEntity, repo([])],
    [MatchingVinculoEntity, repo(vinculos)],
    [MatchingExecucaoEntity, repo(execucoes)],
    [MatchingSugestaoEntity, repo(sugestoes)],
  ]);
  const manager = {
    getRepository: (alvo: unknown) => {
      if (!repos.has(alvo)) throw new Error('Repositório inesperado');
      return repos.get(alvo);
    },
  } as EntityManager;
  const dados = {
    manager,
    transaction: async <T>(fn: (m: EntityManager) => Promise<T>) => fn(manager),
    getRepository: manager.getRepository,
  } as unknown as DataSource;
  return {
    service: new MatchingService(dados, {} as ChatService),
    programa,
    config,
    sugestoes,
    execucoes,
  };
}

describe('Execução real do serviço com a política v3', () => {
  it('gera 2/1, persiste relatório e mantém snapshot independente das respostas', async () => {
    const registros = [
      p(1, 'candidato', { areas: ['Tecnologia'] }),
      p(2, 'candidato', { areas: ['Tecnologia'] }),
      ...[10, 11, 12].map((id) =>
        p(id, 'apadrinhado', { areas: ['Tecnologia'] }),
      ),
    ];
    const cenario = preparar(registros);
    const resultado = await cenario.service.executar('2026/2', 'coord');
    expect(resultado.totalSugestoes).toBe(3);
    expect(
      resultado.relatorio!.cargaPadrinhos.map((c) => c.sugeridos).sort(),
    ).toEqual([1, 2]);
    expect(resultado.configSnapshot.politica).toMatchObject({
      versao: '3.0.0',
    });
    expect(cenario.sugestoes[0].explicacao).toMatchObject({
      cobertura: 1,
      distribuicao: { politica: 'mesma_qualidade' },
    });
    const snapshot = structuredClone(resultado.formulariosSnapshot);
    registros[0].respostas!.areas = ['Outra área'];
    expect(resultado.formulariosSnapshot).toEqual(snapshot);
  });
  it('não produz par artificial e explica falta de afinidade, dados e condições', async () => {
    const cenario = preparar([
      p(1, 'candidato', { areas: ['Tecnologia'] }),
      p(10, 'apadrinhado', { areas: ['Carreira'] }),
      p(11, 'apadrinhado'),
    ]);
    const resultado = await cenario.service.executar('2026/2', 'coord');
    expect(resultado.totalSugestoes).toBe(0);
    expect(resultado.relatorio!.semSugestao.map((a) => a.motivo)).toEqual([
      'sem_afinidade',
      'dados_insuficientes',
    ]);
    const obrigatorio = preparar(
      [
        p(1, 'candidato', { areas: ['Tecnologia'] }),
        p(10, 'apadrinhado', { areas: ['Carreira'] }),
      ],
      [],
      true,
    );
    expect(
      (await obrigatorio.service.executar('2026/2', 'coord')).relatorio!
        .semSugestao[0].motivo,
    ).toBe('condicoes_obrigatorias');
  });
  it('respeita vínculos existentes e favorece o padrinho vazio adequado', async () => {
    const vinculos = [
      {
        id: 1,
        padrinhoParticipacaoId: 1,
        apadrinhadoParticipacaoId: 90,
        ativo: true,
      },
      {
        id: 2,
        padrinhoParticipacaoId: 1,
        apadrinhadoParticipacaoId: 91,
        ativo: true,
      },
    ];
    const anterior = structuredClone(vinculos);
    const cenario = preparar(
      [
        p(1, 'candidato', { areas: ['Tecnologia'] }),
        p(2, 'candidato', { areas: ['Tecnologia'] }),
        p(10, 'apadrinhado', { areas: ['Tecnologia'] }),
      ],
      vinculos,
    );
    await cenario.service.executar('2026/2', 'coord');
    expect(cenario.sugestoes[0].padrinhoParticipacaoId).toBe(2);
    expect(vinculos).toEqual(anterior);
  });
  it('relata falta de vagas sem culpar o cadastro do aluno', async () => {
    const vinculos = [90, 91, 92].map((id) => ({
      id,
      padrinhoParticipacaoId: 1,
      apadrinhadoParticipacaoId: id,
      ativo: true,
    }));
    const cenario = preparar(
      [
        p(1, 'candidato', { areas: ['Tecnologia'] }),
        p(10, 'apadrinhado', { areas: ['Tecnologia'] }),
      ],
      vinculos,
    );
    const resultado = await cenario.service.executar('2026/2', 'coord');
    expect(resultado.totalSugestoes).toBe(0);
    expect(resultado.relatorio!.semSugestao[0]).toMatchObject({
      motivo: 'sem_vagas',
      paresAdequados: 1,
    });
  });
  it('distingue concorrência por vagas de impedimentos misturados com baixa afinidade', async () => {
    const disputado = preparar([
      p(1, 'candidato', { areas: ['Tecnologia'] }),
      ...[10, 11, 12, 13].map((id) =>
        p(id, 'apadrinhado', { areas: ['Tecnologia'] }),
      ),
    ]);
    expect(
      (await disputado.service.executar('2026/2', 'coord')).relatorio!
        .semSugestao[0].motivo,
    ).toBe('vagas_disputadas');
  });
});
