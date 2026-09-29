class DadosCadastro {
  const DadosCadastro({
    required this.nome,
    required this.email,
    required this.curso,
    required this.periodo,
    required this.turno,
    this.interesses = const [],
    this.expectativaPadrinho,
    this.outrasInformacoes,
    this.areasApoio = const [],
    this.disponibilidade,
    this.genero,
    this.bolsistaProuni,
    this.deOutraCidade,
  });

  final String nome;
  final String email;
  final String curso;
  final int periodo;
  final String turno;
  final List<String> interesses;
  final String? expectativaPadrinho;
  final String? outrasInformacoes;
  final List<String> areasApoio;
  final String? disponibilidade;
  final String? genero;
  final bool? bolsistaProuni;
  final bool? deOutraCidade;

  DadosCadastro comPasso2({
    required String? expectativaPadrinho,
    required String? outrasInformacoes,
    required List<String> areasApoio,
    required String? disponibilidade,
    required String? genero,
    required bool? bolsistaProuni,
    required bool? deOutraCidade,
  }) {
    return DadosCadastro(
      nome: nome,
      email: email,
      curso: curso,
      periodo: periodo,
      turno: turno,
      interesses: interesses,
      expectativaPadrinho: expectativaPadrinho,
      outrasInformacoes: outrasInformacoes,
      areasApoio: areasApoio,
      disponibilidade: disponibilidade,
      genero: genero,
      bolsistaProuni: bolsistaProuni,
      deOutraCidade: deOutraCidade,
    );
  }
}
