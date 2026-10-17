import type { Repository } from 'typeorm';

/**
 * Repositório TypeORM em memória para testes: entende `where` por igualdade
 * e `In(...)`, gera ids e datas de criação/atualização.
 */
export function repositorioEmMemoria<
  T extends { id: number; criadoEm?: Date; atualizadoEm?: Date },
>(registros: T[] = []): Repository<T> {
  let proximoId = registros.reduce((maior, r) => Math.max(maior, r.id), 0) + 1;

  const corresponde = (registro: T, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([chave, valor]) => {
      const atual = (registro as unknown as Record<string, unknown>)[chave];
      if (valor && typeof valor === 'object' && '_value' in valor) {
        return (valor as { _value: unknown[] })._value.includes(atual);
      }
      return atual === valor;
    });

  return {
    create: (dados: Partial<T>) => ({ ...dados }) as T,
    save: async (entidade: T) => {
      if (!entidade.id) {
        entidade.id = proximoId++;
        entidade.criadoEm = new Date(Date.now() + entidade.id);
        registros.push(entidade);
      }
      entidade.atualizadoEm = new Date();
      return entidade;
    },
    find: async (opcoes?: { where?: Record<string, unknown> }) =>
      registros.filter((r) => corresponde(r, opcoes?.where)),
    findOne: async (opcoes: { where: Record<string, unknown> }) =>
      registros.find((r) => corresponde(r, opcoes.where)) ?? null,
  } as unknown as Repository<T>;
}
