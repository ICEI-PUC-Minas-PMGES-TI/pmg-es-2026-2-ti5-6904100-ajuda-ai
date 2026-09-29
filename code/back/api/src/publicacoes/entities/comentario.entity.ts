import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PublicacaoEntity } from './publicacao.entity.js';

@Entity({ name: 'comentarios' })
export class ComentarioEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'publicacao_id' })
  publicacaoId: number;

  @Column({ name: 'autor_id', length: 100 })
  autorId: string;

  @Column({ type: 'text' })
  texto: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @ManyToOne(() => PublicacaoEntity, (publicacao) => publicacao.comentarios, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'publicacao_id' })
  publicacao: PublicacaoEntity;
}
