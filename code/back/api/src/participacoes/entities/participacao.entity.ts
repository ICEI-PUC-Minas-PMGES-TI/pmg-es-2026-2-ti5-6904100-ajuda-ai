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
  | 'pendente'
  | 'em_analise'
  | 'em_andamento'
  | 'concluido'
  | 'nao_aprovado';

/**
 * Dados enviados pelo aluno no cadastro. Todos opcionais porque registros
 * antigos (e a semente demo) podem não ter respostas.
 */
export interface RespostasCadastro {
  nome?: string;
  curso?: string;
  periodo?: number;
  turno?: string;
  interesses?: string[];
  genero?: string;
  bolsistaProuni?: boolean;
  deOutraCidade?: boolean;
  disponibilidade?: string[];
  areas?: string[];
  /** Padrinho: por que quer ser padrinho. */
  motivacao?: string;
  /** Padrinho: experiências relevantes. */
  experiencias?: string;
  /** Padrinho: declara ter cumprido os pré-requisitos. */
  declaraPreRequisitos?: boolean;
  /** Apadrinhado: o que espera do padrinho. */
  expectativa?: string;
  outrasInformacoes?: string;
  /** Respostas às perguntas extras do formulário publicado (id → valor). */
  extras?: Record<string, string | string[]>;
}

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
  terminoEm!: Date | null;

  /** Respostas do formulário de cadastro/candidatura (perfil + perguntas). */
  @Column({ type: 'jsonb', nullable: true })
  respostas!: RespostasCadastro | null;

  /** Anotações privadas da coordenação sobre a candidatura. */
  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
