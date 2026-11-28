/**
 * Auxiliar de SQL das celebrações de nível. Fica FORA de `src/migrations/`
 * de propósito: o TypeORM carrega todos os `export` de função dos arquivos de
 * migration como se fossem migrations e `migration:run` falha
 * ("sqlNivelDe migration name is wrong").
 */
export const LIMIARES_NIVEIS_V1 = [
  0, 50, 150, 300, 500, 750, 1050, 1400, 1950, 2600,
] as const;

/** Nível (1..n) de uma coluna de XP, em SQL, pelos limiares dados. */
export function sqlNivelDe(
  coluna: string,
  limiares: readonly number[] = LIMIARES_NIVEIS_V1,
): string {
  const casos = limiares
    .map((xp, i) => ({ xp, nivel: i + 1 }))
    .slice(1)
    .reverse()
    .map(({ xp, nivel }) => `WHEN ${coluna} >= ${xp} THEN ${nivel}`)
    .join(' ');
  return `(CASE ${casos} ELSE 1 END)`;
}
