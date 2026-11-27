export async function aplicarRespostaSeAtual({
  chave,
  chaveAtual,
  requisicao,
  requisicaoAtual,
  carregar,
  aplicar,
}) {
  if (chaveAtual.current !== chave || requisicaoAtual.current !== requisicao)
    return false;

  const resultado = await carregar();
  if (chaveAtual.current !== chave || requisicaoAtual.current !== requisicao)
    return false;

  aplicar(resultado);
  return true;
}
