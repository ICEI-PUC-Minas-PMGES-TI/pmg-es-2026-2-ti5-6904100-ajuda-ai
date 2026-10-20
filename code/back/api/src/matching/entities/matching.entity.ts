import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ParticipacaoEntity } from '../../participacoes/entities/participacao.entity.js';
import { ProgramaEntity } from '../../programas/entities/programa.entity.js';

export type OperacaoCriterio = 'intersecao' | 'igualdade' | 'diferenca';
/**
 * Critério habilitado na configuração do programa.
 * Compara respostas do mesmo ou de critérios distintos (configuração explícita).
 * Campos legados `campoPadrinho`/`campoApadrinhado` podem existir em snapshots
 * históricos e não entram em novas execuções sem migração.
 */
export interface CriterioMatching {
  criterioPadrinhoId: number;
  criterioApadrinhadoId: number;
  operacao: OperacaoCriterio;
  peso: number;
  /** Legado (pré-catálogo). */
  campoPadrinho?: string;
  campoApadrinhado?: string;
}

@Entity({ name: 'matching_configuracoes' })
@Unique('uq_matching_config_programa_versao', ['programaId', 'versao'])
@Index('idx_matching_config_programa', ['programaId'])
export class MatchingConfiguracaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'programa_id', type: 'int' })
  programaId!: number;

  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;

  @Column({ type: 'int' })
  versao!: number;

  @Column({ type: 'boolean', default: false })
  liberado!: boolean;

  @Column({ name: 'capacidade_por_padrinho', type: 'int' })
  capacidadePorPadrinho!: number;

  @Column({ name: 'capacidade_por_apadrinhado', type: 'int' })
  capacidadePorApadrinhado!: number;

  @Column({ type: 'jsonb' })
  criterios!: CriterioMatching[];

  @Column({ name: 'criado_por', type: 'varchar', length: 120, nullable: true })
  criadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}

export type StatusExecucaoMatching = 'executando' | 'concluida' | 'falha';

@Entity({ name: 'matching_execucoes' })
@Index('idx_matching_execucao_programa', ['programaId', 'criadoEm'])
@Index('uq_matching_execucao_em_andamento', ['programaId'], {
  unique: true,
  where: `"status" = 'executando'`,
})
export class MatchingExecucaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'programa_id', type: 'int' })
  programaId!: number;

  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;

  @Column({ name: 'configuracao_id', type: 'int' })
  configuracaoId!: number;

  @ManyToOne(() => MatchingConfiguracaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'configuracao_id' })
  configuracao!: MatchingConfiguracaoEntity;

  @Column({ type: 'varchar', length: 20 })
  status!: StatusExecucaoMatching;

  @Column({ name: 'config_snapshot', type: 'jsonb' })
  configSnapshot!: Record<string, unknown>;

  @Column({ name: 'formularios_snapshot', type: 'jsonb' })
  formulariosSnapshot!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  erro!: string | null;

  @Column({
    name: 'iniciada_por',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  iniciadaPor!: string | null;

  @Column({ name: 'concluida_em', type: 'timestamptz', nullable: true })
  concluidaEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}

export type StatusSugestaoMatching =
  'pendente' | 'aprovada' | 'recusada' | 'obsoleta';

@Entity({ name: 'matching_sugestoes' })
@Unique('uq_matching_sugestao_execucao_par', [
  'execucaoId',
  'padrinhoParticipacaoId',
  'apadrinhadoParticipacaoId',
])
@Index('idx_matching_sugestao_programa_status', ['programaId', 'status'])
export class MatchingSugestaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'programa_id', type: 'int' })
  programaId!: number;

  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;

  @Column({ name: 'execucao_id', type: 'int' })
  execucaoId!: number;

  @ManyToOne(() => MatchingExecucaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'execucao_id' })
  execucao!: MatchingExecucaoEntity;

  @Column({ name: 'padrinho_participacao_id', type: 'int' })
  padrinhoParticipacaoId!: number;

  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'padrinho_participacao_id' })
  padrinho!: ParticipacaoEntity;

  @Column({ name: 'apadrinhado_participacao_id', type: 'int' })
  apadrinhadoParticipacaoId!: number;

  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'apadrinhado_participacao_id' })
  apadrinhado!: ParticipacaoEntity;

  @Column({ type: 'varchar', length: 20 })
  status!: StatusSugestaoMatching;

  @Column({ type: 'numeric', precision: 8, scale: 4 })
  score!: string;

  @Column({ type: 'jsonb' })
  explicacao!: Record<string, unknown>;

  @Column({
    name: 'decidida_por',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  decididaPor!: string | null;

  @Column({ name: 'decidida_em', type: 'timestamptz', nullable: true })
  decididaEm!: Date | null;

  @Column({ name: 'motivo_decisao', type: 'text', nullable: true })
  motivoDecisao!: string | null;

  @Column({ name: 'vinculo_id', type: 'int', nullable: true })
  vinculoId!: number | null;

  @OneToOne(() => MatchingVinculoEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vinculo_id' })
  vinculo!: MatchingVinculoEntity | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}

@Entity({ name: 'matching_decisoes' })
@Unique('uq_matching_decisao_sugestao', ['sugestaoId'])
export class MatchingDecisaoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'sugestao_id', type: 'int' })
  sugestaoId!: number;

  @OneToOne(() => MatchingSugestaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sugestao_id' })
  sugestao!: MatchingSugestaoEntity;

  @Column({ type: 'varchar', length: 20 })
  decisao!: 'aprovada' | 'recusada';

  @Column({ name: 'responsavel', type: 'varchar', length: 120 })
  responsavel!: string;

  @Column({ type: 'text', nullable: true })
  motivo!: string | null;

  @CreateDateColumn({ name: 'decidida_em', type: 'timestamptz' })
  decididaEm!: Date;
}

@Entity({ name: 'matching_vinculos' })
@Index('idx_matching_vinculo_programa_padrinho', [
  'programaId',
  'padrinhoParticipacaoId',
])
@Index('idx_matching_vinculo_programa_apadrinhado', [
  'programaId',
  'apadrinhadoParticipacaoId',
])
@Index(
  'uq_matching_vinculo_par_ativo',
  ['programaId', 'padrinhoParticipacaoId', 'apadrinhadoParticipacaoId'],
  { unique: true, where: '"ativo" = true' },
)
export class MatchingVinculoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'programa_id', type: 'int' })
  programaId!: number;

  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;

  @Column({ name: 'padrinho_participacao_id', type: 'int' })
  padrinhoParticipacaoId!: number;

  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'padrinho_participacao_id' })
  padrinho!: ParticipacaoEntity;

  @Column({ name: 'apadrinhado_participacao_id', type: 'int' })
  apadrinhadoParticipacaoId!: number;

  @ManyToOne(() => ParticipacaoEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'apadrinhado_participacao_id' })
  apadrinhado!: ParticipacaoEntity;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'origem', type: 'varchar', length: 20, default: 'matching' })
  origem!: 'matching' | 'legado';

  @Column({ name: 'sugestao_id', type: 'int', nullable: true })
  sugestaoId!: number | null;

  @OneToOne(() => MatchingSugestaoEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sugestao_id' })
  sugestao!: MatchingSugestaoEntity | null;

  @Column({
    name: 'confirmado_por',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  confirmadoPor!: string | null;

  @CreateDateColumn({ name: 'confirmado_em', type: 'timestamptz' })
  confirmadoEm!: Date;

  @Column({ name: 'encerrado_em', type: 'timestamptz', nullable: true })
  encerradoEm!: Date | null;
}

export type StatusOutboxMatching =
  'pendente' | 'processando' | 'concluido' | 'falha';

@Entity({ name: 'matching_chat_outbox' })
@Unique('uq_matching_outbox_chave', ['chaveIdempotencia'])
@Index('idx_matching_outbox_status', ['status', 'criadoEm'])
export class MatchingChatOutboxEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chave_idempotencia', type: 'varchar', length: 160 })
  chaveIdempotencia!: string;

  @Column({ name: 'programa_id', type: 'int' })
  programaId!: number;

  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;

  @Column({ name: 'tipo_evento', type: 'varchar', length: 30 })
  tipoEvento!: 'conversa_privada' | 'grupo_coletivo';

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'pendente' })
  status!: StatusOutboxMatching;

  @Column({ type: 'int', default: 0 })
  tentativas!: number;

  @Column({ type: 'text', nullable: true })
  erro!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
