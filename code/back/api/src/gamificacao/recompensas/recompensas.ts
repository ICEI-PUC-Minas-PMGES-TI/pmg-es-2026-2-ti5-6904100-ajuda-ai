/**
 * Lojinha de recompensas (F27): limites e vocabulário compartilhados pela
 * API, pela migration (CHECKs) e pelos testes. O resgate com XP (F28) e a
 * entrega/cancelamento (F29) usam as mesmas tabelas.
 */

export const NOME_RECOMPENSA_MAX = 120;
export const DESCRICAO_RECOMPENSA_MAX = 1000;
export const CONDICOES_RETIRADA_MAX = 1000;
export const IMAGEM_URL_MAX = 500;
export const MOTIVO_ESTOQUE = { min: 3, max: 300 } as const;
export const CUSTO_XP_RECOMPENSA = { min: 1, max: 100_000 } as const;
/** Teto do estoque contra erro de digitação; ilimitado é explícito. */
export const ESTOQUE_MAX = 100_000;
export const LIMITE_POR_ALUNO = { min: 1, max: 100 } as const;

/**
 * - `rascunho`: cadastrada, invisível aos alunos;
 * - `publicada`: disponível para troca (dentro da vigência e do público);
 * - `inativa`: desativada pela coordenação; pode voltar a ser publicada;
 * - `arquivada`: usada em transações e retirada de vez (somente leitura).
 */
export const STATUS_RECOMPENSA = [
  'rascunho',
  'publicada',
  'inativa',
  'arquivada',
] as const;
export type StatusRecompensa = (typeof STATUS_RECOMPENSA)[number];

/** Quem pode ver/trocar a recompensa. */
export const PUBLICOS_RECOMPENSA = [
  'todos',
  'padrinhos',
  'apadrinhados',
] as const;
export type PublicoRecompensa = (typeof PUBLICOS_RECOMPENSA)[number];

/**
 * Registro de estoque:
 * - `inicial`: quantidade do cadastro;
 * - `reposicao`: soma unidades ao total;
 * - `correcao`: redefine o total (perda, contagem, erro);
 * - `ilimitado` / `limitado`: troca o modo do estoque.
 */
export const TIPOS_AJUSTE_ESTOQUE = [
  'inicial',
  'reposicao',
  'correcao',
  'ilimitado',
  'limitado',
] as const;
export type TipoAjusteEstoque = (typeof TIPOS_AJUSTE_ESTOQUE)[number];

/** Campos cuja mudança gera nova versão (condições vistas no resgate). */
export const CAMPOS_VERSIONADOS = [
  'nome',
  'descricao',
  'imagemUrl',
  'custoXp',
  'condicoesRetirada',
] as const;

/** Referência das movimentações de XP de resgate no ledger (F28). */
export const REFERENCIA_RECOMPENSA = 'RECOMPENSA';

/** Só https: a imagem é exibida no app e no painel. */
export const URL_IMAGEM = /^https:\/\/[^\s]+$/i;
