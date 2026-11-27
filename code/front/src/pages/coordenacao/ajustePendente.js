/**
 * Ajuste de XP enviado sem resposta conclusiva (F26).
 *
 * A chave de idempotência identifica UMA intenção de ajuste. Ela é gravada
 * no navegador ANTES do envio e só é descartada quando o servidor responde
 * de forma conclusiva. Assim, se a resposta se perde (rede, timeout, 5xx) e
 * a coordenação fecha e reabre o formulário, ou recarrega a página, o
 * reenvio usa a MESMA chave: o servidor devolve o ajuste já gravado em vez
 * de lançar de novo.
 *
 * Ao reabrir, a tela procura a chave pendente nos ajustes do extrato: se já
 * entrou, avisa e descarta; se não, restaura o formulário para reenviar.
 *
 * Reenviar com a mesma chave e dados editados NÃO substitui o envio pendente
 * (`corpo`): se o primeiro envio entrou, é ele que vale para o servidor, que
 * recusa os dados novos com 409. Os dados do último reenvio ficam em `ultimo`,
 * só para restaurar o formulário. O aviso de "já registrado" usa o ajuste que
 * o extrato devolve, nunca o que o navegador guardou.
 */

const PREFIXO = 'ajuda-ai:ajuste-xp-pendente:';
/** Depois disso a intenção é descartada (o extrato continua sendo a verdade). */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function armazenamentoPadrao() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // modo privado / storage bloqueado
  }
}

const corpoValido = (corpo, chave) => Boolean(corpo)
  && corpo.chaveIdempotencia === chave
  && Number.isInteger(corpo.quantidade) && typeof corpo.motivo === 'string';

/** `{ chave, corpo, ultimo?, em }` do participante, ou `null`. */
export function lerPendente(usuarioId, armazenamento = armazenamentoPadrao(), agora = Date.now()) {
  if (!armazenamento) return null;
  try {
    const bruto = armazenamento.getItem(PREFIXO + usuarioId);
    if (!bruto) return null;
    const p = JSON.parse(bruto);
    const valido = p && typeof p.chave === 'string'
      && corpoValido(p.corpo, p.chave)
      && (p.ultimo === undefined || corpoValido(p.ultimo, p.chave))
      && agora - Number(p.em) < VALIDADE_MS;
    if (!valido) {
      armazenamento.removeItem(PREFIXO + usuarioId);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

/**
 * Grava a intenção antes do envio. Se já há um envio pendente com a mesma
 * chave, ele é preservado e este reenvio só atualiza `ultimo`.
 */
export function gravarPendente(usuarioId, corpo, armazenamento = armazenamentoPadrao(), agora = Date.now()) {
  try {
    const anterior = lerPendente(usuarioId, armazenamento, agora);
    const registro = anterior?.chave === corpo.chaveIdempotencia
      ? { chave: anterior.chave, corpo: anterior.corpo, ultimo: corpo, em: agora }
      : { chave: corpo.chaveIdempotencia, corpo, em: agora };
    armazenamento?.setItem(PREFIXO + usuarioId, JSON.stringify(registro));
  } catch {
    // Sem storage: ainda vale a chave em memória enquanto o formulário estiver aberto.
  }
}

export function limparPendente(usuarioId, armazenamento = armazenamentoPadrao()) {
  try {
    armazenamento?.removeItem(PREFIXO + usuarioId);
  } catch {
    // idem
  }
}

/**
 * O ajuste do extrato gravado com a chave pendente, ou `null` se ainda não
 * entrou. É dele (o que o servidor gravou) que sai o aviso, não do navegador.
 */
export function ajusteDoPendente(pendente, ajustes) {
  if (!pendente) return null;
  return (ajustes || []).find((a) => a.chaveIdempotencia === pendente.chave) ?? null;
}

/**
 * Falha sem resposta conclusiva: o ajuste PODE ter sido gravado. Rede/timeout
 * chegam com `status` 0; 5xx também não garante que nada foi gravado.
 */
export function respostaIncerta(error) {
  const status = Number(error?.status ?? 0);
  return !Number.isFinite(status) || status === 0 || status >= 500;
}

/** Formulário (sentido/quantidade/motivo) a partir do último envio pendente. */
export function formularioDoPendente(pendente) {
  const { quantidade: q, motivo } = pendente.ultimo ?? pendente.corpo;
  return { sentido: q < 0 ? 'debito' : 'credito', quantidade: String(Math.abs(q)), motivo };
}
