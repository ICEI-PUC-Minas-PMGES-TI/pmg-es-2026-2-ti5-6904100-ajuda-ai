import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  type Point,
  type Polygon,
  type Relation,
} from 'typeorm';
import { VersaoMapaEntity } from './versao-mapa.entity.js';

/** Entrada de prédio/área como no PUCMaps (ponto WGS84 + nível). */
export interface EntradaMapa {
  id: string;
  name: string;
  level: number;
  latitude: number;
  longitude: number;
}

/**
 * Prédio de uma versão. `id` é a chave estável do campus: o mesmo `id` do
 * footprint 2D e dos GLBs (`P01_R4751608`, `OSM_325598969`); portões sem
 * footprint usam `GATE_<código OSM>`. `idOrigem` é o UUID do prédio na versão
 * de origem do PUCMaps (muda a cada versão de lá; não serve de chave).
 */
@Entity({ name: 'predios', schema: 'mapa' })
@Unique('uq_predios_id_origem', ['versaoId', 'idOrigem'])
@Check('ck_predios_altura', `"altura" IS NULL OR "altura" >= 0`)
// O TypeORM compara CHECK pelo nome; a expressão (PostGIS no search_path)
// só seria usada se ele criasse a constraint. A migration qualifica o schema.
@Check(
  'ck_predios_poligono_valido',
  `"poligono" IS NULL OR ST_IsValid("poligono")`,
)
@Index('idx_predios_codigo', ['versaoId', 'codigo'])
export class PredioEntity {
  @PrimaryColumn({
    name: 'versao_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_predios',
  })
  versaoId!: string;

  @PrimaryColumn({
    type: 'varchar',
    length: 64,
    primaryKeyConstraintName: 'pk_predios',
  })
  id!: string;

  @ManyToOne(() => VersaoMapaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'versao_id',
    foreignKeyConstraintName: 'fk_predios_versao',
  })
  versao!: Relation<VersaoMapaEntity>;

  @Column({ name: 'id_origem', type: 'uuid', nullable: true })
  idOrigem!: string | null;

  @Column({ name: 'osm_id', type: 'varchar', length: 32, nullable: true })
  osmId!: string | null;

  /** Não é único: o PUCMaps tem códigos repetidos (ex.: Prédio 1 e agência). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  codigo!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  nome!: string | null;

  /** Tipo do PUCMaps (ACADEMIC, GATE, ...); nulo quando a origem não tem. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  tipo!: string | null;

  @Column({ type: 'double precision', nullable: true })
  altura!: number | null;

  @Column({ name: 'altura_base', type: 'double precision', nullable: true })
  alturaBase!: number | null;

  @Column({ type: 'jsonb', default: [] })
  entradas!: EntradaMapa[];

  @Index('idx_predios_localizacao', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  localizacao!: Point;

  @Index('idx_predios_poligono', { spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
  })
  poligono!: Polygon | null;
}
