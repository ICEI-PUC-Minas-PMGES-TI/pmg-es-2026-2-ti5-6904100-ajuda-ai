import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type TipoCriterioCatalogo =
  'sim_nao' | 'escolha_unica' | 'multipla_escolha';

export interface AlternativaCriterio {
  /** Identificador estável compartilhado entre versões e respostas. */
  id: string;
  rotulo: string;
}

@Entity({ name: 'matching_criterios' })
@Unique('uq_matching_criterio_nome_norm', ['nomeNormalizado'])
@Index('idx_matching_criterio_ativo', ['ativo'])
export class MatchingCriterioEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  nome!: string;

  @Column({ name: 'nome_normalizado', type: 'varchar', length: 120 })
  nomeNormalizado!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'versao_atual', type: 'int', default: 1 })
  versaoAtual!: number;

  @Column({ name: 'criado_por', type: 'varchar', length: 120, nullable: true })
  criadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}

@Entity({ name: 'matching_criterio_versoes' })
@Unique('uq_matching_criterio_versao', ['criterioId', 'versao'])
export class MatchingCriterioVersaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'criterio_id', type: 'int' })
  criterioId!: number;

  @ManyToOne(() => MatchingCriterioEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'criterio_id' })
  criterio!: MatchingCriterioEntity;

  @Column({ type: 'int' })
  versao!: number;

  @Column({ name: 'enunciado_padrao', type: 'varchar', length: 200 })
  enunciadoPadrao!: string;

  @Column({ type: 'varchar', length: 30 })
  tipo!: TipoCriterioCatalogo;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  alternativas!: AlternativaCriterio[];

  @Column({ name: 'criado_por', type: 'varchar', length: 120, nullable: true })
  criadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
