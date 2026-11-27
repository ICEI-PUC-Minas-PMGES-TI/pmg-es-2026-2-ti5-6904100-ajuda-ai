/** Continua consultando após perda da resposta HTTP, até observar o resultado persistido. */
export async function acompanharMatching({ consultar, anteriorId, execucaoId, ativo, atualizar, erroRede, esperar = () => new Promise(r => setTimeout(r, 1500)) }) {
  while (ativo()) {
    try {
      const execucoes = await consultar();
      if (!ativo()) return null;
      atualizar(execucoes);
      const rodada = execucaoId != null
        ? execucoes.find(e => e.id === execucaoId)
        : (execucoes[0]?.id !== anteriorId ? execucoes[0] : undefined);
      if (rodada && rodada.status !== 'executando') return rodada;
    } catch (erro) {
      if (!ativo()) return null;
      if (erro.status === 401 || erro.status === 403) throw erro;
      erroRede(erro);
    }
    await esperar();
  }
  return null;
}
