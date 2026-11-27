import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ChatService } from '../chat/chat.service.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import type { ProgramaEntity } from '../programas/entities/programa.entity.js';
import type { TipoCriterioCatalogo } from './entities/criterio-catalogo.entity.js';
import type { CriterioMatching } from './entities/matching.entity.js';
import { MatchingService } from './matching.service.js';

const participante = (
  id: number,
  extras: Record<string, string | string[] | boolean>,
): ParticipacaoEntity =>
  ({
    id,
    usuarioId: `u${id}@pucminas.edu.br`,
    programa: '2026/2',
    papel: id === 1 ? 'candidato' : 'apadrinhado',
    status: id === 1 ? 'aprovado' : 'em_andamento',
    respostas: { extras },
  }) as ParticipacaoEntity;

describe('MatchingService: critérios do catálogo', () => {
  const service = new MatchingService({} as DataSource, {} as ChatService);
  const metadata = {
    formularios: [],
    snapshots: [],
    campos: {
      padrinho: new Map([
        [
          10,
          {
            criterioId: 10,
            criterioVersao: 1,
            perguntaId: 'q-bolsa',
            tipo: 'sim_nao' as TipoCriterioCatalogo,
            rotulo: 'É bolsista?',
            nome: 'Condição de bolsista',
          },
        ],
        [
          20,
          {
            criterioId: 20,
            criterioVersao: 1,
            perguntaId: 'q-areas',
            tipo: 'multipla_escolha' as const,
            rotulo: 'Áreas',
            nome: 'Áreas',
          },
        ],
      ]),
      apadrinhado: new Map([
        [
          10,
          {
            criterioId: 10,
            criterioVersao: 1,
            perguntaId: 'q-bolsa-a',
            tipo: 'sim_nao' as const,
            rotulo: 'É bolsista?',
            nome: 'Condição de bolsista',
          },
        ],
        [
          20,
          {
            criterioId: 20,
            criterioVersao: 1,
            perguntaId: 'q-areas-a',
            tipo: 'multipla_escolha' as const,
            rotulo: 'Áreas',
            nome: 'Áreas',
          },
        ],
      ]),
    },
  };

  it('distingue cobertura e afinidade ao comparar booleanos de forma estável', () => {
    const criterios: CriterioMatching[] = [
      {
        criterioPadrinhoId: 10,
        criterioApadrinhadoId: 10,
        operacao: 'igualdade',
        peso: 70,
      },
      {
        criterioPadrinhoId: 20,
        criterioApadrinhadoId: 20,
        operacao: 'intersecao',
        peso: 30,
      },
    ];
    const pontuar = Reflect.get(service, 'pontuar') as (
      padrinho: ParticipacaoEntity,
      apadrinhado: ParticipacaoEntity,
      criterios: CriterioMatching[],
      metadata: unknown,
    ) => {
      score: number;
      explicacao: {
        pesoConsiderado: number;
        criterios: Array<Record<string, unknown>>;
      };
    };
    const resultado = pontuar.call(
      service,
      participante(1, { 'q-bolsa': true }),
      participante(2, { 'q-bolsa-a': true, 'q-areas-a': ['academico'] }),
      criterios,
      metadata,
    );
    expect(resultado.score).toBe(0.7);
    expect(resultado.explicacao).toMatchObject({
      afinidade: 1,
      cobertura: 0.7,
    });
    expect(resultado.explicacao.pesoConsiderado).toBe(70);
    expect(resultado.explicacao.criterios[1]).toMatchObject({
      considerado: false,
      motivo: 'resposta_ausente',
    });
  });

  const pontuarBolsa = (
    padrinho: ParticipacaoEntity,
    apadrinhado: ParticipacaoEntity,
    campos = metadata,
  ) => {
    const pontuar = Reflect.get(service, 'pontuar') as (
      p: ParticipacaoEntity,
      a: ParticipacaoEntity,
      criterios: CriterioMatching[],
      campos: unknown,
    ) => {
      score: number;
      explicacao: { criterios: Array<Record<string, unknown>> };
    };
    return pontuar.call(
      service,
      padrinho,
      apadrinhado,
      [
        {
          criterioPadrinhoId: 10,
          criterioApadrinhadoId: 10,
          operacao: 'igualdade',
          peso: 100,
        },
      ],
      campos,
    );
  };

  const comSnapshot = (p: ParticipacaoEntity, perguntas: unknown[]) => {
    p.respostas!._servidor = {
      formulario: {
        id: 1,
        programa: p.programa,
        versao: 1,
        atualizadoEm: null,
        perguntas,
      },
    };
    return p;
  };

  it.each([true, false])(
    'pontua resposta %s pelo ID da versão respondida',
    (valor) => {
      const antigo = comSnapshot(
        participante(1, { 'bolsa-antiga': valor, 'q-bolsa': !valor }),
        [
          {
            id: 'bolsa-antiga',
            criterioId: 10,
            criterioVersao: 1,
            tipo: 'sim_nao',
            enunciado: 'Pergunta original',
          },
        ],
      );
      const atual = comSnapshot(participante(2, { 'q-bolsa-a': valor }), [
        { id: 'q-bolsa-a', criterioId: 10, criterioVersao: 2, tipo: 'sim_nao' },
      ]);
      const resultado = pontuarBolsa(antigo, atual);
      expect(resultado.score).toBe(1);
      expect(resultado.explicacao.criterios[0]).toMatchObject({
        considerado: true,
        valorPadrinho: valor,
        valorApadrinhado: valor,
        rotuloPadrinho: 'Pergunta original',
      });
    },
  );

  it('não atribui resposta de outro critério quando o ID atual foi reutilizado', () => {
    const antigo = comSnapshot(participante(1, { 'q-bolsa': true }), [
      { id: 'q-bolsa', criterioId: 99, criterioVersao: 1, tipo: 'sim_nao' },
    ]);
    const resultado = pontuarBolsa(
      antigo,
      participante(2, { 'q-bolsa-a': true }),
    );
    expect(resultado.explicacao.criterios[0]).toMatchObject({
      considerado: false,
      motivo: 'resposta_ausente',
    });
  });

  it('normaliza a resposta pelo tipo da versão respondida, não pelo atual', () => {
    const antigo = comSnapshot(participante(1, { 'bolsa-antiga': 'true' }), [
      {
        id: 'bolsa-antiga',
        criterioId: 10,
        criterioVersao: 1,
        tipo: 'sim_nao',
      },
    ]);
    const campos = {
      ...metadata,
      campos: {
        ...metadata.campos,
        padrinho: new Map(metadata.campos.padrinho),
      },
    };
    campos.campos.padrinho.set(10, {
      ...metadata.campos.padrinho.get(10)!,
      criterioVersao: 2,
      tipo: 'escolha_unica',
    });
    expect(
      pontuarBolsa(antigo, participante(2, { 'q-bolsa-a': true }), campos)
        .score,
    ).toBe(1);
  });

  it('recusa configuração vazia e formato legado de campos', () => {
    const validar = Reflect.get(service, 'validarCriterios') as (
      criterios: unknown[],
      metadata: unknown,
    ) => void;
    expect(() => validar.call(service, [], metadata)).toThrow(
      BadRequestException,
    );
    expect(() =>
      validar.call(
        service,
        [
          {
            campoPadrinho: 'areas',
            campoApadrinhado: 'areas',
            operacao: 'intersecao',
            peso: 10,
          },
        ],
        metadata,
      ),
    ).toThrow(/formato antigo/);
  });

  it('bloqueia inscrições abertas e programa encerrado', () => {
    const validarEtapa = Reflect.get(service, 'validarEtapa') as (
      programa: ProgramaEntity,
    ) => void;
    expect(() =>
      validarEtapa.call(service, {
        etapaAtual: 'formacao',
        inscricoesAbertas: true,
      } as ProgramaEntity),
    ).toThrow(/Feche as inscrições/);
    expect(() =>
      validarEtapa.call(service, {
        etapaAtual: 'encerramento',
        inscricoesAbertas: false,
      } as ProgramaEntity),
    ).toThrow(/encerrado/);
    expect(() =>
      validarEtapa.call(service, {
        etapaAtual: 'analise',
        inscricoesAbertas: false,
      } as ProgramaEntity),
    ).toThrow(BadRequestException);
    expect(() =>
      validarEtapa.call(service, {
        etapaAtual: 'formacao',
        inscricoesAbertas: false,
      } as ProgramaEntity),
    ).not.toThrow();
  });

  it('inclui somente candidaturas aprovadas de cada papel', () => {
    const elegiveis = Reflect.get(service, 'elegiveis') as (
      registros: ParticipacaoEntity[],
    ) => {
      padrinhos: ParticipacaoEntity[];
      apadrinhados: ParticipacaoEntity[];
    };
    const registros = [
      { id: 1, papel: 'candidato', status: 'aprovado' },
      { id: 2, papel: 'candidato', status: 'pendente' },
      { id: 3, papel: 'padrinho', status: 'em_andamento' },
      { id: 4, papel: 'apadrinhado', status: 'em_andamento' },
      { id: 5, papel: 'apadrinhado', status: 'pendente' },
    ] as ParticipacaoEntity[];
    const resultado = elegiveis.call(service, registros);
    expect(resultado.padrinhos.map((p) => p.id)).toEqual([1, 3]);
    expect(resultado.apadrinhados.map((p) => p.id)).toEqual([4]);
  });

  it('pontua interseção por ids de alternativa, não por rótulo', () => {
    const pontuar = Reflect.get(service, 'pontuar') as (
      padrinho: ParticipacaoEntity,
      apadrinhado: ParticipacaoEntity,
      criterios: CriterioMatching[],
      metadata: unknown,
    ) => {
      score: number;
      explicacao: { criterios: Array<Record<string, unknown>> };
    };
    const resultado = pontuar.call(
      service,
      participante(1, { 'q-areas': ['academico', 'pessoal'] }),
      participante(2, {
        'q-bolsa-a': false,
        'q-areas-a': ['academico'],
      }),
      [
        {
          criterioPadrinhoId: 20,
          criterioApadrinhadoId: 20,
          operacao: 'intersecao',
          peso: 100,
        },
      ],
      metadata,
    );
    expect(resultado.score).toBe(1);
    expect(resultado.explicacao.criterios[0]).toMatchObject({
      considerado: true,
      contribuicao: 100,
    });
  });
});
