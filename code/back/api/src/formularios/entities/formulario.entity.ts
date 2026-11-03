import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { CondicaoVisibilidade } from '../visibilidade-perguntas.js';

export type { CondicaoVisibilidade };
export type TipoFormulario = 'padrinho' | 'apadrinhado';
export type StatusFormulario = 'rascunho' | 'publicado' | 'encerrado';
export const TIPOS_PERGUNTA_SUPORTADOS = [
  'texto_curto',
  'texto_longo',
  'checklist',
  'dropdown',
  'sim_nao',
  'escolha_unica',
  'multipla_escolha',
] as const;
export type TipoPergunta = (typeof TIPOS_PERGUNTA_SUPORTADOS)[number];
export const TIPOS_PERGUNTA_MATCHING = [
  'sim_nao',
  'escolha_unica',
  'multipla_escolha',
] as const;
export type TipoPerguntaMatching = (typeof TIPOS_PERGUNTA_MATCHING)[number];
export function tipoPerguntaSuportado(tipo: unknown): tipo is TipoPergunta {
  return (
    typeof tipo === 'string' &&
    (TIPOS_PERGUNTA_SUPORTADOS as readonly string[]).includes(tipo)
  );
}
export function tipoPerguntaMatching(
  tipo: unknown,
): tipo is TipoPerguntaMatching {
  return (
    typeof tipo === 'string' &&
    (TIPOS_PERGUNTA_MATCHING as readonly string[]).includes(tipo)
  );
}

export interface AlternativaPergunta {
  id: string;
  rotulo: string;
}

export interface PerguntaFormulario {
  id: string;
  enunciado: string;
  /** String preserva tipos legados na leitura administrativa, sem convertê-los. */
  tipo: string;
  opcoes: string[];
  /** Alternativas estruturadas (perguntas vinculadas ao catálogo de matching). */
  alternativas?: AlternativaPergunta[];
  obrigatoria: boolean;
  /** Texto de ajuda exibido abaixo do enunciado. */
  ajuda?: string;
  /** Seção (agrupamento) em que a pergunta aparece. */
  secao?: string;
  /**
   * LEGADO: checkbox livre em perguntas comuns. Novas perguntas de matching
   * usam `criterioId` + `criterioVersao`.
   */
  matching?: boolean;
  /** Vínculo com o catálogo de critérios de matching. */
  criterioId?: number;
  /** Versão do critério no momento da inclusão no formulário. */
  criterioVersao?: number;
  /** Mostrar só se a condição for verdadeira (depende de pergunta anterior). */
  visivelSe?: CondicaoVisibilidade;
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

  /**
   * Versão em vigor: sobe a cada publicação ou alteração de um formulário
   * publicado. 0 = nunca publicado. Cada resposta guarda a versão respondida.
   */
  @Column({ type: 'int', default: 0 })
  versao!: number;

  /** Quando a coordenação encerrou as novas respostas (`publicado` fica falso). */
  @Column({ name: 'encerrado_em', type: 'timestamptz', nullable: true })
  encerradoEm!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  perguntas!: PerguntaFormulario[] | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
