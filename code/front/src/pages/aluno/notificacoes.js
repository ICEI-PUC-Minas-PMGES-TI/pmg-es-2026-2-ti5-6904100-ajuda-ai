export const ICONE_NOTIFICACAO = {
  MISSAO_NOVA: 'trophy',
  NIVEL_SUBIU: 'star',
  RESGATE_ENTREGUE: 'checkCircle',
  RESGATE_CANCELADO: 'alert',
};

const ROTAS_WEB = { '/perfil': '/aluno/perfil' };

export function rotaDaNotificacao(link) {
  return (link && ROTAS_WEB[link]) || null;
}

export function tempoRelativo(iso, agora = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const minutos = Math.max(0, Math.round((agora - data) / 60000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  if (horas < 48) return 'ontem';
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function marcarLidaLocal(estado, id, resposta) {
  return {
    naoLidas: resposta?.naoLidas ?? Math.max(0, estado.naoLidas - 1),
    itens: estado.itens.map((n) => (n.id === id ? { ...n, lida: true, lidaEm: resposta?.lidaEm ?? n.lidaEm ?? new Date().toISOString() } : n)),
  };
}

export function marcarTodasLocal(estado) {
  const agora = new Date().toISOString();
  return { naoLidas: 0, itens: estado.itens.map((n) => (n.lida ? n : { ...n, lida: true, lidaEm: agora })) };
}

export const NOTIFICACOES_VAZIAS = { naoLidas: 0, itens: [] };
