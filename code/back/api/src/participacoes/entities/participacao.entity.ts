import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { RegistroVerificacao } from '../verificacao-academica.js';

export type PapelParticipacao = 'padrinho' | 'apadrinhado' | 'candidato';
export type StatusParticipacaoRegistro =
  | 'pendente'
  | 'em_analise'
  | 'aprovado'
  | 'em_andamento'
  | 'concluido'
  | 'nao_aprovado';

/** Resposta do candidato a um requisito do ciclo (foto do momento do envio). */
export interface RequisitoRespondido {
  id: string;
  descricao: string;
  obrigatorio: boolean;
  /** Declaração do próprio aluno (não há verificação no histórico da PUC). */
  cumpre: boolean;
}

/**
 * Dados enviados pelo aluno no cadastro. Todos opcionais porque registros
 * antigos (e a semente demo) podem não ter respostas.
 */
export interface MetadadosCandidatura {
  /**
   * Foto do formulário respondido: perguntas exatas e versão. Ausente em
   * envios antigos e quando não havia formulário publicado.
   */
  formulario?: {
    id: number | null;
    programa: string;
    /** Público do formulário; ausente nos envios anteriores à F06. */
    tipo?: 'padrinho' | 'apadrinhado';
    /** Versão respondida; ausente nos envios anteriores à F06. */
    versao?: number;
    perguntas: unknown[];
    atualizadoEm: Date | null;
  };
  decisao?: {
    resultado: 'aprovado' | 'nao_aprovado';
    justificativa: string | null;
    em: string;
    por: string | null;
  };
}

export interface RespostasCadastro {
  /** Exclusivo do servidor. Nunca copiado do payload do aluno. */
  _servidor?: MetadadosCandidatura;
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
  /**
   * LEGADO: declaração única de pré-requisitos dos registros antigos.
   * Os envios novos usam `requisitos` (configurados por ciclo).
   */
  declaraPreRequisitos?: boolean;
  /** Padrinho: requisitos do ciclo e a declaração do candidato para cada um. */
  requisitos?: RequisitoRespondido[];
  /** Apadrinhado: o que espera do padrinho. */
  expectativa?: string;
  outrasInformacoes?: string;
  /**
   * Apadrinhado: declaração explícita de que está no 1º período / é calouro
   * elegível ao programa.
   */
  declaraPrimeiroPeriodo?: boolean;
  /** Respostas às perguntas extras do formulário publicado (id → valor). */
  extras?: Record<string, string | string[] | boolean>;
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
  grupo!: string | null;

  @Column({ type: 'int', default: 0 })
  apadrinhados!: number;

  @Column({ name: 'inicio_em', type: 'timestamptz', nullable: true })
  inicioEm!: Date | null;

  @Column({ name: 'termino_em', type: 'timestamptz', nullable: true })
  terminoEm!: Date | null;

  /** Respostas do formulário de cadastro/candidatura (perfil + perguntas). */
  @Column({ type: 'jsonb', nullable: true })
  respostas!: RespostasCadastro | null;

  /** Anotações privadas da coordenação sobre a candidatura. */
  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  /**
   * Conferência acadêmica (F09) registrada pela coordenação. Fica fora de
   * `respostas` para não ser devolvida ao aluno junto com o formulário.
   */
  @Column({ type: 'jsonb', nullable: true })
  verificacao!: RegistroVerificacao | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
