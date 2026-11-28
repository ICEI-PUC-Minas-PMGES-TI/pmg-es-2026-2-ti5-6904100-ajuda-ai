import { SCHEMA_MAPA } from '../../mapa/postgis.js';
import { LIMITES } from '../economia.js';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';
import type { UsoDoCiclo } from '../ganhos.js';

export const TIPOS_MISSAO = ['UNICA', 'SEMANAL'] as const;
export type TipoMissao = (typeof TIPOS_MISSAO)[number];

export const TITULO_MISSAO_MAX = 120;
export const DESCRICAO_MISSAO_MAX = 1000;
export const INSTRUCOES_MISSAO_MAX = 1000;

/** Quem vê a missão. O requisito ainda pode restringir (publicar, chat). */
export const PUBLICOS_MISSAO = ['TODOS', 'PADRINHOS', 'APADRINHADOS'] as const;
export type PublicoMissao = (typeof PUBLICOS_MISSAO)[number];

/**
 * Ciclo de vida, derivado de `ativa` e `publicada_em`:
 * rascunho (nunca publicada; edita e exclui), publicada (critérios e
 * recompensa congelados) e arquivada (definitiva; conclusões ficam).
 */
export const ESTADOS_MISSAO = ['rascunho', 'publicada', 'arquivada'] as const;
export type EstadoMissao = (typeof ESTADOS_MISSAO)[number];

export function estadoDaMissao(
  ativa: boolean,
  publicadaEm: Date | string | null,
): EstadoMissao {
  if (ativa) return 'publicada';
  return publicadaEm ? 'arquivada' : 'rascunho';
}

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
  'ENCONTRO',
] as const;
export type RequisitoMissao = (typeof REQUISITOS_MISSAO)[number];

export const REQUISITOS_CONTADOS: readonly RequisitoMissao[] = [
  'PUCSTOPS',
  'FEED_PUBLICACOES',
  'FEED_COMENTARIOS',
  'FEED_CURTIDAS',
  'CHAT_MENSAGENS',
  'ENCONTRO',
];

export const QUANTIDADE_MISSAO_MAX = 20;
export const COMENTARIO_MISSAO_MIN = 10;
export const PUBLICACAO_MISSAO_MIN = 10;
export const MENSAGEM_MISSAO_MIN = 10;
export const CHECKIN_ANTECEDENCIA_MIN = 30;
export const RAIO_EVENTO_METROS = 60;
export const CODIGO_MISSAO = /^[A-Z0-9-]{4,20}$/;
/** Quanto tempo a coordenação deixa o código valendo de uma vez. */
export const MINUTOS_CODIGO_MAX = 120;
export const TENTATIVAS_CODIGO_POR_HORA = 5;
export const JANELA_TENTATIVAS_CODIGO = '1 hour';

export function normalizarCodigo(codigo: string): string {
  return codigo.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

export function sqlMissaoVisivel(m: string): string {
  return `${m}."ativa" AND ${m}."requisito" IS NOT NULL AND (${m}."inicio" IS NULL OR ${m}."inicio" <= now()) AND (${m}."fim" IS NULL OR ${m}."fim" > now())`;
}

const mp = `"${SCHEMA_MAPA}"`;
const VERSAO_ATIVA = `(SELECT "id" FROM ${mp}."versoes" WHERE "status" = 'ativa')`;

export function sqlLocalEvento(e: string): string {
  return `COALESCE(lp."poligono", lp."localizacao", la."poligono", la."localizacao", ${e}."localizacao")`;
}

export function joinsEvento(e: string): string {
  return (
    `LEFT JOIN ${mp}."predios" lp ON lp."versao_id" = ${VERSAO_ATIVA} AND lp."id" = ${e}."predio_id" ` +
    `LEFT JOIN ${mp}."areas" la ON la."versao_id" = ${VERSAO_ATIVA} AND la."id" = ${e}."area_id"`
  );
}

export function sqlMissaoCumprivel(m: string): string {
  const doRoteiro = (coluna: string) =>
    `(${m}."pucstops" IS NULL OR ${coluna} = ANY(${m}."pucstops"))`;
  return (
    `(CASE ${m}."requisito" ` +
    `WHEN 'PUCSTOPS' THEN EXISTS (SELECT 1 FROM "${SCHEMA_GAMIFICACAO}"."pucstop_coletas" col WHERE col."usuario_id" = $1 AND col."ciclo" = ${m}."ciclo" AND ${doRoteiro('col."pucstop_id"')}) ` +
    `OR EXISTS (SELECT 1 FROM ${mp}."pucstops" pto WHERE pto."ativo" AND ${doRoteiro('pto."id"')}) ` +
    `WHEN 'EVENTO' THEN EXISTS (SELECT 1 FROM ${mp}."eventos" evc ${joinsEvento('evc')} ` +
    `WHERE evc."id" = ${m}."alvo_id" AND evc."ativo" AND ${sqlLocalEvento('evc')} IS NOT NULL ` +
    `AND GREATEST(now(), ${m}."inicio", evc."inicio" - interval '${CHECKIN_ANTECEDENCIA_MIN} minutes') < LEAST(${m}."fim", evc."fim")) ` +
    `ELSE true END)`
  );
}

export interface AcessoMissoes {
  podePublicar: boolean;
  temPar: boolean;
  /** Papel no ciclo; sem papel, só as missões para todos. */
  papel?: 'padrinho' | 'apadrinhado' | null;
}

const PUBLICO_DO_PAPEL = {
  padrinho: 'PADRINHOS',
  apadrinhado: 'APADRINHADOS',
} as const satisfies Record<string, PublicoMissao>;

export function sqlMissaoAlcancavel(m: string, acesso: AcessoMissoes): string {
  const fora: string[] = [];
  if (!acesso.podePublicar) fora.push(`'FEED_PUBLICACOES'`);
  if (!acesso.temPar) fora.push(`'CHAT_MENSAGENS'`);
  // Valores de um mapa fixo, nunca do cliente.
  const publicos = [`'TODOS'`];
  if (acesso.papel) publicos.push(`'${PUBLICO_DO_PAPEL[acesso.papel]}'`);
  const condicoes = [`${m}."publico" IN (${publicos.join(', ')})`];
  if (fora.length) {
    condicoes.push(`${m}."requisito" NOT IN (${fora.join(', ')})`);
  }
  return `(${condicoes.join(' AND ')})`;
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
