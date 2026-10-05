import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type EtapaPrograma =
  | 'inscricoes'
  | 'analise'
  | 'formacao'
  | 'andamento'
  | 'encerramento';

@Entity({ name: 'programas' })
@Unique('uq_programa_codigo', ['codigo'])
export class ProgramaEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Ex.: 2026/2 */
  @Column({ type: 'varchar', length: 20 })
  codigo!: string;

  @Column({ type: 'varchar', length: 120 })
  titulo!: string;

  @Column({ name: 'etapa_atual', type: 'varchar', length: 30 })
  etapaAtual!: EtapaPrograma;

  @Column({ name: 'inscricoes_abertas', type: 'boolean', default: false })
  inscricoesAbertas!: boolean;

  @Column({ name: 'formulario_publicado', type: 'boolean', default: false })
  formularioPublicado!: boolean;

  @Column({ name: 'matching_pendente', type: 'boolean', default: false })
  matchingPendente!: boolean;

  @Column({ name: 'vagas_apadrinhados', type: 'int', default: 0 })
  vagasApadrinhados!: number;

  @Column({ name: 'grupos_previstos', type: 'int', default: 0 })
  gruposPrevistos!: number;

  @Column({ name: 'inscricoes_inicio', type: 'date', nullable: true })
  inscricoesInicio!: string;

  @Column({ name: 'inscricoes_fim', type: 'date', nullable: true })
  inscricoesFim!: string;

  @Column({ name: 'analise_inicio', type: 'date', nullable: true })
  analiseInicio!: string;

  @Column({ name: 'analise_fim', type: 'date', nullable: true })
  analiseFim!: string;

  @Column({ name: 'formacao_inicio', type: 'date', nullable: true })
  formacaoInicio!: string;

  @Column({ name: 'formacao_fim', type: 'date', nullable: true })
  formacaoFim!: string;

  @Column({ name: 'andamento_inicio', type: 'date', nullable: true })
  andamentoInicio!: string;

  @Column({ name: 'andamento_fim', type: 'date', nullable: true })
  andamentoFim!: string;

  @Column({ name: 'encerramento_em', type: 'date', nullable: true })
  encerramentoEm!: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
