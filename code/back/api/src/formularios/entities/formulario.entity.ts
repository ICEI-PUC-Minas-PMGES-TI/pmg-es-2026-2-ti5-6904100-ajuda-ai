import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type TipoFormulario = 'padrinho' | 'apadrinhado';
export const TIPOS_PERGUNTA_SUPORTADOS = [
  'texto_curto',
  'texto_longo',
  'checklist',
  'dropdown',
] as const;
export type TipoPergunta = (typeof TIPOS_PERGUNTA_SUPORTADOS)[number];
export function tipoPerguntaSuportado(tipo: unknown): tipo is TipoPergunta {
  return (
    typeof tipo === 'string' &&
    (TIPOS_PERGUNTA_SUPORTADOS as readonly string[]).includes(tipo)
  );
}

export interface PerguntaFormulario {
  id: string;
  enunciado: string;
  /** String preserva tipos legados na leitura administrativa, sem convertê-los. */
  tipo: string;
  opcoes: string[];
  obrigatoria: boolean;
  visivelSe?: {
    perguntaId: string;
    operador: 'igual' | 'diferente' | 'contem' | 'preenchida' | 'vazia';
    valor?: string;
  };
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

  @Column({ type: 'int', default: 0 })
  versao!: number;

  @Column({ name: 'encerrado_em', type: 'timestamptz', nullable: true })
  encerradoEm!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  perguntas!: PerguntaFormulario[] | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
