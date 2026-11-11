/** Espelha a lógica do backend (`visibilidade-perguntas.ts`). */

export const OPERADORES_CONDICAO = [
  { valor: 'igual', rotulo: 'for igual a' },
  { valor: 'diferente', rotulo: 'for diferente de' },
  { valor: 'contem', rotulo: 'contiver' },
  { valor: 'preenchida', rotulo: 'estiver preenchida' },
  { valor: 'vazia', rotulo: 'estiver vazia' },
];

function preenchida(valor) {
  if (Array.isArray(valor)) return valor.length > 0;
  return Boolean(String(valor ?? '').trim());
}

export function condicaoSatisfeita(condicao, resposta) {
  if (!condicao) return true;
  switch (condicao.operador) {
    case 'preenchida':
      return preenchida(resposta);
    case 'vazia':
      return !preenchida(resposta);
    case 'igual':
      if (Array.isArray(resposta)) return resposta.length === 1 && resposta[0] === condicao.valor;
      return String(resposta ?? '') === String(condicao.valor ?? '');
    case 'diferente':
      if (!preenchida(resposta)) return true;
      if (Array.isArray(resposta)) return !(resposta.length === 1 && resposta[0] === condicao.valor);
      return String(resposta) !== String(condicao.valor ?? '');
    case 'contem':
      if (Array.isArray(resposta)) return resposta.includes(condicao.valor);
      return String(resposta ?? '').toLowerCase().includes(String(condicao.valor ?? '').toLowerCase());
    default:
      return true;
  }
}

export function perguntaVisivel(pergunta, respostas = {}) {
  if (!pergunta?.visivelSe) return true;
  return condicaoSatisfeita(pergunta.visivelSe, respostas[pergunta.visivelSe.perguntaId]);
}

export function perguntasVisiveis(perguntas = [], respostas = {}) {
  return perguntas.filter((p) => perguntaVisivel(p, respostas));
}

export function operadorPrecisaValor(operador) {
  return operador === 'igual' || operador === 'diferente' || operador === 'contem';
}

export function rotuloCondicao(condicao, perguntas = []) {
  if (!condicao) return '';
  const alvo = perguntas.find((p) => p.id === condicao.perguntaId);
  const nome = alvo?.enunciado?.trim() || 'pergunta anterior';
  const op = OPERADORES_CONDICAO.find((o) => o.valor === condicao.operador)?.rotulo || condicao.operador;
  if (!operadorPrecisaValor(condicao.operador)) return `Visível se “${nome}” ${op}`;
  return `Visível se “${nome}” ${op} “${condicao.valor || ''}”`;
}
