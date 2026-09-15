export type Perfil = 'apadrinhado' | 'padrinho' | 'coordenador';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  curso: string;
  periodo: number;
  xp: number;
  meta: number;
  nivel: number;
}

export interface Aviso {
  id: number;
  titulo: string;
  descricao: string;
  data: string;
}

export const USUARIOS: Record<Perfil, Usuario> = {
  apadrinhado: {
    id: 1,
    nome: 'Camila Duarte',
    email: 'camila@pucminas.edu.br',
    perfil: 'apadrinhado',
    curso: 'Engenharia de Software',
    periodo: 1,
    xp: 1430,
    meta: 2000,
    nivel: 4,
  },
  padrinho: {
    id: 2,
    nome: 'Thiago Moreira',
    email: 'thiago@pucminas.edu.br',
    perfil: 'padrinho',
    curso: 'Engenharia de Software',
    periodo: 8,
    xp: 3120,
    meta: 4000,
    nivel: 7,
  },
  coordenador: {
    id: 3,
    nome: 'Renata Martins',
    email: 'renata@pucminas.edu.br',
    perfil: 'coordenador',
    curso: 'Engenharia de Software',
    periodo: 0,
    xp: 0,
    meta: 0,
    nivel: 0,
  },
};

export const AVISOS: Aviso[] = [
  {
    id: 1,
    titulo: 'Encontro de Boas-vindas',
    descricao: 'Participe do nosso encontro de integração com os padrinhos!',
    data: '2026-09-12',
  },
  {
    id: 2,
    titulo: 'Inscrições abertas',
    descricao: 'Novas vagas para o programa de mentoria.',
    data: '2026-09-10',
  },
  {
    id: 3,
    titulo: 'Materiais de apoio',
    descricao: 'Acesse o guia do calouro com informações importantes.',
    data: '2026-09-08',
  },
];

export const VINCULOS: Record<number, number[]> = {
  1: [2],
  2: [1],
};
