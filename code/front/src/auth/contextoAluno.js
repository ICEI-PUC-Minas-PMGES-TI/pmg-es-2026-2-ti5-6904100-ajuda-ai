import { escolherCiclo } from "./resolverAluno.js";

/** Uma fotografia aplicada somente enquanto conta e ciclo continuam vigentes. */
export async function consultarContextoAluno({ api, email, codigo, vigente }) {
  if (!vigente()) return null;
  const [perfil, programas, permissoesFeed] = await Promise.all([
    api.perfilAluno(),
    api.programasAluno(),
    api.permissoesFeed(email),
  ]);
  if (!vigente()) return null;
  const programa = codigo || escolherCiclo(programas);
  const situacao =
    programa || programas.length === 0
      ? await api.situacao(email, programa)
      : null;
  return vigente()
    ? { perfil, programas, permissoesFeed, programa, situacao }
    : null;
}
