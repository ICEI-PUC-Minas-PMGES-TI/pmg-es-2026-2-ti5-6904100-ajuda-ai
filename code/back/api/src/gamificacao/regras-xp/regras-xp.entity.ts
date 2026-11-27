import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { SCHEMA_GAMIFICACAO } from '../gamificacao.js';

export const ELEGIBILIDADES_XP = ['todos', 'padrinho', 'apadrinhado'] as const;
export type ElegibilidadeXp = (typeof ELEGIBILIDADES_XP)[number];

@Entity({ name: 'regras_xp', schema: SCHEMA_GAMIFICACAO, synchronize: false })
export class RegraXpEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 40 })
  acao!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  programa!: string | null;

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

@Entity({
  name: 'regras_xp_versoes',
  schema: SCHEMA_GAMIFICACAO,
  synchronize: false,
})
@Unique('uq_regras_xp_versao', ['regraId', 'versao'])
@Check('ck_regras_xp_versoes_valor', '"valor_xp" > 0')
@Check(
  'ck_regras_xp_versoes_limite',
  '"limite_repeticoes" IS NULL OR "limite_repeticoes" > 0',
)
export class RegraXpVersaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'regra_id', type: 'int' })
  regraId!: number;

  @ManyToOne(() => RegraXpEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'regra_id',
    foreignKeyConstraintName: 'fk_regras_xp_versoes_regra',
  })
  regra!: RegraXpEntity;

  @Column({ type: 'int' })
  versao!: number;

  @Column({ name: 'valor_xp', type: 'int' })
  valorXp!: number;

  @Column({ type: 'varchar', length: 20 })
  elegibilidade!: ElegibilidadeXp;

  @Column({ name: 'limite_repeticoes', type: 'int', nullable: true })
  limiteRepeticoes!: number | null;

  @Column({ name: 'combinavel_com', type: 'jsonb', default: () => "'[]'" })
  combinavelCom!: string[];

  @Column({ name: 'criado_por', type: 'varchar', length: 120, nullable: true })
  criadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
