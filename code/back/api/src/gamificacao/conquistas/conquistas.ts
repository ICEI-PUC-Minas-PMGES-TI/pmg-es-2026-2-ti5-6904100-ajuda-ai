import { LIMITES } from '../economia.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';
import {
  COMENTARIO_MISSAO_MIN,
  PUBLICACAO_MISSAO_MIN,
} from '../missoes/missoes.js';

/**
 * Conquistas (F32): a coordenação define, o servidor confere o progresso
 * real e desbloqueia. Nada é marcado pelo cliente.
 */

export const NOME_CONQUISTA_MAX = 80;
export const DESCRICAO_CONQUISTA_MAX = 500;
export const IMAGEM_CONQUISTA_MAX = 500;

/** Quem pode desbloquear. Mesmos valores das missões. */
export const PUBLICOS_CONQUISTA = ['TODOS', 'PADRINHOS', 'APADRINHADOS'] as const;
export type PublicoConquista = (typeof PUBLICOS_CONQUISTA)[number];

/**
 * Ciclo de vida, derivado de `ativa` e `publicada_em` (igual às missões):
 * rascunho (nunca publicada), publicada (critério, meta, público, programa e
 * XP congelados) e arquivada (sai da vitrine; quem já obteve continua com ela).
 */
export const ESTADOS_CONQUISTA = ['rascunho', 'publicada', 'arquivada'] as const;
export type EstadoConquista = (typeof ESTADOS_CONQUISTA)[number];

export function estadoDaConquista(
  ativa: boolean,
  publicadaEm: Date | string | null,
): EstadoConquista {
  if (ativa) return 'publicada';
  return publicadaEm ? 'arquivada' : 'rascunho';
}

/**
 * Onde o progresso é contado:
 * - `CICLO`: só o que o aluno fez no semestre (pode desbloquear de novo em
 *   outro semestre);
 * - `GERAL`: a carreira inteira (desbloqueia uma vez só).
 */
export type EscopoConquista = 'CICLO' | 'GERAL';

export const CONTEXTO_GERAL = 'GERAL';

/** Condições suportadas. Critério fora desta lista é recusado (400). */
export const CRITERIOS_CONQUISTA = [
  'MISSOES_CONCLUIDAS',
  'PUCSTOPS_COLETADOS',
  'FEED_PUBLICACOES',
  'FEED_COMENTARIOS',
  'NIVEL_ALCANCADO',
] as const;
export type CriterioConquista = (typeof CRITERIOS_CONQUISTA)[number];

export interface DefinicaoCriterio {
  criterio: CriterioConquista;
  rotulo: string;
  escopo: EscopoConquista;
  metaMin: number;
  metaMax: number;
}

export const DEFINICAO_CRITERIOS: Record<CriterioConquista, DefinicaoCriterio> = {
  MISSOES_CONCLUIDAS: {
    criterio: 'MISSOES_CONCLUIDAS',
    rotulo: 'Missões concluídas no semestre',
    escopo: 'CICLO',
    metaMin: 1,
    metaMax: 50,
  },
  PUCSTOPS_COLETADOS: {
    criterio: 'PUCSTOPS_COLETADOS',
    rotulo: 'PucStops coletados no semestre',
    escopo: 'CICLO',
    metaMin: 1,
    metaMax: 50,
  },
  FEED_PUBLICACOES: {
    criterio: 'FEED_PUBLICACOES',
    rotulo: 'Publicações no feed no semestre',
    escopo: 'CICLO',
    metaMin: 1,
    metaMax: 50,
  },
  FEED_COMENTARIOS: {
    criterio: 'FEED_COMENTARIOS',
    rotulo: 'Posts de colegas comentados no semestre',
    escopo: 'CICLO',
    metaMin: 1,
    metaMax: 50,
  },
  NIVEL_ALCANCADO: {
    criterio: 'NIVEL_ALCANCADO',
    rotulo: 'Nível alcançado',
    escopo: 'GERAL',
    metaMin: 2,
    metaMax: 10,
  },
};

/** Texto do critério para o aluno ("conhecer seus critérios"). */
export function textoCriterio(criterio: CriterioConquista, meta: number): string {
  const plural = (n: number, um: string, varios: string) =>
    `${n} ${n === 1 ? um : varios}`;
  switch (criterio) {
    case 'MISSOES_CONCLUIDAS':
      return `Concluir ${plural(meta, 'missão', 'missões')} no semestre.`;
    case 'PUCSTOPS_COLETADOS':
      return `Coletar ${plural(meta, 'PucStop', 'PucStops')} no semestre.`;
    case 'FEED_PUBLICACOES':
      return `Fazer ${plural(meta, 'publicação', 'publicações')} no feed no semestre (com ${PUBLICACAO_MISSAO_MIN}+ caracteres ou foto).`;
    case 'FEED_COMENTARIOS':
      return `Comentar em ${plural(meta, 'post', 'posts')} de colegas no semestre (com ${COMENTARIO_MISSAO_MIN}+ caracteres).`;
    case 'NIVEL_ALCANCADO':
      return `Chegar ao nível ${meta}.`;
  }
}

/**
 * Motivo da recusa de uma combinação, ou `null` se é válida. Fonte única:
 * serviço (400) e testes. O CHECK do banco repete as faixas.
 */
export function problemaDaRegra(regra: {
  criterio: string;
  meta: number;
  publico: PublicoConquista;
  xp: number;
}): string | null {
  if (!(CRITERIOS_CONQUISTA as readonly string[]).includes(regra.criterio)) {
    return 'Critério não suportado.';
  }
  const def = DEFINICAO_CRITERIOS[regra.criterio as CriterioConquista];
  if (
    !Number.isInteger(regra.meta) ||
    regra.meta < def.metaMin ||
    regra.meta > def.metaMax
  ) {
    return `Para "${def.rotulo}", a meta vai de ${def.metaMin} a ${def.metaMax}.`;
  }
  if (regra.publico === 'APADRINHADOS' && regra.criterio === 'FEED_PUBLICACOES') {
    return 'Só padrinhos com dupla publicam no feed: escolha outro público ou outro critério.';
  }
  if (
    !Number.isInteger(regra.xp) ||
    regra.xp < 0 ||
    regra.xp > LIMITES.porConquista
  ) {
    return `O XP da conquista vai de 0 a ${LIMITES.porConquista}.`;
  }
  return null;
}

/** Contexto de um desbloqueio: o ciclo, ou `GERAL` nos critérios de carreira. */
export function contextoDe(criterio: CriterioConquista, ciclo: string): string {
  return DEFINICAO_CRITERIOS[criterio].escopo === 'GERAL' ? CONTEXTO_GERAL : ciclo;
}

/**
 * Chave do crédito de XP no ledger: um crédito por conquista, aluno e
 * contexto. É de tipo `CONQUISTA`, separada da chave da missão
 * (`missao:...`): concluir missões nunca credita a missão de novo.
 */
export function chaveConquista(
  conquistaId: string,
  usuarioId: number,
  contexto: string,
): string {
  return `conquista:${conquistaId}:${usuarioId}:${contexto}`;
}

const g = `"${SCHEMA_GAMIFICACAO}"`;

/**
 * Progresso dos critérios contados no banco, para um aluno e um ciclo.
 * Parâmetros: $1 usuário, $2 e-mail em minúsculas, $3 ciclo. Mesmas regras
 * de contagem das missões (tamanho mínimo, posts de colegas), mas no
 * semestre inteiro: a conquista reconhece o que o aluno já fez no ciclo.
 * `NIVEL_ALCANCADO` sai do XP acumulado (fora daqui).
 */
export function sqlProgressoConquistas(u: string): string {
  return (
    `SELECT ` +
    `(SELECT count(*) FROM ${g}."missoes_conclusoes" mc WHERE mc."usuario_id" = $1 AND mc."ciclo" = $3)::int AS missoes, ` +
    `(SELECT count(*) FROM ${g}."pucstop_coletas" pc WHERE pc."usuario_id" = $1 AND pc."ciclo" = $3)::int AS pucstops, ` +
    `(SELECT count(*) FROM ${u}."publicacoes" p WHERE lower(p."owner_id") = $2 AND p."programa_codigo" = $3 ` +
    `AND (char_length(btrim(COALESCE(p."texto", ''))) >= ${PUBLICACAO_MISSAO_MIN} OR COALESCE(cardinality(p."imagens"), 0) > 0))::int AS publicacoes, ` +
    `(SELECT count(DISTINCT k."publicacao_id") FROM ${u}."comentarios" k JOIN ${u}."publicacoes" p ON p."id" = k."publicacao_id" ` +
    `WHERE lower(k."autor_id") = $2 AND lower(p."owner_id") <> $2 AND p."programa_codigo" = $3 ` +
    `AND char_length(btrim(k."texto")) >= ${COMENTARIO_MISSAO_MIN})::int AS comentarios, ` +
    `COALESCE((SELECT c."xp_acumulado" FROM ${g}."xp_carteiras" c WHERE c."usuario_id" = $1), 0)::int AS xp`
  );
}

export interface ContagensConquista {
  missoes: number;
  pucstops: number;
  publicacoes: number;
  comentarios: number;
  /** Nível atual (de `nivelDe(xp)`). */
  nivel: number;
}

export function progressoDe(
  criterio: CriterioConquista,
  c: ContagensConquista,
): number {
  switch (criterio) {
    case 'MISSOES_CONCLUIDAS':
      return c.missoes;
    case 'PUCSTOPS_COLETADOS':
      return c.pucstops;
    case 'FEED_PUBLICACOES':
      return c.publicacoes;
    case 'FEED_COMENTARIOS':
      return c.comentarios;
    case 'NIVEL_ALCANCADO':
      return c.nivel;
  }
}

export const ID_CONQUISTA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Filtro de quem pode desbloquear, numa conquista `c` publicada:
 * público do papel e programa (nulo = todos os ciclos). Valores fixos,
 * nunca do cliente; o ciclo vai como parâmetro `$n`.
 */
export function sqlConquistaElegivel(
  c: string,
  papel: 'padrinho' | 'apadrinhado' | null,
  parametroCiclo: string,
  podePublicar: boolean,
): string {
  const publicos = [`'TODOS'`];
  if (papel === 'padrinho') publicos.push(`'PADRINHOS'`);
  if (papel === 'apadrinhado') publicos.push(`'APADRINHADOS'`);
  const condicoes = [
    `${c}."ativa"`,
    `${c}."publico" IN (${publicos.join(', ')})`,
    `(${c}."programa_codigo" IS NULL OR ${c}."programa_codigo" = ${parametroCiclo})`,
  ];
  // Quem não pode publicar no feed não vê conquista impossível para ele.
  if (!podePublicar) condicoes.push(`${c}."criterio" <> 'FEED_PUBLICACOES'`);
  return `(${condicoes.join(' AND ')})`;
}
