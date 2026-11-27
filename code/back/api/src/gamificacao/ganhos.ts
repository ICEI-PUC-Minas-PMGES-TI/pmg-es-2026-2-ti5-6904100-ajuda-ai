import type { QueryRunner } from 'typeorm';
import { LIMITES, moedasPorXp, sqlCicloDe } from './economia.js';
import {
  registrarMovimentacao,
  type MovimentacaoRegistrada,
  SCHEMA_GAMIFICACAO,
} from './gamificacao.js';

const g = `"${SCHEMA_GAMIFICACAO}"`;

/** Origem de um ganho de atividade (decide qual teto se aplica). */
export type FonteGanho = 'TOTEM' | 'MISSAO' | 'CONQUISTA';

/**
 * XP de atividades: totens, missões e conquistas (ajustes e resgates ficam
 * de fora). A conquista entra no teto geral do ciclo como as outras.
 */
const TIPOS_ATIVIDADE = `('PUCSTOP_CLAIM', 'MISSAO', 'CONQUISTA')`;
const efeitoXp = `COALESCE(mv."xp_quantidade", CASE WHEN mv."tipo" = 'RECOMPENSA' THEN 0 ELSE mv."quantidade" END)`;

const TIPO_DA_FONTE = {
  TOTEM: 'PUCSTOP_CLAIM',
  MISSAO: 'MISSAO',
  CONQUISTA: 'CONQUISTA',
} as const satisfies Record<FonteGanho, string>;

export interface UsoDoCiclo {
  ciclo: string;
  /** XP de totens creditado neste ciclo. */
  totens: number;
  /** XP de todas as atividades (totens, missões, conquistas) creditado neste ciclo. */
  geral: number;
  /** XP de missões recorrentes nesta semana (Brasília). */
  missoesSemana: number;
}

/**
 * Quanto o usuário já ganhou no ciclo (e na semana). Linhas antigas sem
 * `ciclo` contam pelo semestre da data, em Brasília.
 */
export async function usoDoCiclo(
  executor: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  usuarioId: number,
  ciclo: string,
): Promise<UsoDoCiclo> {
  const [linha] = (await executor.query(
    `SELECT ` +
      `(SELECT COALESCE(sum("xp"), 0)::int FROM ${g}."pucstop_coletas" WHERE "usuario_id" = $1 AND "ciclo" = $2) AS totens, ` +
      `(SELECT COALESCE(sum(${efeitoXp}), 0)::int FROM ${g}."xp_movimentacoes" mv WHERE mv."usuario_id" = $1 ` +
      `AND mv."tipo" IN ${TIPOS_ATIVIDADE} AND COALESCE(mv."ciclo", ${sqlCicloDe('mv."criado_em"')}) = $2) AS geral, ` +
      `(SELECT COALESCE(sum(${efeitoXp}), 0)::int FROM ${g}."xp_movimentacoes" mv WHERE mv."usuario_id" = $1 ` +
      `AND mv."tipo" = 'MISSAO' AND mv."referencia_tipo" = 'MISSAO_SEMANAL' ` +
      `AND mv."criado_em" >= (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')) AS semana`,
    [usuarioId, ciclo],
  )) as Array<{ totens: number; geral: number; semana: number }>;
  return {
    ciclo,
    totens: linha.totens,
    geral: linha.geral,
    missoesSemana: linha.semana,
  };
}

export interface GanhoSolicitado {
  usuarioId: number;
  fonte: FonteGanho;
  /** XP pedido (valor configurado do totem/missão). */
  xp: number;
  /** Missão recorrente semanal: também consome o teto semanal. */
  recorrenteSemanal?: boolean;
  ciclo: string;
  referenciaTipo: string;
  referenciaId: string;
  descricao: string;
  chaveIdempotencia: string;
}

export interface GanhoCreditado {
  /** XP pedido (configurado). */
  xpConfigurado: number;
  /** XP efetivamente creditado (0 se o teto já estava cheio). */
  xp: number;
  moedas: number;
  /** Algum teto cortou o ganho. */
  limitado: boolean;
  /** Teto que cortou primeiro. */
  teto: 'totens' | 'ciclo' | 'semanal' | null;
  /** `null` quando nada foi creditado (sem movimentação). */
  movimentacao: MovimentacaoRegistrada | null;
}

/**
 * Credita um ganho de atividade respeitando os tetos (totens/ciclo, geral/
 * ciclo e semanal de missões recorrentes). Precisa rodar com a carteira do
 * usuário já travada (`travarCarteira`): assim duas coletas simultâneas se
 * enfileiram e nunca furam o teto. Se o restante for menor que o pedido,
 * credita só o restante (XP e moedas 1:1).
 */
export async function creditarGanho(
  qr: QueryRunner,
  pedido: GanhoSolicitado,
): Promise<GanhoCreditado> {
  if (!qr.isTransactionActive) {
    throw new Error('Ganho de XP exige transação aberta.');
  }
  if (!Number.isSafeInteger(pedido.xp) || pedido.xp <= 0) {
    throw new Error('Ganho de XP inválido.');
  }
  if (pedido.fonte === 'MISSAO' && pedido.xp > LIMITES.porMissao) {
    throw new Error(`Missão limitada a ${LIMITES.porMissao} XP.`);
  }
  if (pedido.fonte === 'CONQUISTA' && pedido.xp > LIMITES.porConquista) {
    throw new Error(`Conquista limitada a ${LIMITES.porConquista} XP.`);
  }
  const uso = await usoDoCiclo(qr, pedido.usuarioId, pedido.ciclo);
  const restantes: Array<[GanhoCreditado['teto'], number]> = [
    ['ciclo', LIMITES.geralPorCiclo - uso.geral],
  ];
  if (pedido.fonte === 'TOTEM')
    restantes.push(['totens', LIMITES.totensPorCiclo - uso.totens]);
  if (pedido.fonte === 'MISSAO' && pedido.recorrenteSemanal)
    restantes.push(['semanal', LIMITES.missoesSemanais - uso.missoesSemana]);

  let xp = pedido.xp;
  let teto: GanhoCreditado['teto'] = null;
  for (const [nome, restante] of restantes) {
    const livre = Math.max(0, restante);
    if (livre < xp) {
      xp = livre;
      teto = nome;
    }
  }
  if (xp === 0) {
    return {
      xpConfigurado: pedido.xp,
      xp: 0,
      moedas: 0,
      limitado: true,
      teto,
      movimentacao: null,
    };
  }
  const moedas = moedasPorXp(xp);
  const movimentacao = await registrarMovimentacao(qr, {
    usuarioId: pedido.usuarioId,
    quantidade: moedas,
    xp,
    ciclo: pedido.ciclo,
    tipo: TIPO_DA_FONTE[pedido.fonte],
    referenciaTipo: pedido.referenciaTipo,
    referenciaId: pedido.referenciaId,
    descricao: pedido.descricao,
    chaveIdempotencia: pedido.chaveIdempotencia,
  });
  return {
    xpConfigurado: pedido.xp,
    xp,
    moedas,
    limitado: xp < pedido.xp,
    teto,
    movimentacao,
  };
}
