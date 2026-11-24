/** Consulta permissões antes do conteúdo e descarta respostas fora do contexto. */
export async function consultarFeedAutorizado({
  permissoes,
  listar,
  vigente,
  aoPermissoes,
}) {
  if (!vigente()) return null;
  const acesso = await permissoes();
  if (!vigente()) return null;
  aoPermissoes(acesso);
  if (!acesso.podeLer) return null;
  const itens = await listar();
  return vigente() ? itens : null;
}
