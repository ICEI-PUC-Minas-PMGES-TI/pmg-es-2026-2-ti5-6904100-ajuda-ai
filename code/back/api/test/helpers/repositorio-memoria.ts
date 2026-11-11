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

  type Filtro = Record<string, unknown> | Record<string, unknown>[];
  /** `where` em lista = OU entre os filtros, como no TypeORM. */
  const atende = (registro: T, where?: Filtro) =>
    Array.isArray(where)
      ? where.some((w) => corresponde(registro, w))
      : corresponde(registro, where);

  const salvar = async (entidade: T) => {
    if (!entidade.id) {
      entidade.id = proximoId++;
      entidade.criadoEm = new Date(Date.now() + entidade.id);
      registros.push(entidade);
    }
    const anterior = registros.find((r) => r.id === entidade.id);
    if (anterior && anterior !== entidade) Object.assign(anterior, entidade);
    entidade.atualizadoEm = new Date();
    return entidade;
  };

  const repo = {
    create: (dados: Partial<T>) => ({ ...dados }) as T,
    save: async (entidade: T | T[]) =>
      Array.isArray(entidade)
        ? Promise.all(entidade.map((e) => salvar(e)))
        : salvar(entidade),
    update: async (where: Record<string, unknown>, dados: Partial<T>) => {
      const alvos = registros.filter((r) => corresponde(r, where));
      for (const alvo of alvos) Object.assign(alvo, dados);
      return { affected: alvos.length };
    },
    count: async (opcoes?: { where?: Filtro }) =>
      registros.filter((r) => atende(r, opcoes?.where)).length,
    exists: async (opcoes?: { where?: Filtro }) =>
      registros.some((r) => atende(r, opcoes?.where)),
    delete: async (where: Record<string, unknown>) => {
      let affected = 0;
      for (let i = registros.length - 1; i >= 0; i--) {
        if (corresponde(registros[i], where)) {
          registros.splice(i, 1);
          affected++;
        }
      }
      return { affected };
    },
    find: async (opcoes?: { where?: Filtro }) =>
      registros.filter((r) => atende(r, opcoes?.where)),
    findOne: async (opcoes: { where: Record<string, unknown> }) =>
      registros.find((r) => corresponde(r, opcoes.where)) ?? null,
  } as unknown as Repository<T>;
  Object.defineProperty(repo, '_registros', { value: registros });
  conectarRepositorios({ unico: repo });
  return repo;
}

/** Simula transação/rollback; locks reais são responsabilidade do PostgreSQL. */
export function conectarRepositorios(repos: Record<string, Repository<any>>) {
  let fila = Promise.resolve();
  const manager = {
    getRepository: (alvo: { name: string }) => {
      const repo = repos[alvo.name] ?? repos.unico;
      if (!repo) throw new Error(`Repositório não configurado: ${alvo.name}`);
      return repo;
    },
    transaction: async <R>(acao: (m: any) => Promise<R>): Promise<R> => {
      const anterior = fila;
      let liberar!: () => void;
      fila = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      await anterior;
      const snapshots = Object.values(repos).map((repo: any) => [
        repo._registros,
        structuredClone(repo._registros),
      ]);
      try {
        return await acao(manager);
      } catch (erro) {
        for (const [registros, copia] of snapshots)
          registros.splice(0, registros.length, ...copia);
        throw erro;
      } finally {
        liberar();
      }
    },
  };
  for (const repo of Object.values(repos))
    Object.defineProperty(repo, 'manager', {
      value: manager,
      configurable: true,
    });
  return repos;
}
