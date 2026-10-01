import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PublicoAviso = 'todos' | 'padrinhos' | 'apadrinhados';

/** Comunicado publicado pela coordenação para os participantes. */
@Entity({ name: 'avisos' })
export class AvisoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  titulo!: string;

  @Column({ type: 'text' })
  descricao!: string;

  @Column({ type: 'varchar', length: 20, default: 'todos' })
  publico!: PublicoAviso;

  @Column({ type: 'varchar', length: 20, nullable: true })
  programa!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
