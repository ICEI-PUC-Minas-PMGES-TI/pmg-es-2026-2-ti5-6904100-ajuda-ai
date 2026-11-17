import { LIMITES } from '../economia.js';
import type { UsoDoCiclo } from '../ganhos.js';

export const TIPOS_MISSAO = ['UNICA', 'SEMANAL'] as const;
export type TipoMissao = (typeof TIPOS_MISSAO)[number];

export const TITULO_MISSAO_MAX = 120;
export const DESCRICAO_MISSAO_MAX = 1000;

export function xpMaximoDe(tipo: TipoMissao): number {
  return tipo === 'SEMANAL' ? LIMITES.missoesSemanais : LIMITES.porMissao;
}

export const ID_MISSAO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function semanaDe(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data);
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)!.value);
  const dia = new Date(
    Date.UTC(valor('year'), valor('month') - 1, valor('day')),
  );
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7));
  return dia.toISOString().slice(0, 10);
}

export function xpPrevisto(
  xp: number,
  tipo: TipoMissao,
  uso: Pick<UsoDoCiclo, 'geral' | 'missoesSemana'>,
): number {
  let livre = Math.min(xp, Math.max(0, LIMITES.geralPorCiclo - uso.geral));
  if (tipo === 'SEMANAL') {
    livre = Math.min(
      livre,
      Math.max(0, LIMITES.missoesSemanais - uso.missoesSemana),
    );
  }
  return livre;
}

export function chaveConclusao(
  missaoId: string,
  usuarioId: number,
  periodo: string,
): string {
  return `missao:${missaoId}:${usuarioId}:${periodo}`;
}
