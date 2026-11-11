import { BadRequestException } from '@nestjs/common';
import type { PapelParticipacao } from './entities/participacao.entity.js';

/**
 * Conferência acadêmica (F09). Não há integração com o sistema da faculdade:
 * a coordenação consulta lá e registra aqui o que conferiu, item a item.
 * A aprovação só é aceita depois de uma conferência com todos os requisitos
 * obrigatórios atendidos.
 */
export type ResultadoVerificacao =
  'requisitos_atendidos' | 'requisitos_nao_atendidos';

export interface ItemConferencia {
  id: string;
  descricao: string;
  obrigatorio: boolean;
  /** `papel`: exigência fixa do papel; `programa`: critério do ciclo. */
  origem: 'papel' | 'programa';
}

export interface ItemConferido extends ItemConferencia {
  atende: boolean;
}

export interface VerificacaoAcademica {
  resultado: ResultadoVerificacao;
  itens: ItemConferido[];
  observacoes: string | null;
  /** E-mail de quem registrou a conferência. */
  por: string | null;
  /** ISO 8601. */
  em: string;
}

/** Conteúdo da coluna `participacoes.verificacao`. */
export interface RegistroVerificacao {
  atual: VerificacaoAcademica;
  /** Conferências substituídas, da mais recente para a mais antiga. */
  anteriores: VerificacaoAcademica[];
}

export interface EntradaVerificacao {
  itens?: unknown;
  observacoes?: unknown;
}

interface RequisitoDoCiclo {
  id: string;
  descricao: string;
  obrigatorio: boolean;
}

export const LIMITE_OBSERVACOES_VERIFICACAO = 1000;
export const LIMITE_HISTORICO_VERIFICACAO = 20;

const MATRICULA_ATIVA: ItemConferencia = {
  id: 'matricula_ativa',
  descricao: 'Matrícula ativa no curso informado',
  obrigatorio: true,
  origem: 'papel',
};

/**
 * Itens que a coordenação confere para o papel. Para padrinhos entram também
 * os critérios do programa (a foto respondida pelo candidato, quando houver).
 */
export function itensDaConferencia(
  papel: PapelParticipacao,
  requisitosDoPrograma: RequisitoDoCiclo[] = [],
): ItemConferencia[] {
  if (papel === 'apadrinhado') {
    return [
      MATRICULA_ATIVA,
      {
        id: 'primeiro_periodo',
        descricao: 'Cursando o 1º período (ingressante)',
        obrigatorio: true,
        origem: 'papel',
      },
    ];
  }
  return [
    MATRICULA_ATIVA,
    {
      id: 'periodo_minimo',
      descricao: 'Cursando a partir do 2º período',
      obrigatorio: true,
      origem: 'papel',
    },
    ...requisitosDoPrograma.map((r): ItemConferencia => ({
      id: `programa:${r.id}`,
      descricao: r.descricao,
      obrigatorio: r.obrigatorio === true,
      origem: 'programa',
    })),
  ];
}

/** Valida o que a coordenação marcou e monta o registro da conferência. */
export function montarVerificacao(
  esperados: ItemConferencia[],
  entrada: EntradaVerificacao,
  por: string | undefined,
  agora = new Date(),
): VerificacaoAcademica {
  if (!Array.isArray(entrada?.itens)) {
    throw new BadRequestException(
      'Informe o resultado da conferência de cada requisito.',
    );
  }
  const marcados = new Map<string, boolean>();
  for (const item of entrada.itens as unknown[]) {
    const { id, atende } = (item ?? {}) as { id?: unknown; atende?: unknown };
    if (typeof id !== 'string' || typeof atende !== 'boolean') {
      throw new BadRequestException(
        'Cada item da conferência precisa de id e de atende (sim/não).',
      );
    }
    marcados.set(id, atende);
  }
  const desconhecidos = [...marcados.keys()].filter(
    (id) => !esperados.some((e) => e.id === id),
  );
  if (desconhecidos.length) {
    throw new BadRequestException(
      `Requisito fora da conferência deste papel: ${desconhecidos.join(', ')}.`,
    );
  }
  const faltando = esperados.filter((e) => !marcados.has(e.id));
  if (faltando.length) {
    throw new BadRequestException(
      `Registre a conferência de todos os requisitos. Faltam: ${faltando
        .map((e) => e.descricao)
        .join('; ')}.`,
    );
  }
  const observacoes =
    typeof entrada.observacoes === 'string' ? entrada.observacoes.trim() : '';
  if (observacoes.length > LIMITE_OBSERVACOES_VERIFICACAO) {
    throw new BadRequestException(
      `Observações da conferência: até ${LIMITE_OBSERVACOES_VERIFICACAO} caracteres.`,
    );
  }
  const itens = esperados.map((e) => ({
    ...e,
    atende: marcados.get(e.id) === true,
  }));
  return {
    resultado: itens.every((i) => i.atende || !i.obrigatorio)
      ? 'requisitos_atendidos'
      : 'requisitos_nao_atendidos',
    itens,
    observacoes: observacoes || null,
    por: por?.trim() || null,
    em: agora.toISOString(),
  };
}

/** Nova conferência vira a atual; a anterior vai para o histórico. */
export function acrescentarVerificacao(
  registro: RegistroVerificacao | null | undefined,
  nova: VerificacaoAcademica,
): RegistroVerificacao {
  return {
    atual: nova,
    anteriores: registro
      ? [registro.atual, ...(registro.anteriores ?? [])].slice(
          0,
          LIMITE_HISTORICO_VERIFICACAO,
        )
      : [],
  };
}

/**
 * Aprovação exige conferência registrada, com todos os itens obrigatórios
 * esperados HOJE conferidos e atendidos (se o critério mudou, confere de novo).
 */
export function exigirConferenciaParaAprovar(
  registro: RegistroVerificacao | null | undefined,
  esperados: ItemConferencia[],
): void {
  const atual = registro?.atual;
  if (!atual) {
    throw new BadRequestException(
      'Registre a conferência acadêmica (consulta no sistema da faculdade) antes de aprovar.',
    );
  }
  if (atual.resultado !== 'requisitos_atendidos') {
    throw new BadRequestException(
      'Não é possível aprovar: a conferência acadêmica registrou requisitos obrigatórios não atendidos.',
    );
  }
  const desatualizada = esperados.some(
    (e) =>
      e.obrigatorio &&
      !atual.itens.some((i) => i.id === e.id && i.atende === true),
  );
  if (desatualizada) {
    throw new BadRequestException(
      'Os requisitos do papel mudaram desde a última conferência. Registre a conferência novamente antes de aprovar.',
    );
  }
}
