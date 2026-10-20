/// Conjunto fixo exibido no seletor de desenvolvimento.
/// Os e-mails são os mesmos de `USUARIOS` na API. O backend recusa qualquer outro.
class UsuarioDemo {
  const UsuarioDemo({
    required this.nome,
    required this.email,
    required this.papel,
    required this.grupo,
  });

  final String nome;
  final String email;
  final String papel;
  final String grupo;
}

const usuariosDemo = <UsuarioDemo>[
  UsuarioDemo(
    nome: 'Camila Duarte',
    email: 'camila@pucminas.edu.br',
    papel: 'Apadrinhada',
    grupo: 'Apadrinhados',
  ),
  UsuarioDemo(
    nome: 'Lucas Almeida',
    email: 'lucas.almeida@pucminas.edu.br',
    papel: 'Apadrinhado',
    grupo: 'Apadrinhados',
  ),
  UsuarioDemo(
    nome: 'Thiago Moreira',
    email: 'thiago@pucminas.edu.br',
    papel: 'Padrinho',
    grupo: 'Padrinhos',
  ),
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
  ),
];
