import { randomUUID } from 'node:crypto';

export interface EventoChat {
  id: string;
  tipo: 'chat.message';
  chatId: number;
  mensagemId: number;
  ocorridoEm: string;
}

export function novoEventoChat(chatId: number, mensagemId: number): EventoChat {
  return {
    id: randomUUID(),
    tipo: 'chat.message',
    chatId,
    mensagemId,
    ocorridoEm: new Date().toISOString(),
  };
}

export function eventoChatValido(valor: unknown): valor is EventoChat {
  if (!valor || typeof valor !== 'object') return false;
  const evento = valor as EventoChat;
  return (
    typeof evento.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(evento.id) &&
    evento.tipo === 'chat.message' &&
    Number.isSafeInteger(evento.chatId) &&
    evento.chatId > 0 &&
    Number.isSafeInteger(evento.mensagemId) &&
    evento.mensagemId > 0 &&
    typeof evento.ocorridoEm === 'string' &&
    Number.isFinite(Date.parse(evento.ocorridoEm))
  );
}
