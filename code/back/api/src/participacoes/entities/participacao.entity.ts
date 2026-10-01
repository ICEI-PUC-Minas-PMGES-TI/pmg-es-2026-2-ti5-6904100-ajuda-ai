import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type PapelParticipacao = 'padrinho' | 'apadrinhado' | 'candidato';
export type StatusParticipacaoRegistro =
  | 'em_analise'
  | 'em_andamento'
  | 'concluido'
  | 'nao_aprovado';

@Entity({ name: 'participacoes' })
@Unique('uq_participacao_usuario_programa_papel', [
  'usuarioId',
  'programa',
  'papel',
])
@Index('idx_participacao_usuario', ['usuarioId'])
export class ParticipacaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Identificador estável do usuário (e-mail ou id numérico como string). */
  @Column({ name: 'usuario_id', type: 'varchar', length: 120 })
  usuarioId!: string;

  /** Ciclo do programa, ex.: 2026/2 */
  @Column({ type: 'varchar', length: 20 })
  programa!: string;

  @Column({ type: 'varchar', length: 30 })
  papel!: PapelParticipacao;

  @Column({ type: 'varchar', length: 30 })
  status!: StatusParticipacaoRegistro;

  @Column({ name: 'grupo', type: 'varchar', length: 40, nullable: true })
  grupo!: string;

  @Column({ type: 'int', default: 0 })
  apadrinhados!: number;

  @Column({ name: 'inicio_em', type: 'timestamptz', nullable: true })
  inicioEm!: Date;

  @Column({ name: 'termino_em', type: 'timestamptz', nullable: true })
  terminoEm!: Date;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
