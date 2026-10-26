import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type LineString,
  type Relation,
} from 'typeorm';
import { NoGrafoEntity } from './no-grafo.entity.js';
import { VersaoMapaEntity } from './versao-mapa.entity.js';

/**
 * Aresta DIRIGIDA do grafo, como no PUCMaps: cada trecho aparece nos dois
 * sentidos (1.654 arestas = 827 pares na versão importada). Pode haver duas
 * arestas entre os mesmos nós (caminhos diferentes, ids diferentes).
 * `geometria` é nula nos conectores de comprimento zero (dois nós no mesmo
 * ponto): a origem guarda ali uma linha degenerada, inválida no PostGIS.
 */
@Entity({ name: 'arestas_grafo', schema: 'mapa' })
@Check('ck_arestas_grafo_distancia', `"distancia_m" >= 0`)
@Check('ck_arestas_grafo_tempo', `"tempo_caminhada_s" >= 0`)
@Check('ck_arestas_grafo_sem_laco', `"no_origem_id" <> "no_destino_id"`)
@Check(
  'ck_arestas_grafo_geometria_valida',
  `"geometria" IS NULL OR ST_IsValid("geometria")`,
)
@Index('idx_arestas_grafo_origem', ['versaoId', 'noOrigemId'])
@Index('idx_arestas_grafo_destino', ['versaoId', 'noDestinoId'])
export class ArestaGrafoEntity {
  @PrimaryColumn({
    name: 'versao_id',
    type: 'uuid',
    primaryKeyConstraintName: 'pk_arestas_grafo',
  })
  versaoId!: string;

  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_arestas_grafo' })
  id!: string;

  @ManyToOne(() => VersaoMapaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'versao_id',
    foreignKeyConstraintName: 'fk_arestas_grafo_versao',
  })
  versao!: Relation<VersaoMapaEntity>;

  @Column({ name: 'no_origem_id', type: 'uuid' })
  noOrigemId!: string;

  @ManyToOne(() => NoGrafoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'versao_id',
      referencedColumnName: 'versaoId',
      foreignKeyConstraintName: 'fk_arestas_grafo_origem',
    },
    { name: 'no_origem_id', referencedColumnName: 'id' },
  ])
  noOrigem!: Relation<NoGrafoEntity>;

  @Column({ name: 'no_destino_id', type: 'uuid' })
  noDestinoId!: string;

  @ManyToOne(() => NoGrafoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'versao_id',
      referencedColumnName: 'versaoId',
      foreignKeyConstraintName: 'fk_arestas_grafo_destino',
    },
    { name: 'no_destino_id', referencedColumnName: 'id' },
  ])
  noDestino!: Relation<NoGrafoEntity>;

  @Column({ name: 'distancia_m', type: 'double precision' })
  distanciaM!: number;

  @Column({ name: 'tempo_caminhada_s', type: 'int' })
  tempoCaminhadaS!: number;

  /** Acessibilidade como marcada na origem (usada pela rota acessível). */
  @Column({ type: 'boolean' })
  acessivel!: boolean;

  /** Conector criado pelo processador do grafo (não veio de via do OSM). */
  @Column({ type: 'boolean', default: false })
  gerada!: boolean;

  @Column({ type: 'int', default: 0 })
  camada!: number;

  @Index('idx_arestas_grafo_geometria', { spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'LineString',
    srid: 4326,
    nullable: true,
  })
  geometria!: LineString | null;
}
