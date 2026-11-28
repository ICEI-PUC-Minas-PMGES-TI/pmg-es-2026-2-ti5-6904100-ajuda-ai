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
import { MatchingVinculoEntity } from './matching.entity.js';

@Entity({ name: 'matching_grupos' })
@Index(
  'uq_matching_grupo_padrinho_ciclo',
  ['programaId', 'padrinhoParticipacaoId'],
  { unique: true },
)
export class MatchingGrupoEntity {
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
  @Column({ type: 'varchar', length: 120 }) nome!: string;
  @Column({ name: 'nome_legado', type: 'text', nullable: true }) nomeLegado!:
    string | null;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm!: Date;
}

@Entity({ name: 'matching_vinculos_eventos' })
@Index('uq_matching_vinculo_operacao', ['operacaoId'], { unique: true })
@Index('idx_matching_vinculo_evento_ciclo', ['programaId', 'id'])
export class MatchingVinculoEventoEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'operacao_id', type: 'uuid' }) operacaoId!: string;
  @Column({ name: 'programa_id', type: 'int' }) programaId!: number;
  @ManyToOne(() => ProgramaEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'programa_id' })
  programa!: ProgramaEntity;
  @Column({ type: 'varchar', length: 20 }) acao!:
    'criado' | 'encerrado' | 'transferido';
  @Column({ name: 'vinculo_origem_id', type: 'int', nullable: true })
  vinculoOrigemId!: number | null;
  @ManyToOne(() => MatchingVinculoEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vinculo_origem_id' })
  origem!: MatchingVinculoEntity | null;
  @Column({ name: 'vinculo_destino_id', type: 'int', nullable: true })
  vinculoDestinoId!: number | null;
  @ManyToOne(() => MatchingVinculoEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'vinculo_destino_id' })
  destino!: MatchingVinculoEntity | null;
  @Column({ type: 'varchar', length: 120 }) responsavel!: string;
  @Column({ type: 'text', nullable: true }) motivo!: string | null;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm!: Date;
}
