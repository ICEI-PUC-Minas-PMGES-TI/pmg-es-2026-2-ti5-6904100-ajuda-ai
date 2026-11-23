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

/** `{ chave, corpo, em }` do participante, ou `null`. */
export function lerPendente(usuarioId, armazenamento = armazenamentoPadrao(), agora = Date.now()) {
  if (!armazenamento) return null;
  try {
    const bruto = armazenamento.getItem(PREFIXO + usuarioId);
    if (!bruto) return null;
    const p = JSON.parse(bruto);
    const valido = p && typeof p.chave === 'string' && p.corpo
      && p.corpo.chaveIdempotencia === p.chave
      && Number.isInteger(p.corpo.quantidade) && typeof p.corpo.motivo === 'string'
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

/** Grava a intenção antes do envio. */
export function gravarPendente(usuarioId, corpo, armazenamento = armazenamentoPadrao(), agora = Date.now()) {
  try {
    armazenamento?.setItem(PREFIXO + usuarioId, JSON.stringify({ chave: corpo.chaveIdempotencia, corpo, em: agora }));
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

/** A intenção pendente já está entre os ajustes gravados? */
export function pendenteConfirmado(pendente, ajustes) {
  return Boolean(pendente) && (ajustes || []).some((a) => a.chaveIdempotencia === pendente.chave);
}

/**
 * Falha sem resposta conclusiva: o ajuste PODE ter sido gravado. Rede/timeout
 * chegam com `status` 0; 5xx também não garante que nada foi gravado.
 */
export function respostaIncerta(error) {
  const status = Number(error?.status ?? 0);
  return !Number.isFinite(status) || status === 0 || status >= 500;
}

/** Formulário (sentido/quantidade/motivo) a partir do corpo pendente. */
export function formularioDoPendente(pendente) {
  const q = pendente.corpo.quantidade;
  return { sentido: q < 0 ? 'debito' : 'credito', quantidade: String(Math.abs(q)), motivo: pendente.corpo.motivo };
}
