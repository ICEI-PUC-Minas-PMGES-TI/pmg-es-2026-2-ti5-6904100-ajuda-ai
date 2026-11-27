/** Só acompanha a operação solicitada; toda espera tem um prazo finito. */
export async function acompanharMatching({ consultar, operacaoId, execucaoId, ativo, atualizar, erroRede,
  agora = () => Date.now(), prazoConfirmacaoMs = 15_000, prazoTotalMs = 180_000,
  esperar = () => new Promise(r => setTimeout(r, 1500)) }) {
  const inicio = agora();
  let confirmada = false;
  while (ativo()) {
    try {
      const execucoes = await consultar();
      if (!ativo()) return null;
      atualizar(execucoes);
      const rodada = operacaoId
        ? execucoes.find(e => e.operacaoId === operacaoId)
        : execucoes.find(e => e.id === execucaoId);
      if (rodada) {
        confirmada = true;
        if (rodada.status !== 'executando') return rodada;
      }
    } catch (erro) {
      if (!ativo()) return null;
      if (erro.status === 401 || erro.status === 403) throw erro;
      erroRede(erro);
    }
    const tempo = agora() - inicio;
    if ((!confirmada && tempo >= prazoConfirmacaoMs) || tempo >= prazoTotalMs) {
      throw Object.assign(new Error(confirmada
        ? 'Não foi possível obter o resultado no prazo. Tente novamente para consultar a mesma operação.'
        : 'A execução não foi confirmada. Tente novamente; a mesma operação será reutilizada.'),
        { codigo: confirmada ? 'acompanhamento_expirado' : 'execucao_nao_confirmada' });
    }
    await esperar();
  }
  return null;
}
