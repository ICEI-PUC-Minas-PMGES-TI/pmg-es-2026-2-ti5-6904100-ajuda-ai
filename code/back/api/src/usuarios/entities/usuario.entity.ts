import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Modalidade escolhida pelo aluno no cadastro. */
export type TipoParticipacao = 'padrinho' | 'apadrinhado';

/** Situação do cadastro na análise da coordenação. */
export type StatusCadastro = 'pendente' | 'aprovado' | 'rejeitado';

export const TIPOS_PARTICIPACAO: TipoParticipacao[] = [
  'padrinho',
  'apadrinhado',
];
export const STATUS_CADASTRO: StatusCadastro[] = [
  'pendente',
  'aprovado',
  'rejeitado',
];

/**
 * Aluno participante (padrinho ou apadrinhado). A coordenação não fica aqui:
 * o coordenador continua mockado em `dados/dados.ts`.
 *
 * O cadastro vale para o programa como um todo; a inscrição em cada ciclo
 * continua em `participacoes` (ligada pelo e-mail, `usuario_id`).
 */
@Entity({ name: 'usuarios' })
export class UsuarioEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  nome!: string;

  /** E-mail institucional, sempre em minúsculas. */
  @Column({ type: 'varchar', length: 120, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 120 })
  curso!: string;

  @Column({ type: 'int' })
  periodo!: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  turno!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  interesses!: string[] | null;

  @Column({ name: 'tipo_participacao', type: 'varchar', length: 20 })
  tipoParticipacao!: TipoParticipacao;

  @Column({
    name: 'status_cadastro',
    type: 'varchar',
    length: 20,
    default: 'pendente',
  })
  statusCadastro!: StatusCadastro;

  /** Motivo informado pela coordenação ao rejeitar (visível ao aluno). */
  @Column({ name: 'motivo_rejeicao', type: 'text', nullable: true })
  motivoRejeicao!: string | null;

  @Column({ name: 'analisado_em', type: 'timestamptz', nullable: true })
  analisadoEm!: Date | null;

  /** E-mail de quem da coordenação aprovou/rejeitou. */
  @Column({
    name: 'analisado_por',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  analisadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
