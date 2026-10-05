import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type TipoFormulario = 'padrinho' | 'apadrinhado';
export type TipoPergunta =
  | 'texto_curto'
  | 'texto_longo'
  | 'checklist'
  | 'dropdown'
  | 'upload';

export interface PerguntaFormulario {
  id: string;
  enunciado: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
}

/**
 * Perguntas extras que a coordenação adiciona ao cadastro de cada papel.
 * Os campos fixos (perfil, gênero, ProUni...) continuam nos apps; aqui ficam
 * apenas as perguntas configuráveis por programa.
 */
@Entity({ name: 'formularios' })
@Unique('uq_formulario_programa_tipo', ['programa', 'tipo'])
export class FormularioEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 20 })
  programa!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: TipoFormulario;

  @Column({ type: 'boolean', default: false })
  publicado!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  perguntas!: PerguntaFormulario[] | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
