import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProgramaEntity } from '../../programas/entities/programa.entity.js';
import { ParticipacaoEntity } from '../../participacoes/entities/participacao.entity.js';
import { MatchingSugestaoEntity } from './matching.entity.js';

/** Histórico imutável. A última decisão do par no ciclo determina o impedimento. */
@Entity({ name: 'matching_pares_decisoes' })
@Index('idx_matching_par_decisao_ciclo_par', [
  'programaId',
  'padrinhoParticipacaoId',
  'apadrinhadoParticipacaoId',
  'id',
])
@Index('uq_matching_par_recusa_sugestao', ['sugestaoId'], {
  unique: true,
  where: '"acao" = \'recusado\'',
})
export class MatchingParDecisaoEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'programa_id', type: 'int' }) programaId!: number;
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
  @Column({ type: 'varchar', length: 20 }) acao!: 'recusado' | 'reconsiderado';
  @Column({ type: 'varchar', length: 120 }) responsavel!: string;
  @Column({ type: 'text', nullable: true }) motivo!: string | null;
  @Column({ name: 'sugestao_id', type: 'int', nullable: true }) sugestaoId!:
    number | null;
  @ManyToOne(() => MatchingSugestaoEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'sugestao_id' })
  sugestao!: MatchingSugestaoEntity | null;
  @Column({ name: 'evento_anterior_id', type: 'int', nullable: true })
  eventoAnteriorId!: number | null;
  @ManyToOne(() => MatchingParDecisaoEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'evento_anterior_id' })
  eventoAnterior!: MatchingParDecisaoEntity | null;
  @CreateDateColumn({ name: 'decidida_em', type: 'timestamptz' })
  decididaEm!: Date;
}
