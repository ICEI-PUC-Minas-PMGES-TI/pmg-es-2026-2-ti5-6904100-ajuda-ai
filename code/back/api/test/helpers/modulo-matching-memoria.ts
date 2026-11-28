import { TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { cenarioMatching } from './matching-cenario.js';
import { conectarRepositorios } from './repositorio-memoria.js';
import type { ParticipacaoEntity } from '../../src/participacoes/entities/participacao.entity.js';
import type { ProgramaEntity } from '../../src/programas/entities/programa.entity.js';

/** Os e2e de cadastro carregam o grafo real dos módulos, com todas as tabelas em memória. */
export function moduloMatchingMemoria(repos: Record<string, Repository<any>>) {
  const c = cenarioMatching({
    participantes: (repos.ParticipacaoEntity as any)
      ._registros as ParticipacaoEntity[],
    programas: (repos.ProgramaEntity as any)._registros as ProgramaEntity[],
  });
  const adicionais = { ...repos };
  Object.assign(repos, c.repos);
  for (const [nome, repo] of Object.entries(adicionais)) {
    if (!['ParticipacaoEntity', 'ProgramaEntity'].includes(nome))
      repos[nome] = repo;
  }
  Object.assign(c.repos, repos);
  conectarRepositorios(c.repos);
  const dados = Object.assign(c.dados, {
    options: { type: 'postgres' },
    entityMetadatas: [],
    destroy: async () => undefined,
  }) as DataSource;
  const modulo = TypeOrmModule.forRootAsync({
    useFactory: () => ({ type: 'postgres' }),
    dataSourceFactory: async () => dados,
  });
  return { ...c, modulo };
}
