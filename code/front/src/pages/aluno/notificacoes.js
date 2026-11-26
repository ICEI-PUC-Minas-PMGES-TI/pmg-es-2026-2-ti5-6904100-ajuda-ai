export const ICONE_NOTIFICACAO = {
  MISSAO_NOVA: 'trophy',
  NIVEL_SUBIU: 'star',
  RESGATE_ENTREGUE: 'checkCircle',
  RESGATE_CANCELADO: 'alert',
  CANDIDATURA_APROVADA: 'checkCircle',
  CANDIDATURA_NAO_APROVADA: 'info',
  VINCULO_CONFIRMADO: 'users',
};

/** Link da notificação (o mesmo do app) para a rota do portal. */
const ROTAS_WEB = {
  '/perfil': '/aluno/perfil',
  '/candidatura': '/aluno/candidatura',
  '/dupla': '/aluno/padrinho',
};

export function rotaDaNotificacao(link) {
  return (link && ROTAS_WEB[link]) || null;
}

export function destinoNoApp(link) {
  if (link === '/missoes') return 'Abra no app Ajuda-aí para ver a missão.';
  if (link?.startsWith('/lojinha/')) return 'Abra no app Ajuda-aí para ver o resgate.';
  return null;
}

export function tempoRelativo(iso, agora = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const minutos = Math.max(0, Math.floor((agora - data) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const dias = Math.round((hoje - dia) / 86400000);
  if (dias <= 0) return `há ${Math.floor(minutos / 60)} h`;
  if (dias === 1) return 'ontem';
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function marcarLidaLocal(estado, id, resposta) {
  return {
    ...estado,
    naoLidas: resposta?.naoLidas ?? Math.max(0, estado.naoLidas - 1),
    itens: estado.itens.map((n) => (n.id === id ? { ...n, lida: true, lidaEm: resposta?.lidaEm ?? n.lidaEm ?? new Date().toISOString() } : n)),
  };
}

/** Marca como lidas as notificações que a tela mostra (o servidor devolve o total real depois). */
export function marcarTodasLocal(estado) {
  const agora = new Date().toISOString();
  return { ...estado, naoLidas: 0, itens: estado.itens.map((n) => (n.lida ? n : { ...n, lida: true, lidaEm: agora })) };
}

/** Junta uma página de notificações mais antigas, sem repetir itens. */
export function juntarPagina(estado, pagina) {
  const ids = new Set(estado.itens.map((n) => n.id));
  return {
    naoLidas: pagina?.naoLidas ?? estado.naoLidas,
    itens: [...estado.itens, ...(pagina?.itens ?? []).filter((n) => !ids.has(n.id))],
    temMais: Boolean(pagina?.temMais),
  };
}

export const NOTIFICACOES_VAZIAS = { naoLidas: 0, itens: [], temMais: false };
