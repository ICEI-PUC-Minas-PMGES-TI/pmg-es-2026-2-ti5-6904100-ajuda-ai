import { ambienteApp } from '../config/ambiente.js';

export type Perfil = 'apadrinhado' | 'padrinho' | 'coordenador' | 'nenhuma';

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
  fotoUrl?: string | null;
}

export interface Aviso {
  id: number;
  titulo: string;
  descricao: string;
  data: string;
}

/**
 * Base demo. O coordenador é mockado e só existe aqui; os alunos servem de
 * semente para a tabela `usuarios` (ver UsuariosService) e de dados de
 * exibição para registros antigos.
 */
export const USUARIOS: Record<string, Usuario> = {
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
  candidato1: {
    id: 4,
    nome: 'Ana Beatriz Costa',
    email: 'ana.beatriz@pucminas.edu.br',
    perfil: 'padrinho',
    curso: 'Ciência da Computação',
    periodo: 5,
    xp: 900,
    meta: 2000,
    nivel: 3,
  },
  candidato2: {
    id: 5,
    nome: 'Pedro Henrique Lima',
    email: 'pedro.lima@pucminas.edu.br',
    perfil: 'padrinho',
    curso: 'Sistemas de Informação',
    periodo: 4,
    xp: 700,
    meta: 2000,
    nivel: 2,
  },
  candidato3: {
    id: 6,
    nome: 'Julia Fernandes',
    email: 'julia.fernandes@pucminas.edu.br',
    perfil: 'padrinho',
    curso: 'Engenharia de Computação',
    periodo: 6,
    xp: 1100,
    meta: 2000,
    nivel: 3,
  },
  apadrinhado2: {
    id: 7,
    nome: 'Lucas Almeida',
    email: 'lucas.almeida@pucminas.edu.br',
    perfil: 'apadrinhado',
    curso: 'Engenharia de Software',
    periodo: 1,
    xp: 200,
    meta: 2000,
    nivel: 1,
  },
  apadrinhado3: {
    id: 8,
    nome: 'Marina Souza',
    email: 'marina.souza@pucminas.edu.br',
    perfil: 'apadrinhado',
    curso: 'Ciência da Computação',
    periodo: 1,
    xp: 120,
    meta: 2000,
    nivel: 1,
  },
};

export function buscarUsuarioPorEmail(email: string): Usuario | undefined {
  const chave = email.trim().toLowerCase();
  return Object.values(USUARIOS).find(
    (item) => item.email.toLowerCase() === chave,
  );
}

/**
 * Coordenadores reais, configurados por ambiente (não há coordenador no banco):
 * COORDENADORES_EMAILS="ana@pucminas.edu.br|Ana Souza,bruno@pucminas.edu.br".
 * O nome é opcional. Ids altos e estáveis pela ordem da lista.
 */
export function coordenadoresConfigurados(
  valor: string | undefined = process.env.COORDENADORES_EMAILS,
): Usuario[] {
  return (valor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, indice) => {
      const [emailBruto, nomeBruto] = item.split('|');
      const email = emailBruto.trim().toLowerCase();
      return {
        id: 9000 + indice,
        nome: nomeBruto?.trim() || email.split('@')[0],
        email,
        perfil: 'coordenador' as const,
        curso: '',
        periodo: 0,
        xp: 0,
        meta: 0,
        nivel: 0,
      };
    })
    .filter((usuario) => usuario.email.includes('@'));
}

/**
 * Coordenação: primeiro a lista configurada (COORDENADORES_EMAILS); depois a
 * coordenadora fictícia da base demo, que NÃO existe em produção.
 */
export function buscarCoordenadorPorEmail(email: string): Usuario | undefined {
  const chave = email.trim().toLowerCase();
  const configurado = coordenadoresConfigurados().find((c) => c.email === chave);
  if (configurado) return configurado;
  if (ambienteApp() === 'producao') return undefined;
  const usuario = buscarUsuarioPorEmail(email);
  return usuario?.perfil === 'coordenador' ? usuario : undefined;
}

export function buscarUsuarioPorId(id: number): Usuario | undefined {
  return Object.values(USUARIOS).find((item) => item.id === id);
}

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
