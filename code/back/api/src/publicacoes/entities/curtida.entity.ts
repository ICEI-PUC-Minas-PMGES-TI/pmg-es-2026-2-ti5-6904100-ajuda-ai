import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PublicacaoEntity } from './publicacao.entity.js';

@Entity({ name: 'curtidas' })
@Index(['publicacaoId', 'usuarioId'], { unique: true })
export class CurtidaEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'publicacao_id' })
  publicacaoId: number;

  @Column({ name: 'usuario_id', length: 100 })
  usuarioId: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @ManyToOne(() => PublicacaoEntity, (publicacao) => publicacao.curtidas, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'publicacao_id' })
  publicacao: PublicacaoEntity;
}
