import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { ComentarioEntity } from './comentario.entity.js';
import type { CurtidaEntity } from './curtida.entity.js';

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

  /**
   * Ciclo (semestre) em que a publicação nasceu. A migration deixa NOT NULL;
   * aqui fica nullable só para o `synchronize` de bancos locais antigos
   * (linhas sem ciclo continuam visíveis até alguém rodar a migration).
   */
  @Column({
    name: 'programa_codigo',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  programaCodigo: string | null;

  @Column({ name: 'owner_id', length: 100 })
  ownerId: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @OneToMany('CurtidaEntity', (curtida: CurtidaEntity) => curtida.publicacao)
  curtidas: Relation<CurtidaEntity>[];

  @OneToMany(
    'ComentarioEntity',
    (comentario: ComentarioEntity) => comentario.publicacao,
  )
  comentarios: Relation<ComentarioEntity>[];
}
