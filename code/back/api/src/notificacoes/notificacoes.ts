import { nivelDe } from '../gamificacao/economia.js';

export const TIPOS_NOTIFICACAO = [
  'MISSAO_NOVA',
  'NIVEL_SUBIU',
  'RESGATE_ENTREGUE',
  'RESGATE_CANCELADO',
  'CANDIDATURA_APROVADA',
  'CANDIDATURA_NAO_APROVADA',
  'VINCULO_CONFIRMADO',
  'CONVITE_ENCONTRO',
  'ENCONTRO_ALTERADO',
  'ENCONTRO_CANCELADO',
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

export const TITULO_NOTIFICACAO_MAX = 120;
export const MENSAGEM_NOTIFICACAO_MAX = 500;
export const LINK_NOTIFICACAO_MAX = 200;
export const CHAVE_NOTIFICACAO_MAX = 120;
export const LIMITE_NOTIFICACOES = { padrao: 20, max: 50 } as const;
export const CHAVE_MISSAO_NOVA = 'missao-nova:';

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
  /** Há notificações mais antigas: pedir de novo com `antes` = último id. */
  temMais: boolean;
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
    chave: `${CHAVE_MISSAO_NOVA}${missao.id}`,
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
      ? `Seu resgate de ${resgate.nome} foi entregue.`
      : `Seu resgate de ${resgate.nome} foi cancelado e as moedas voltaram para a sua carteira.`,
    link: `/lojinha/resgates/${resgate.id}`,
    chave: `resgate-${desfecho}:${resgate.id}`,
  };
}

function linkDoCiclo(caminho: string, programa: string): string {
  return `${caminho}?ciclo=${encodeURIComponent(programa)}`;
}

export function notificacaoCandidatura(
  resultado: 'aprovado' | 'nao_aprovado' | 'revogado',
  decisao: { programa: string; em: string },
): NovaNotificacao {
  const textos = {
    aprovado: [
      'Candidatura aprovada',
      `Sua candidatura ao apadrinhamento ${decisao.programa} foi aprovada. Avisaremos quando sua dupla for definida.`,
    ],
    nao_aprovado: [
      'Candidatura não aprovada',
      `Sua candidatura ao apadrinhamento ${decisao.programa} não foi aprovada. Veja a justificativa da coordenação.`,
    ],
    // Quem já recebeu "aprovada" não deve ler "não foi aprovada".
    revogado: [
      'Aprovação revogada',
      `A coordenação revogou a aprovação da sua candidatura ao apadrinhamento ${decisao.programa}. Veja a justificativa.`,
    ],
  } as const;
  const [titulo, mensagem] = textos[resultado];
  return {
    tipo:
      resultado === 'aprovado'
        ? 'CANDIDATURA_APROVADA'
        : 'CANDIDATURA_NAO_APROVADA',
    titulo,
    mensagem,
    link: linkDoCiclo('/candidatura', decisao.programa),
    // Um aviso por decisão: revogar ou decidir de novo gera outro.
    chave: `candidatura:${decisao.programa}:${decisao.em}`,
  };
}

/** Prefixo das chaves de vínculo do ciclo; depois dele vem a outra pessoa. */
export function prefixoVinculo(programa: string): string {
  return `vinculo:${programa}:`;
}

/**
 * Um aviso por pessoa nova na dupla (`parceiroId` é a participação dela):
 * trocar de padrinho ou ganhar outro apadrinhado no mesmo ciclo avisa de
 * novo. O primeiro aviso do ciclo dá as boas-vindas; os seguintes dizem
 * que a dupla mudou.
 */
export function notificacaoVinculo(
  programa: string,
  papel: 'padrinho' | 'apadrinhado',
  parceiroId: number,
  primeiro = true,
): NovaNotificacao {
  const textos = {
    padrinho: primeiro
      ? [
          'Seu apadrinhamento começou!',
          'Veja quem você vai acompanhar neste semestre e mande a primeira mensagem.',
        ]
      : [
          'Você tem um novo apadrinhado!',
          'Veja quem chegou e mande a primeira mensagem.',
        ],
    apadrinhado: primeiro
      ? [
          'Seu padrinho foi definido!',
          'Conheça quem vai te acompanhar neste semestre e mande a primeira mensagem.',
        ]
      : [
          'Você tem um novo padrinho!',
          'A coordenação mudou quem vai te acompanhar neste semestre. Conheça e mande a primeira mensagem.',
        ],
  } as const;
  const [titulo, mensagem] = textos[papel];
  return {
    tipo: 'VINCULO_CONFIRMADO',
    titulo,
    mensagem,
    link: linkDoCiclo('/dupla', programa),
    chave: `${prefixoVinculo(programa)}${parceiroId}`,
  };
}

function quandoDoEncontro(inicio: Date): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(inicio);
  const parte = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('day')}/${parte('month')} às ${parte('hour')}:${parte('minute')}`;
}

export interface EncontroParaAviso {
  id: string;
  inicio: Date;
  local: string;
}

export function notificacaoConviteEncontro(
  encontro: EncontroParaAviso,
): NovaNotificacao {
  return {
    tipo: 'CONVITE_ENCONTRO',
    titulo: 'Convite para um encontro',
    mensagem: `Seu padrinho marcou um encontro em ${encontro.local}, ${quandoDoEncontro(encontro.inicio)}. Responda se você vai.`,
    link: `/encontros/${encontro.id}`,
    chave: `encontro-convite:${encontro.id}`,
  };
}

export function notificacaoEncontroAlterado(
  encontro: EncontroParaAviso,
  alteradoEm: string,
): NovaNotificacao {
  return {
    tipo: 'ENCONTRO_ALTERADO',
    titulo: 'Encontro remarcado',
    mensagem: `O encontro passou para ${encontro.local}, ${quandoDoEncontro(encontro.inicio)}. Confirme de novo se você vai.`,
    link: `/encontros/${encontro.id}`,
    chave: `encontro-alterado:${encontro.id}:${alteradoEm}`,
  };
}

export function notificacaoEncontroCancelado(
  encontro: EncontroParaAviso,
): NovaNotificacao {
  return {
    tipo: 'ENCONTRO_CANCELADO',
    titulo: 'Encontro cancelado',
    mensagem: `O encontro de ${quandoDoEncontro(encontro.inicio)} em ${encontro.local} foi cancelado.`,
    link: `/encontros/${encontro.id}`,
    chave: `encontro-cancelado:${encontro.id}`,
  };
}
