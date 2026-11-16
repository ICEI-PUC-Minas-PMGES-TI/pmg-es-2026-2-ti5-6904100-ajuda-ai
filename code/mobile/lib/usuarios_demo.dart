/// Conjunto fixo exibido no seletor de desenvolvimento.
/// Os e-mails são os mesmos de `USUARIOS` e de `CONTAS_DEMO_GAMIFICACAO` na
/// API. O backend recusa qualquer outro (e o login demo só existe em
/// desenvolvimento, com AUTH_DEMO_ENABLED e fora de produção).
///
/// `cenario` descreve o estado-alvo do seed de demonstração (o que a conta
/// permite testar). Nível e XP reais vêm sempre de `GET /me/xp`.
class UsuarioDemo {
  const UsuarioDemo({
    required this.nome,
    required this.email,
    required this.papel,
    required this.grupo,
    this.cenario,
  });

  final String nome;
  final String email;
  final String papel;
  final String grupo;
  final String? cenario;
}

const usuariosDemo = <UsuarioDemo>[
  // Os 10 níveis (XP/moedas: estado-alvo do seed:demo-gamificacao).
  UsuarioDemo(
    nome: 'Lucas Almeida',
    email: 'lucas.almeida@pucminas.edu.br',
    papel: 'Apadrinhado ativo',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 1 · 0 XP · 0 moedas',
  ),
  UsuarioDemo(
    nome: 'Sofia Martins',
    email: 'demo.sofia.martins@pucminas.edu.br',
    papel: 'Apadrinhada ativa',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 2 · 80 XP · 80 moedas',
  ),
  UsuarioDemo(
    nome: 'Pedro Costa',
    email: 'demo.pedro.costa@pucminas.edu.br',
    papel: 'Padrinho aprovado, aguardando vínculo',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 3 · 220 XP · 120 moedas',
  ),
  UsuarioDemo(
    nome: 'Ana Ribeiro',
    email: 'demo.ana.ribeiro@pucminas.edu.br',
    papel: 'Apadrinhada aprovada, aguardando padrinho',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 4 · 380 XP · 280 moedas',
  ),
  UsuarioDemo(
    nome: 'Camila Duarte',
    email: 'camila@pucminas.edu.br',
    papel: 'Apadrinhada ativa',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 5 · 580 XP · 180 moedas',
  ),
  UsuarioDemo(
    nome: 'Mariana Lopes',
    email: 'demo.mariana.lopes@pucminas.edu.br',
    papel: 'Madrinha ativa',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 6 · 900 XP · 450 moedas',
  ),
  UsuarioDemo(
    nome: 'Thiago Moreira',
    email: 'thiago@pucminas.edu.br',
    papel: 'Padrinho ativo',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 7 · 1.310 XP · 610 moedas',
  ),
  UsuarioDemo(
    nome: 'Rafael Souza',
    email: 'demo.rafael.souza@pucminas.edu.br',
    papel: 'Padrinho ativo',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 8 · 1.650 XP · 850 moedas',
  ),
  UsuarioDemo(
    nome: 'Beatriz Santos',
    email: 'demo.beatriz.santos@pucminas.edu.br',
    papel: 'Apadrinhada ativa',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 9 · 2.200 XP · 1.200 moedas',
  ),
  UsuarioDemo(
    nome: 'Matheus Oliveira',
    email: 'demo.matheus.oliveira@pucminas.edu.br',
    papel: 'Padrinho ativo',
    grupo: 'Níveis 1 a 10',
    cenario: 'Nível 10 · 2.850 XP · 1.500 moedas (máximo)',
  ),
  // Cenários especiais.
  UsuarioDemo(
    nome: 'Gabriel Nunes',
    email: 'demo.gabriel.nunes@pucminas.edu.br',
    papel: 'Apadrinhado ativo',
    grupo: 'Cenários',
    cenario: 'A · faltam 10 XP para o nível 2',
  ),
  UsuarioDemo(
    nome: 'Helena Prado',
    email: 'demo.helena.prado@pucminas.edu.br',
    papel: 'Apadrinhada aprovada, aguardando padrinho',
    grupo: 'Cenários',
    cenario: 'B · perto do teto de totens (só com fixture local)',
  ),
  UsuarioDemo(
    nome: 'Igor Fonseca',
    email: 'demo.igor.fonseca@pucminas.edu.br',
    papel: 'Apadrinhado aprovado, aguardando padrinho',
    grupo: 'Cenários',
    cenario: 'C · teto de totens atingido (só com fixture local)',
  ),
  UsuarioDemo(
    nome: 'Daniel Rocha',
    email: 'demo.daniel.rocha@pucminas.edu.br',
    papel: 'Padrinho aprovado, aguardando vínculo',
    grupo: 'Cenários',
    cenario: 'D · XP alto (nível 8) e 0 moedas',
  ),
  UsuarioDemo(
    nome: 'Larissa Pinto',
    email: 'demo.larissa.pinto@pucminas.edu.br',
    papel: 'Candidata a padrinho (pendente)',
    grupo: 'Cenários',
    cenario: 'F · candidatura pendente',
  ),
  UsuarioDemo(
    nome: 'Otávio Mendes',
    email: 'demo.otavio.mendes@pucminas.edu.br',
    papel: 'Candidato não aprovado',
    grupo: 'Cenários',
    cenario: 'G · candidatura rejeitada com motivo',
  ),
  UsuarioDemo(
    nome: 'Bruno Teixeira',
    email: 'demo.bruno.teixeira@pucminas.edu.br',
    papel: 'Ex-padrinho (2026/1)',
    grupo: 'Cenários',
    cenario: 'H · ex-participante: consulta XP, sem ganhar nem resgatar',
  ),
  // Contas demo antigas do fluxo de candidatura.
  UsuarioDemo(
    nome: 'Ana Beatriz Costa',
    email: 'ana.beatriz@pucminas.edu.br',
    papel: 'Candidata a padrinho',
    grupo: 'Candidatos',
  ),
  UsuarioDemo(
    nome: 'Pedro Henrique Lima',
    email: 'pedro.lima@pucminas.edu.br',
    papel: 'Candidato a padrinho',
    grupo: 'Candidatos',
  ),
  UsuarioDemo(
    nome: 'Julia Fernandes',
    email: 'julia.fernandes@pucminas.edu.br',
    papel: 'Candidata não aprovada',
    grupo: 'Candidatos',
  ),
  UsuarioDemo(
    nome: 'Renata Martins',
    email: 'renata@pucminas.edu.br',
    papel: 'Coordenadora',
    grupo: 'Coordenação',
    cenario: 'I · totens, orçamento, lojinha e participantes',
  ),
];
