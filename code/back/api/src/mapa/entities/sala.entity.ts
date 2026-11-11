import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Point,
  type Relation,
} from 'typeorm';
import { PredioEntity } from './predio.entity.js';

/**
 * Sala de um prédio, identificada dentro da versão geográfica.
 * Campos derivados do `RoomEntity` do PUCMaps, com localização PostGIS.
 */
@Entity({ name: 'salas', schema: 'mapa' })
@Check('ck_salas_capacidade', `"capacidade" >= 0`)
@Index('idx_salas_predio', ['versaoId', 'predioId'])
export class SalaEntity {
  @PrimaryColumn({
    name: 'versao_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_salas',
  })
  versaoId!: string;

  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_salas' })
  id!: string;

  @Column({ name: 'predio_id', type: 'varchar', length: 64 })
  predioId!: string;

  @ManyToOne(() => PredioEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'versao_id',
      referencedColumnName: 'versaoId',
      foreignKeyConstraintName: 'fk_salas_predio',
    },
    { name: 'predio_id', referencedColumnName: 'id' },
  ])
  predio!: Relation<PredioEntity>;

  @Column({ type: 'varchar', length: 160 })
  nome!: string;

  @Column({ type: 'int' })
  andar!: number;

  @Column({ type: 'int' })
  capacidade!: number;

  @Column({ type: 'varchar', length: 32 })
  tipo!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  localizacao!: Point;
}
