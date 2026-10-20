import {
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
import { SalaEntity } from './sala.entity.js';
import { VersaoMapaEntity } from './versao-mapa.entity.js';

/**
 * Nó do grafo de navegação. `id` vem do PUCMaps (UUID estável entre versões
 * de lá). `nivel` (andar, decimal) e `camada` (passarela/subsolo) são os
 * campos de origem usados pela rota; `routingId` do pgRouting não foi
 * portado.
 */
@Entity({ name: 'nos_grafo', schema: 'mapa' })
@Index('idx_nos_grafo_predio', ['versaoId', 'predioId'], {
  where: `"predio_id" IS NOT NULL`,
})
export class NoGrafoEntity {
  @PrimaryColumn({
    name: 'versao_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_nos_grafo',
  })
  versaoId!: string;

  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_nos_grafo' })
  id!: string;

  @ManyToOne(() => VersaoMapaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'versao_id',
    foreignKeyConstraintName: 'fk_nos_grafo_versao',
  })
  versao!: Relation<VersaoMapaEntity>;

  @Column({ name: 'predio_id', type: 'varchar', length: 64, nullable: true })
  predioId!: string | null;

  @ManyToOne(() => PredioEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn([
    {
      name: 'versao_id',
      referencedColumnName: 'versaoId',
      foreignKeyConstraintName: 'fk_nos_grafo_predio',
    },
    { name: 'predio_id', referencedColumnName: 'id' },
  ])
  predio!: Relation<PredioEntity> | null;

  @Column({ name: 'sala_id', type: 'uuid', nullable: true })
  salaId!: string | null;

  @ManyToOne(() => SalaEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn([
    {
      name: 'versao_id',
      referencedColumnName: 'versaoId',
      foreignKeyConstraintName: 'fk_nos_grafo_sala',
    },
    { name: 'sala_id', referencedColumnName: 'id' },
  ])
  sala!: Relation<SalaEntity> | null;

  /** O driver `pg` devolve `numeric` como string (ex.: `"-1.00"`). */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  nivel!: string;

  @Column({ type: 'int', default: 0 })
  camada!: number;

  @Index('idx_nos_grafo_localizacao', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  localizacao!: Point;
}
