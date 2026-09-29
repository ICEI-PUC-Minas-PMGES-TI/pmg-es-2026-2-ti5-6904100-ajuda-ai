import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ComentarioEntity } from './comentario.entity.js';
import { CurtidaEntity } from './curtida.entity.js';

@Entity({ name: 'publicacoes' })
export class PublicacaoEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  autor: string;

  @Column({ length: 8 })
  iniciais: string;

  @Column({ name: 'descricao_autor', length: 160 })
  descricaoAutor: string;

  @Column({ length: 80 })
  categoria: string;

  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  imagens: string[];

  @Column({ name: 'owner_id', length: 100 })
  ownerId: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @OneToMany(() => CurtidaEntity, (curtida) => curtida.publicacao)
  curtidas: CurtidaEntity[];

  @OneToMany(() => ComentarioEntity, (comentario) => comentario.publicacao)
  comentarios: ComentarioEntity[];
}
