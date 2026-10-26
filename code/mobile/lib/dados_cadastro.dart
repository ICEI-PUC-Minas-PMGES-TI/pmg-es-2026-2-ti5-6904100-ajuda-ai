class DadosCadastro {
  const DadosCadastro({
    required this.nome,
    required this.email,
    required this.curso,
    required this.periodo,
    required this.turno,
    this.interesses = const [],
    this.sobre,
    this.expectativaPadrinho,
    this.outrasInformacoes,
    this.areasApoio = const [],
    this.disponibilidade,
    this.genero,
    this.bolsistaProuni,
    this.deOutraCidade,
    this.requisitosCumpridos = const {},
    this.declaraPrimeiroPeriodo = false,
    this.extras = const {},
  });

  final String nome;
  final String email;
  final String curso;
  final int periodo;
  final String turno;
  final List<String> interesses;

  /// Texto opcional exibido no perfil, preenchido pelo próprio aluno.
  final String? sobre;

  /// Apadrinhado: o que espera do padrinho. Padrinho: motivação.
  final String? expectativaPadrinho;

  /// Apadrinhado: outras informações. Padrinho: experiências relevantes.
  final String? outrasInformacoes;
  final List<String> areasApoio;

  /// Disponibilidade(s) separadas por ", ".
  final String? disponibilidade;
  final String? genero;
  final bool? bolsistaProuni;
  final bool? deOutraCidade;

  /// Padrinho: id do requisito do ciclo → declarou que cumpre. Os
  /// requisitos vêm da coordenação (backend); nada é fixo no app.
  final Map<String, bool> requisitosCumpridos;

  /// Apadrinhado: declaração explícita de 1º período.
  final bool declaraPrimeiroPeriodo;

  /// Respostas às perguntas adicionais do formulário publicado.
  final Map<String, dynamic> extras;

  List<String> get disponibilidadeLista => (disponibilidade ?? '')
      .split(',')
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();

  DadosCadastro comPasso2({
    required String? expectativaPadrinho,
    required String? outrasInformacoes,
    required List<String> areasApoio,
    required String? disponibilidade,
    required String? genero,
    required bool? bolsistaProuni,
    required bool? deOutraCidade,
    Map<String, bool>? requisitosCumpridos,
    bool? declaraPrimeiroPeriodo,
    Map<String, dynamic>? extras,
  }) {
    return DadosCadastro(
      nome: nome,
      email: email,
      curso: curso,
      periodo: periodo,
      turno: turno,
      interesses: interesses,
      sobre: sobre,
      expectativaPadrinho: expectativaPadrinho,
      outrasInformacoes: outrasInformacoes,
      areasApoio: areasApoio,
      disponibilidade: disponibilidade,
      genero: genero,
      bolsistaProuni: bolsistaProuni,
      deOutraCidade: deOutraCidade,
      requisitosCumpridos: requisitosCumpridos ?? this.requisitosCumpridos,
      declaraPrimeiroPeriodo:
          declaraPrimeiroPeriodo ?? this.declaraPrimeiroPeriodo,
      extras: extras ?? this.extras,
    );
  }

  DadosCadastro copyWith({
    String? nome,
    String? email,
    String? curso,
    int? periodo,
    String? turno,
    List<String>? interesses,
    String? sobre,
    bool limparSobre = false,
  }) {
    return DadosCadastro(
      nome: nome ?? this.nome,
      email: email ?? this.email,
      curso: curso ?? this.curso,
      periodo: periodo ?? this.periodo,
      turno: turno ?? this.turno,
      interesses: interesses ?? this.interesses,
      sobre: limparSobre ? null : sobre ?? this.sobre,
      expectativaPadrinho: expectativaPadrinho,
      outrasInformacoes: outrasInformacoes,
      areasApoio: areasApoio,
      disponibilidade: disponibilidade,
      genero: genero,
      bolsistaProuni: bolsistaProuni,
      deOutraCidade: deOutraCidade,
      requisitosCumpridos: requisitosCumpridos,
      declaraPrimeiroPeriodo: declaraPrimeiroPeriodo,
      extras: extras,
    );
  }

  static String? _texto(String? valor) {
    final limpo = valor?.trim();
    return limpo == null || limpo.isEmpty ? null : limpo;
  }

  Map<String, dynamic> _perfil() => {
    'nome': nome,
    'curso': curso,
    'periodo': periodo,
    'turno': turno,
    'interesses': interesses,
  };

  /// Corpo `respostas` do cadastro como apadrinhado (`POST /cadastro`).
  Map<String, dynamic> respostasApadrinhado() => {
    ..._perfil(),
    'genero': ?genero,
    'bolsistaProuni': ?bolsistaProuni,
    'deOutraCidade': ?deOutraCidade,
    'disponibilidade': disponibilidadeLista,
    'areas': areasApoio,
    'expectativa': ?_texto(expectativaPadrinho),
    'outrasInformacoes': ?_texto(outrasInformacoes),
    'declaraPrimeiroPeriodo': declaraPrimeiroPeriodo,
    'extras': extras,
  };

  /// Corpo `respostas` do cadastro como padrinho (`POST /cadastro`).
  Map<String, dynamic> respostasPadrinho() => {
    ..._perfil(),
    'motivacao': ?_texto(expectativaPadrinho),
    'experiencias': ?_texto(outrasInformacoes),
    'areas': areasApoio,
    'disponibilidade': disponibilidadeLista,
    'genero': ?genero,
    'bolsistaProuni': ?bolsistaProuni,
    'deOutraCidade': ?deOutraCidade,
    'requisitos': [
      for (final item in requisitosCumpridos.entries)
        {'id': item.key, 'cumpre': item.value},
    ],
    'extras': extras,
  };

  /// Reconstrói os dados a partir das `respostas` salvas no backend
  /// (usado em "Editar candidatura").
  DadosCadastro comRespostas(
    Map<String, dynamic> respostas, {
    required bool padrinho,
  }) {
    List<String> lista(Object? valor) =>
        valor is List ? valor.map((e) => '$e').toList() : const [];
    final extrasSalvos = respostas['extras'];
    return DadosCadastro(
      nome: _texto(respostas['nome'] as String?) ?? nome,
      email: email,
      curso: _texto(respostas['curso'] as String?) ?? curso,
      periodo: (respostas['periodo'] as num?)?.toInt() ?? periodo,
      turno: _texto(respostas['turno'] as String?) ?? turno,
      interesses: respostas['interesses'] is List
          ? lista(respostas['interesses'])
          : interesses,
      sobre: _texto(respostas['sobre'] as String?) ?? sobre,
      expectativaPadrinho:
          (padrinho ? respostas['motivacao'] : respostas['expectativa'])
              as String?,
      outrasInformacoes:
          (padrinho
                  ? respostas['experiencias']
                  : respostas['outrasInformacoes'])
              as String?,
      areasApoio: lista(respostas['areas']),
      disponibilidade: lista(respostas['disponibilidade']).join(', '),
      genero: respostas['genero'] as String?,
      bolsistaProuni: respostas['bolsistaProuni'] as bool?,
      deOutraCidade: respostas['deOutraCidade'] as bool?,
      requisitosCumpridos: {
        for (final item in (respostas['requisitos'] as List? ?? const []))
          if (item is Map && item['id'] != null)
            '${item['id']}': item['cumpre'] == true,
      },
      declaraPrimeiroPeriodo: respostas['declaraPrimeiroPeriodo'] == true,
      extras: extrasSalvos is Map
          ? Map<String, dynamic>.from(extrasSalvos)
          : const {},
    );
  }
}
