/**
 * Contas de DEMONSTRAÇÃO da gamificação (BL-50). Fictícias: os e-mails novos
 * começam com `demo.` para nunca coincidir com aluno real. Camila, Thiago e
 * Lucas são as contas demo antigas, reaproveitadas.
 *
 * Fonte única para: o seed `npm run seed:demo-gamificacao`, o login demo
 * (`buscarUsuarioPorEmail`) e a documentação. XP e moedas são ESTADOS-ALVO:
 * o seed só grava o que falta (chaves idempotentes) e nunca soma de novo.
 * O nível nunca é gravado: o backend calcula a partir do XP.
 */

export type PapelDemo = 'padrinho' | 'apadrinhado' | 'candidato';
export type SituacaoDemo =
  | 'ativo' // vínculo confirmado no ciclo atual
  | 'aguardando' // aprovado no ciclo atual, ainda sem par (DP-22)
  | 'pendente' // candidatura aguardando análise
  | 'rejeitado' // candidatura não aprovada
  | 'ex'; // participou de um ciclo anterior, sem participação agora

export interface ContaDemo {
  nome: string;
  email: string;
  curso: string;
  periodo: number;
  interesses: string[];
  papel: PapelDemo;
  situacao: SituacaoDemo;
  /** Grupo do vínculo (padrinho + apadrinhados), só para `ativo`. */
  grupo?: string;
  /** XP acumulado desejado (trajetória em ciclos anteriores). */
  xp: number;
  /** Moedas desejadas (o resto foi "usado" — sem resgate real). */
  moedas: number;
  /** O que a conta permite testar. */
  cenario: string;
  /** Conta demo antiga, criada pelo `seed:demo` (só ganha XP aqui). */
  existente?: boolean;
  /**
   * Cenários B/C: XP de totens no ciclo atual criado pelas fixtures (só em
   * banco local, `--fixtures-teto`). Sem fixture a conta fica em 0.
   */
  fixtureTeto?: number;
}

/** Ciclos usados na trajetória de XP (anteriores ao atual). */
export const CICLOS_HISTORICOS_DEMO = ['2025/1', '2025/2', '2026/1'] as const;

export const CONTAS_DEMO_GAMIFICACAO: ContaDemo[] = [
  {
    nome: 'Lucas Almeida',
    email: 'lucas.almeida@pucminas.edu.br',
    curso: 'Engenharia de Software',
    periodo: 1,
    interesses: ['Tecnologia'],
    papel: 'apadrinhado',
    situacao: 'ativo',
    xp: 0,
    moedas: 0,
    cenario: 'Nível 1 · sem XP (estado inicial)',
    existente: true,
  },
  {
    nome: 'Sofia Martins',
    email: 'demo.sofia.martins@pucminas.edu.br',
    curso: 'Psicologia',
    periodo: 1,
    interesses: ['Vida no campus', 'Esportes'],
    papel: 'apadrinhado',
    situacao: 'ativo',
    grupo: 'Demo A',
    xp: 80,
    moedas: 80,
    cenario: 'Nível 2 · apadrinhada ativa (madrinha Mariana)',
  },
  {
    nome: 'Pedro Costa',
    email: 'demo.pedro.costa@pucminas.edu.br',
    curso: 'Sistemas de Informação',
    periodo: 5,
    interesses: ['Programação', 'Carreira'],
    papel: 'padrinho',
    situacao: 'aguardando',
    xp: 220,
    moedas: 120,
    cenario: 'Nível 3 · padrinho aprovado aguardando vínculo (DP-22)',
  },
  {
    nome: 'Ana Ribeiro',
    email: 'demo.ana.ribeiro@pucminas.edu.br',
    curso: 'Arquitetura e Urbanismo',
    periodo: 1,
    interesses: ['Arte', 'Projetos'],
    papel: 'apadrinhado',
    situacao: 'aguardando',
    xp: 380,
    moedas: 280,
    cenario: 'Nível 4 · apadrinhada aprovada aguardando padrinho (DP-22)',
  },
  {
    nome: 'Camila Duarte',
    email: 'camila@pucminas.edu.br',
    curso: 'Engenharia de Software',
    periodo: 1,
    interesses: ['Tecnologia', 'Inovação'],
    papel: 'apadrinhado',
    situacao: 'ativo',
    xp: 580,
    moedas: 180,
    cenario: 'Nível 5 · apadrinhada ativa (padrinho Thiago); barra em 32%',
    existente: true,
  },
  {
    nome: 'Mariana Lopes',
    email: 'demo.mariana.lopes@pucminas.edu.br',
    curso: 'Medicina',
    periodo: 7,
    interesses: ['Saúde', 'Voluntariado'],
    papel: 'padrinho',
    situacao: 'ativo',
    grupo: 'Demo A',
    xp: 900,
    moedas: 450,
    cenario: 'Nível 6 · madrinha ativa (apadrinhada Sofia)',
  },
  {
    nome: 'Thiago Moreira',
    email: 'thiago@pucminas.edu.br',
    curso: 'Engenharia de Software',
    periodo: 8,
    interesses: ['Tecnologia', 'Inovação', 'Projetos'],
    papel: 'padrinho',
    situacao: 'ativo',
    xp: 1310,
    moedas: 610,
    cenario: 'Nível 7 · padrinho ativo (apadrinhada Camila)',
    existente: true,
  },
  {
    nome: 'Rafael Souza',
    email: 'demo.rafael.souza@pucminas.edu.br',
    curso: 'Engenharia Civil',
    periodo: 6,
    interesses: ['Esportes', 'Projetos'],
    papel: 'padrinho',
    situacao: 'ativo',
    grupo: 'Demo B',
    xp: 1650,
    moedas: 850,
    cenario: 'Nível 8 · padrinho ativo (apadrinhada Beatriz)',
  },
  {
    nome: 'Beatriz Santos',
    email: 'demo.beatriz.santos@pucminas.edu.br',
    curso: 'Direito',
    periodo: 2,
    interesses: ['Leitura', 'Debates'],
    papel: 'apadrinhado',
    situacao: 'ativo',
    grupo: 'Demo B',
    xp: 2200,
    moedas: 1200,
    cenario: 'Nível 9 · apadrinhada ativa com nível alto (padrinho Rafael)',
  },
  {
    nome: 'Matheus Oliveira',
    email: 'demo.matheus.oliveira@pucminas.edu.br',
    curso: 'Ciência da Computação',
    periodo: 8,
    interesses: ['Jogos', 'Tecnologia'],
    papel: 'padrinho',
    situacao: 'ativo',
    grupo: 'Demo C',
    xp: 2850,
    moedas: 1500,
    cenario: 'Nível 10 · acima de 2.600 XP (nível máximo); padrinho de Gabriel',
  },
  {
    nome: 'Gabriel Nunes',
    email: 'demo.gabriel.nunes@pucminas.edu.br',
    curso: 'Engenharia Elétrica',
    periodo: 1,
    interesses: ['Robótica'],
    papel: 'apadrinhado',
    situacao: 'ativo',
    grupo: 'Demo C',
    xp: 40,
    moedas: 40,
    cenario: 'Cenário A · faltam 10 XP para o nível 2 (subida de nível)',
  },
  {
    nome: 'Helena Prado',
    email: 'demo.helena.prado@pucminas.edu.br',
    curso: 'Nutrição',
    periodo: 1,
    interesses: ['Saúde'],
    papel: 'apadrinhado',
    situacao: 'aguardando',
    xp: 0,
    moedas: 0,
    cenario:
      'Cenário B · teto de totens (380 de 400 XP no ciclo): fixture só em banco local',
    fixtureTeto: 380,
  },
  {
    nome: 'Igor Fonseca',
    email: 'demo.igor.fonseca@pucminas.edu.br',
    curso: 'Educação Física',
    periodo: 1,
    interesses: ['Esportes'],
    papel: 'apadrinhado',
    situacao: 'aguardando',
    xp: 0,
    moedas: 0,
    cenario:
      'Cenário C · teto de totens atingido (400 XP no ciclo): fixture só em banco local',
    fixtureTeto: 400,
  },
  {
    nome: 'Daniel Rocha',
    email: 'demo.daniel.rocha@pucminas.edu.br',
    curso: 'Administração',
    periodo: 6,
    interesses: ['Empreendedorismo'],
    papel: 'padrinho',
    situacao: 'aguardando',
    xp: 1700,
    moedas: 0,
    cenario: 'Cenário D · XP alto (nível 8) e 0 moedas',
  },
  {
    nome: 'Larissa Pinto',
    email: 'demo.larissa.pinto@pucminas.edu.br',
    curso: 'Engenharia Química',
    periodo: 4,
    interesses: ['Pesquisa'],
    papel: 'candidato',
    situacao: 'pendente',
    xp: 0,
    moedas: 0,
    cenario:
      'Cenário F · candidatura a padrinho pendente (sem ganhos nem resgates)',
  },
  {
    nome: 'Otávio Mendes',
    email: 'demo.otavio.mendes@pucminas.edu.br',
    curso: 'Física',
    periodo: 3,
    interesses: ['Astronomia'],
    papel: 'candidato',
    situacao: 'rejeitado',
    xp: 0,
    moedas: 0,
    cenario: 'Cenário G · candidatura rejeitada com motivo de demonstração',
  },
  {
    nome: 'Bruno Teixeira',
    email: 'demo.bruno.teixeira@pucminas.edu.br',
    curso: 'Jornalismo',
    periodo: 6,
    interesses: ['Fotografia'],
    papel: 'padrinho',
    situacao: 'ex',
    xp: 600,
    moedas: 300,
    cenario:
      'Cenário H · ex-padrinho (2026/1): consulta XP e moedas, sem ganhar nem resgatar',
  },
];

/** Motivo de demonstração da candidatura rejeitada. */
export const MOTIVO_REJEICAO_DEMO =
  'Demonstração: pré-requisitos do ciclo não declarados no formulário.';

export function buscarContaDemo(email: string): ContaDemo | undefined {
  const chave = email.trim().toLowerCase();
  return CONTAS_DEMO_GAMIFICACAO.find((c) => c.email === chave);
}
