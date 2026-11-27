import { BadRequestException } from '@nestjs/common';

export const GENEROS_PREFERENCIA = [
  'Feminino',
  'Masculino',
  'Não binário',
] as const;
export interface PreferenciaGenero {
  modo: 'sem_preferencia' | 'preferencia';
  generos: string[];
}

/** Ausência histórica não equivale a uma escolha explícita. */
export function validarPreferenciaGenero(
  valor: unknown,
): PreferenciaGenero | undefined {
  if (valor === undefined) return undefined;
  const erro = () =>
    new BadRequestException(
      'Informe sem preferência ou selecione os gêneros de preferência.',
    );
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw erro();
  const v = valor as Record<string, unknown>;
  if (Object.keys(v).some((k) => k !== 'modo' && k !== 'generos')) throw erro();
  if (
    !Array.isArray(v.generos) ||
    v.generos.some(
      (g) => !(GENEROS_PREFERENCIA as readonly unknown[]).includes(g),
    ) ||
    new Set(v.generos).size !== v.generos.length
  )
    throw erro();
  if (v.modo === 'sem_preferencia' && v.generos.length === 0)
    return { modo: v.modo, generos: [] };
  if (
    v.modo === 'preferencia' &&
    v.generos.length > 0 &&
    v.generos.length <= GENEROS_PREFERENCIA.length
  )
    return { modo: v.modo, generos: [...v.generos] as string[] };
  throw erro();
}
