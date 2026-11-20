/**
 * Quando mostrar a animação de novo nível (fluxo real, não o painel de QA).
 *
 * Fonte de verdade: o servidor. `GET /me/xp` traz `celebracao` enquanto a
 * conquista não foi confirmada (`POST /me/xp/celebracoes`). Por isso:
 * - recarregar a página não repete a animação (já confirmada);
 * - outro aparelho que já mostrou a conquista também não;
 * - subir vários níveis de uma vez gera uma única animação, do nível final;
 * - offline: nada é lido, nada é mostrado; a conquista fica pendente no
 *   servidor e aparece na próxima leitura com rede.
 *
 * Guarda local (por e-mail): a conquista fica marcada como exibida no
 * instante em que aparece. Se a confirmação falhar (rede), ela é reenviada
 * depois, e a mesma animação não volta nesse meio-tempo.
 */
const PREFIXO = 'ajudaai.celebracao.';
/** Depois disto vale só o servidor (ex.: conta demo reiniciada). */
export const VALIDADE_GUARDA_MS = 10 * 60 * 1000;

function chave(email) {
  return PREFIXO + String(email || '').trim().toLowerCase();
}

export function lerGuarda(email, armazenamento = globalThis.localStorage) {
  try {
    const bruto = armazenamento?.getItem(chave(email));
    const dados = bruto ? JSON.parse(bruto) : null;
    return dados && Number.isInteger(dados.nivel) ? dados : null;
  } catch {
    return null;
  }
}

function gravarGuarda(email, dados, armazenamento = globalThis.localStorage) {
  try {
    if (dados) armazenamento?.setItem(chave(email), JSON.stringify(dados));
    else armazenamento?.removeItem(chave(email));
  } catch {
    /* sem armazenamento: só o servidor decide */
  }
}

/** A celebração devolvida pelo servidor deve ser exibida agora? */
export function deveCelebrar(celebracao, guarda, agora = Date.now()) {
  if (!celebracao || !Number.isInteger(celebracao.para) || celebracao.para <= (celebracao.de ?? 0)) return false;
  if (guarda && guarda.nivel >= celebracao.para && agora - guarda.em < VALIDADE_GUARDA_MS) return false;
  return true;
}

/** Marca como exibida (antes de confirmar no servidor). */
export function marcarExibida(email, nivel, armazenamento, agora = Date.now()) {
  const atual = lerGuarda(email, armazenamento);
  gravarGuarda(email, {
    nivel: Math.max(nivel, atual?.nivel ?? 0),
    em: agora,
    pendente: true,
  }, armazenamento);
}

/**
 * Envia a confirmação pendente, se houver. Sucesso tira a pendência (a
 * guarda continua valendo até expirar). Falha mantém para a próxima vez.
 */
export async function enviarConfirmacao(email, enviar, armazenamento) {
  const guarda = lerGuarda(email, armazenamento);
  if (!guarda?.pendente) return false;
  try {
    await enviar(guarda.nivel);
    gravarGuarda(email, { ...guarda, pendente: false }, armazenamento);
    return true;
  } catch (erro) {
    // 4xx (ex.: conta sem XP): não adianta insistir.
    if (erro?.status >= 400 && erro.status < 500) {
      gravarGuarda(email, { ...guarda, pendente: false }, armazenamento);
    }
    return false;
  }
}
