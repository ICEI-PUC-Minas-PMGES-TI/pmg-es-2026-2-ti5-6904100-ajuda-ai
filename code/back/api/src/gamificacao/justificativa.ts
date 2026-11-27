import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Justificativas da coordenação (motivo de cancelamento, motivo de ajuste de
 * XP): a API grava `valor.trim()` e o banco confere
 * `char_length(btrim(motivo)) BETWEEN min AND max`.
 *
 * A validação precisa olhar o MESMO valor que será gravado e contar como o
 * PostgreSQL conta. Por isso:
 * - normaliza antes de medir (`' a '` vira `'a'` e é recusado com 400, em vez
 *   de passar no DTO e estourar o CHECK como 500);
 * - conta pontos de código (`[...s].length`), não unidades UTF-16
 *   (`s.length`): `'😀a'` tem `length` 3, mas `char_length` 2.
 *
 * O `trim()` do JavaScript remove todo espaço Unicode das pontas; depois dele
 * o `btrim()` do banco (que só remove ' ') não muda mais nada, então as duas
 * contagens coincidem.
 */
export function normalizarJustificativa(valor: string): string {
  return valor.trim();
}

/** Comprimento de uma justificativa como o CHECK do banco o mede. */
export function comprimentoJustificativa(valor: string): number {
  return [...normalizarJustificativa(valor)].length;
}

/** Valida texto, normalizado, com `min`..`max` caracteres (pontos de código). */
export function JustificativaNormalizada(
  limites: { readonly min: number; readonly max: number },
  opcoes?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'justificativaNormalizada',
      constraints: [limites.min, limites.max],
      validator: {
        validate: (valor: unknown) => {
          if (typeof valor !== 'string') return false;
          const n = comprimentoJustificativa(valor);
          return n >= limites.min && n <= limites.max;
        },
        defaultMessage: (args) =>
          `${args?.property ?? 'valor'} deve ter de ${limites.min} a ${limites.max} caracteres, sem contar espaços no início e no fim`,
      },
    },
    opcoes,
  );
}
