/**
 * Regras da economia de gamificação (BL-50, DP-24/DP-25). Fonte única: a API
 * calcula nível, progresso e tetos; web e app só exibem o que ela devolve.
 *
 * - XP (`xp_acumulado`) mede a experiência: só sobe com atividades e define o
 *   nível. Desce apenas por correção administrativa (fraude/erro), auditável.
 * - Moedas (`xp_carteiras.saldo`, nome histórico) são o saldo da lojinha: sobem
 *   junto com o XP (1:1 por ora) e descem nos resgates. Estorno de resgate
 *   devolve só moedas.
 */

/** Os 10 níveis. A coordenação não edita estes limiares. */
export const NIVEIS = [
  { numero: 1, nome: 'Primeiro passo', xpMinimo: 0 },
  { numero: 2, nome: 'Curiosidade', xpMinimo: 50 },
  { numero: 3, nome: 'Exploração', xpMinimo: 150 },
  { numero: 4, nome: 'Descoberta', xpMinimo: 300 },
  { numero: 5, nome: 'Conexão', xpMinimo: 500 },
  { numero: 6, nome: 'Parceria', xpMinimo: 750 },
  { numero: 7, nome: 'Mentoria', xpMinimo: 1050 },
  { numero: 8, nome: 'Guia do campus', xpMinimo: 1400 },
  { numero: 9, nome: 'Referência', xpMinimo: 1950 },
  { numero: 10, nome: 'Lenda da PUC', xpMinimo: 2600 },
] as const;

export interface NivelDto {
  numero: number;
  nome: string;
  /** XP em que este nível começa. */
  xpMinimo: number;
  /** XP em que começa o próximo; `null` no nível máximo. */
  proximoXp: number | null;
  /** Nome do próximo nível; `null` no nível máximo. */
  proximoNome: string | null;
  /** XP já feito dentro do nível atual. */
  xpNoNivel: number;
  /** Tamanho do nível atual em XP; `null` no máximo. */
  xpDoNivel: number | null;
  /** Quanto falta para o próximo; 0 no máximo. */
  xpRestante: number;
  /** 0–100, inteiro (para a barra). 100 no máximo. */
  progresso: number;
  maximo: boolean;
}

/** Nível e barra a partir do XP acumulado (aceita XP acima de 2600). */
export function nivelDe(xpAcumulado: number): NivelDto {
  const xp = Math.max(0, Math.floor(xpAcumulado));
  let i = 0;
  while (i + 1 < NIVEIS.length && xp >= NIVEIS[i + 1].xpMinimo) i++;
  const atual = NIVEIS[i];
  const proximo = NIVEIS[i + 1];
  if (!proximo) {
    return {
      numero: atual.numero,
      nome: atual.nome,
      xpMinimo: atual.xpMinimo,
      proximoXp: null,
      proximoNome: null,
      xpNoNivel: xp - atual.xpMinimo,
      xpDoNivel: null,
      xpRestante: 0,
      progresso: 100,
      maximo: true,
    };
  }
  const tamanho = proximo.xpMinimo - atual.xpMinimo;
  const feito = xp - atual.xpMinimo;
  return {
    numero: atual.numero,
    nome: atual.nome,
    xpMinimo: atual.xpMinimo,
    proximoXp: proximo.xpMinimo,
    proximoNome: proximo.nome,
    xpNoNivel: feito,
    xpDoNivel: tamanho,
    xpRestante: proximo.xpMinimo - xp,
    progresso: Math.floor((feito * 100) / tamanho),
    maximo: false,
  };
}

/** Recompensas de totem permitidas (XP; as moedas acompanham 1:1). */
export const RECOMPENSAS_TOTEM = [10, 20, 30, 40, 50] as const;
export const RECOMPENSA_TOTEM_PADRAO = 30;

/** Moedas concedidas por um ganho de XP (proporção inicial 1:1). */
export function moedasPorXp(xp: number): number {
  return xp;
}

/** Tetos de ganho (validados pelo servidor, sob a trava da carteira). */
export const LIMITES = {
  /** XP de totens por aluno e ciclo. */
  totensPorCiclo: 400,
  /** Todo XP de atividades por aluno e ciclo. */
  geralPorCiclo: 1500,
  /** Recompensa de uma missão. */
  porMissao: 100,
  /** XP de missões recorrentes por aluno e semana. */
  missoesSemanais: 60,
  /** Ajuste administrativo individual (positivo ou negativo). */
  ajusteAdmin: 200,
} as const;

/**
 * Ciclo (semestre) de uma data, no fuso de Brasília: jan–jun = 1, jul–dez = 2.
 * Mesma regra do app e de `ParticipacoesService.programaAtual()`.
 */
export function cicloDaData(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(data);
  const ano = partes.find((p) => p.type === 'year')!.value;
  const mes = Number(partes.find((p) => p.type === 'month')!.value);
  return `${ano}/${mes <= 6 ? 1 : 2}`;
}

/**
 * Mesma classificação em SQL, para linhas antigas sem `ciclo` gravado.
 * `coluna` é uma expressão `timestamptz` confiável (nome de coluna fixo).
 */
export function sqlCicloDe(coluna: string): string {
  return (
    `(to_char(${coluna} AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '/' || ` +
    `CASE WHEN extract(month FROM ${coluna} AT TIME ZONE 'America/Sao_Paulo') <= 6 THEN '1' ELSE '2' END)`
  );
}
