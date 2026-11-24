import { DataSource } from 'typeorm';
import { ENTIDADES_MATCHING } from './matching.module.js';
import { MatchingParDecisaoEntity } from './entities/par-decisao.entity.js';
import { ProgramaEntity } from '../programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../participacoes/entities/participacao.entity.js';
import {
  MatchingGrupoEntity,
  MatchingVinculoEventoEntity,
} from './entities/grupo.entity.js';
import { MatchingVinculoEntity } from './entities/matching.entity.js';

describe('Metadata de persistência do matching', () => {
  it('registra o histórico e resolve todas as relações sem conexão com banco', async () => {
    const ds = new DataSource({
      type: 'postgres',
      schema: 'feed',
      entities: [ProgramaEntity, ParticipacaoEntity, ...ENTIDADES_MATCHING],
      synchronize: false,
    });
    await Reflect.get(ds, 'buildMetadatas').call(ds);
    const pares = ds.getMetadata(MatchingParDecisaoEntity);
    expect(pares.tableName).toBe('matching_pares_decisoes');
    expect(pares.foreignKeys).toHaveLength(5);
    expect(
      pares.indices.some((i) => i.isUnique && i.where?.includes('recusado')),
    ).toBe(true);
    expect(
      pares.foreignKeys
        .map((fk) => fk.referencedEntityMetadata.tableName)
        .sort(),
    ).toEqual(
      [
        'matching_pares_decisoes',
        'matching_sugestoes',
        'participacoes',
        'participacoes',
        'programas',
      ].sort(),
    );
    expect(ds.isInitialized).toBe(false);
    expect(
      ds
        .getMetadata(MatchingGrupoEntity)
        .indices.some(
          (i) =>
            i.isUnique &&
            i.columns.some((c) => c.propertyName === 'padrinhoParticipacaoId'),
        ),
    ).toBe(true);
    expect(
      ds
        .getMetadata(MatchingVinculoEntity)
        .foreignKeys.some(
          (fk) => fk.referencedEntityMetadata.tableName === 'matching_grupos',
        ),
    ).toBe(true);
    expect(
      ds
        .getMetadata(MatchingVinculoEventoEntity)
        .indices.some(
          (i) =>
            i.isUnique &&
            i.columns.some((c) => c.propertyName === 'operacaoId'),
        ),
    ).toBe(true);
  });
});
