import type { TipoFormulario } from './entities/formulario.entity.js';

/**
 * Campos fixos do cadastro (perfil e modalidade). Vivem nos apps e não são
 * editáveis no construtor; a coordenação só os vê para distingui-los das
 * perguntas personalizadas. `matching` indica os que já alimentam o matching.
 */
export interface CampoFixo {
  id: string;
  rotulo: string;
  matching: boolean;
}

const PERFIL: CampoFixo[] = [
  { id: 'nome', rotulo: 'Nome completo', matching: false },
  { id: 'email', rotulo: 'E-mail institucional', matching: false },
  { id: 'curso', rotulo: 'Curso', matching: true },
  { id: 'periodo', rotulo: 'Período', matching: true },
  { id: 'turno', rotulo: 'Turno', matching: true },
  { id: 'interesses', rotulo: 'Interesses', matching: true },
];

export const CAMPOS_FIXOS: Record<TipoFormulario, CampoFixo[]> = {
  apadrinhado: [
    ...PERFIL,
    { id: 'areas', rotulo: 'Áreas de apoio', matching: true },
    { id: 'disponibilidade', rotulo: 'Disponibilidade', matching: true },
    { id: 'genero', rotulo: 'Gênero', matching: false },
    { id: 'bolsistaProuni', rotulo: 'Bolsista ProUni', matching: false },
    { id: 'deOutraCidade', rotulo: 'De outra cidade', matching: false },
  ],
  padrinho: [
    ...PERFIL,
    { id: 'motivacao', rotulo: 'Motivação', matching: false },
    { id: 'areas', rotulo: 'Áreas de apoio', matching: true },
    { id: 'disponibilidade', rotulo: 'Disponibilidade', matching: true },
    { id: 'genero', rotulo: 'Gênero', matching: false },
  ],
};
