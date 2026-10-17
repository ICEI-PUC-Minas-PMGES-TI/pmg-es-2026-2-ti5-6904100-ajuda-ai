import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

export type StatusVersaoMapa = 'pronta' | 'ativa' | 'arquivada';

/** Rastreabilidade da importação (projeto, versão e hashes de origem). */
export interface OrigemVersaoMapa {
  projeto: string;
  [campo: string]: unknown;
}

/**
 * Uma versão importada dos dados geográficos do campus. Imutável depois de
 * importada: mudar dados exige outra versão (outro `codigo`). `hash_dados`
 * identifica o conteúdo exato importado; reimportar o mesmo código só é
 * aceito com o mesmo hash.
 */
@Entity({ name: 'versoes', schema: 'mapa' })
@Unique('uq_versoes_codigo', ['codigo'])
@Check('ck_versoes_status', `"status" IN ('pronta', 'ativa', 'arquivada')`)
@Check(
  'ck_versoes_ativada_em',
  `"status" <> 'ativa' OR "ativada_em" IS NOT NULL`,
)
@Check('ck_versoes_hash_dados', `"hash_dados" ~ '^[0-9a-f]{64}$'`)
// Índice único parcial `((true)) WHERE status = 'ativa'` (só uma ativa), criado
// pela migration; o TypeORM não o recria nem o remove.
@Index('uq_versoes_uma_ativa', { synchronize: false })
export class VersaoMapaEntity {
  /** Gerado pelo importador (`gen_random_uuid()`); sem default no banco. */
  @PrimaryColumn({ type: 'uuid', primaryKeyConstraintName: 'pk_versoes' })
  id!: string;

  /** Ex.: `pucmaps-12` (versão 12, ativa no PUCMaps). */
  @Column({ type: 'varchar', length: 64 })
  codigo!: string;

  @Column({ type: 'varchar', length: 20, default: 'pronta' })
  status!: StatusVersaoMapa;

  @Column({ type: 'jsonb' })
  origem!: OrigemVersaoMapa;

  @Column({ name: 'hash_dados', type: 'char', length: 64 })
  hashDados!: string;

  /** Versão dos GLBs no Azure `map-assets` coerente com estes dados. */
  @Column({
    name: 'versao_assets',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  versaoAssets!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadados!: Record<string, unknown>;

  @Column({
    name: 'criado_em',
    type: 'timestamptz',
    default: () => 'now()',
  })
  criadoEm!: Date;

  @Column({ name: 'ativada_em', type: 'timestamptz', nullable: true })
  ativadaEm!: Date | null;
}
