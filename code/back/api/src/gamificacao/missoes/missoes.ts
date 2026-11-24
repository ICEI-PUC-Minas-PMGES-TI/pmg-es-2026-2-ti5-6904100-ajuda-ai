import { LIMITES } from '../economia.js';
import type { UsoDoCiclo } from '../ganhos.js';

export const TIPOS_MISSAO = ['UNICA', 'SEMANAL'] as const;
export type TipoMissao = (typeof TIPOS_MISSAO)[number];

export const TITULO_MISSAO_MAX = 120;
export const DESCRICAO_MISSAO_MAX = 1000;

export function xpMaximoDe(tipo: TipoMissao): number {
  return tipo === 'SEMANAL' ? LIMITES.missoesSemanais : LIMITES.porMissao;
}

export const REQUISITOS_MISSAO = [
  'PUCSTOPS',
  'EVENTO',
  'FEED_PUBLICACOES',
  'FEED_COMENTARIOS',
  'FEED_CURTIDAS',
  'CHAT_MENSAGENS',
  'CODIGO',
] as const;
export type RequisitoMissao = (typeof REQUISITOS_MISSAO)[number];

export const REQUISITOS_CONTADOS: readonly RequisitoMissao[] = [
  'PUCSTOPS',
  'FEED_PUBLICACOES',
  'FEED_COMENTARIOS',
  'FEED_CURTIDAS',
  'CHAT_MENSAGENS',
];

export const QUANTIDADE_MISSAO_MAX = 20;
export const COMENTARIO_MISSAO_MIN = 10;
export const MENSAGEM_MISSAO_MIN = 2;
export const CHECKIN_ANTECEDENCIA_MIN = 30;
export const RAIO_EVENTO_METROS = 60;
export const CODIGO_MISSAO = /^[A-Z0-9-]{4,20}$/;
export const TENTATIVAS_CODIGO_POR_HORA = 5;

export function normalizarCodigo(codigo: string): string {
  return codigo.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

export function sqlMissaoVisivel(m: string): string {
  return `${m}."ativa" AND ${m}."requisito" IS NOT NULL AND (${m}."inicio" IS NULL OR ${m}."inicio" <= now()) AND (${m}."fim" IS NULL OR ${m}."fim" > now())`;
}

export interface AcessoMissoes {
  podePublicar: boolean;
  temPar: boolean;
}

export function sqlMissaoAlcancavel(m: string, acesso: AcessoMissoes): string {
  const fora: string[] = [];
  if (!acesso.podePublicar) fora.push(`'FEED_PUBLICACOES'`);
  if (!acesso.temPar) fora.push(`'CHAT_MENSAGENS'`);
  return fora.length ? `${m}."requisito" NOT IN (${fora.join(', ')})` : 'TRUE';
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
