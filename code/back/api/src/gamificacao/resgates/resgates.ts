/**
 * Entrega e cancelamento de resgates (F29): vocabulário compartilhado pela
 * API, pela migration (CHECKs) e pelos testes.
 */

/** Desfecho gravado em `resgate_desfechos` (no máximo um por resgate). */
export const DESFECHOS_RESGATE = ['entregue', 'cancelado'] as const;
export type DesfechoResgate = (typeof DESFECHOS_RESGATE)[number];

/** Situação vista por coordenação e aluno: sem desfecho = aguardando. */
export const SITUACOES_RESGATE = [
  'aguardando_entrega',
  'entregue',
  'cancelado',
] as const;
export type SituacaoResgate = (typeof SITUACOES_RESGATE)[number];

/** Justificativa obrigatória do cancelamento administrativo. */
export const MOTIVO_CANCELAMENTO = { min: 3, max: 300 } as const;

/** Prefixo da chave do estorno no ledger: um estorno por resgate. */
export const chaveEstorno = (resgateId: string) => `estorno:${resgateId}`;

/**
 * Colunas da situação de um resgate `r` com `LEFT JOIN resgate_desfechos d`.
 * Usadas pela coordenação e pelo histórico do aluno.
 */
export const COLUNAS_SITUACAO =
  `COALESCE(d."tipo", 'aguardando_entrega') AS "situacao", ` +
  `CASE WHEN d."tipo" = 'entregue' THEN d."criado_em" END AS "entregueEm", ` +
  `CASE WHEN d."tipo" = 'cancelado' THEN d."criado_em" END AS "canceladoEm", ` +
  `d."motivo" AS "motivoCancelamento"`;
