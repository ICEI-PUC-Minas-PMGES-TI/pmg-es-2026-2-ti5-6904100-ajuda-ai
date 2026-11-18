import { nivelDe } from '../gamificacao/economia.js';

export const TIPOS_NOTIFICACAO = [
  'MISSAO_NOVA',
  'NIVEL_SUBIU',
  'RESGATE_ENTREGUE',
  'RESGATE_CANCELADO',
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

export const TITULO_NOTIFICACAO_MAX = 120;
export const MENSAGEM_NOTIFICACAO_MAX = 500;
export const LINK_NOTIFICACAO_MAX = 200;
export const CHAVE_NOTIFICACAO_MAX = 120;
export const LIMITE_NOTIFICACOES = { padrao: 20, max: 50 } as const;

export const ID_NOTIFICACAO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NovaNotificacao {
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  link: string | null;
  chave: string;
}

export interface NotificacaoDto {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida: boolean;
  lidaEm: string | null;
  criadoEm: string;
}

export interface NotificacoesDto {
  naoLidas: number;
  itens: NotificacaoDto[];
}

export function notificacaoMissaoNova(missao: {
  id: string;
  titulo: string;
  xp: number;
}): NovaNotificacao {
  return {
    tipo: 'MISSAO_NOVA',
    titulo: 'Nova missão disponível',
    mensagem: `${missao.titulo} · ${missao.xp} XP`,
    link: '/missoes',
    chave: `missao-nova:${missao.id}`,
  };
}

export function notificacaoNivel(xpAcumulado: number): NovaNotificacao {
  const nivel = nivelDe(xpAcumulado);
  return {
    tipo: 'NIVEL_SUBIU',
    titulo: `Você subiu para o nível ${nivel.numero}!`,
    mensagem: nivel.maximo
      ? `Agora você é ${nivel.nome}, o nível máximo.`
      : `Agora você é ${nivel.nome}. Faltam ${nivel.xpRestante} XP para ${nivel.proximoNome}.`,
    link: '/perfil',
    chave: `nivel:${nivel.numero}`,
  };
}

export function notificacaoResgate(
  desfecho: 'entregue' | 'cancelado',
  resgate: { id: string; nome: string },
): NovaNotificacao {
  const entregue = desfecho === 'entregue';
  return {
    tipo: entregue ? 'RESGATE_ENTREGUE' : 'RESGATE_CANCELADO',
    titulo: entregue ? 'Resgate entregue' : 'Resgate cancelado',
    mensagem: entregue
      ? `${resgate.nome} foi marcada como entregue.`
      : `${resgate.nome} foi cancelado e as moedas voltaram para a sua carteira.`,
    link: `/lojinha/resgates/${resgate.id}`,
    chave: `resgate-${desfecho}:${resgate.id}`,
  };
}
