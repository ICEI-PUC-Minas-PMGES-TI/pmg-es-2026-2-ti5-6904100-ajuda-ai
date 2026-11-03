import { randomUUID } from 'node:crypto';

export const TIPOS_EVENTO_FEED = [
  'feed.post.created',
  'feed.post.updated',
  'feed.post.deleted',
  'feed.comment.created',
  'feed.comment.deleted',
  'feed.comment.like.updated',
  'feed.like.updated',
] as const;
export type TipoEventoFeed = (typeof TIPOS_EVENTO_FEED)[number];
export interface EventoFeed {
  id: string;
  tipo: TipoEventoFeed;
  ocorridoEm: string;
  publicacaoId: number;
}

export function novoEventoFeed(
  tipo: TipoEventoFeed,
  publicacaoId: number,
): EventoFeed {
  return {
    id: randomUUID(),
    tipo,
    publicacaoId,
    ocorridoEm: new Date().toISOString(),
  };
}

/** Eventos de invalidação: nunca levam JWT, e-mail, texto privado ou SAS. */
export function eventoFeedValido(valor: unknown): valor is EventoFeed {
  if (!valor || typeof valor !== 'object') return false;
  const e = valor as EventoFeed;
  return (
    typeof e.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(e.id) &&
    TIPOS_EVENTO_FEED.includes(e.tipo) &&
    Number.isSafeInteger(e.publicacaoId) &&
    e.publicacaoId > 0 &&
    typeof e.ocorridoEm === 'string' &&
    Number.isFinite(Date.parse(e.ocorridoEm))
  );
}
