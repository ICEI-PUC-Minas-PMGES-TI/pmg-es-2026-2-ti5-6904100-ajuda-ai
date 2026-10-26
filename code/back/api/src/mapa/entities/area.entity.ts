import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Point,
  type Polygon,
  type Relation,
} from 'typeorm';
import type { EntradaMapa } from './predio.entity.js';
import { VersaoMapaEntity } from './versao-mapa.entity.js';

/**
 * Área aberta (parque, estacionamento) de uma versão. `id` é o UUID da área na
 * versão de origem do PUCMaps: lá não há outra identidade estável para áreas.
 */
@Entity({ name: 'areas', schema: 'mapa' })
@Check(
  'ck_areas_poligono_valido',
  `"poligono" IS NULL OR ST_IsValid("poligono")`,
)
export class AreaEntity {
  @PrimaryColumn({
    name: 'versao_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_areas',
  })
  versaoId!: string;

  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_areas' })
  id!: string;

  @ManyToOne(() => VersaoMapaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'versao_id',
    foreignKeyConstraintName: 'fk_areas_versao',
  })
  versao!: Relation<VersaoMapaEntity>;

  @Column({ type: 'varchar', length: 160 })
  nome!: string;

  /** PARK ou PARKING_LOT na versão importada. */
  @Column({ type: 'varchar', length: 32 })
  tipo!: string;

  @Column({ type: 'jsonb', default: [] })
  entradas!: EntradaMapa[];

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  localizacao!: Point;

  @Index('idx_areas_poligono', { spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
  })
  poligono!: Polygon | null;
}
