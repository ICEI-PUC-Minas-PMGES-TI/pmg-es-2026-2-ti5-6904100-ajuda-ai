import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ComentarioEntity } from './comentario.entity.js';

@Entity({ name: 'curtidas_comentarios' })
@Index(['comentarioId', 'usuarioId'], { unique: true })
export class CurtidaComentarioEntity {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'comentario_id' }) comentarioId: number;
  @Column({ name: 'usuario_id', length: 100 }) usuarioId: string;
  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' }) criadoEm: Date;
  @ManyToOne(() => ComentarioEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comentario_id' })
  comentario: Relation<ComentarioEntity>;
}
