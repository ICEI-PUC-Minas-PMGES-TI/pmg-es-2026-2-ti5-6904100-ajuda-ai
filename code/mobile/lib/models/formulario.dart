/// Tipos de pergunta aceitos pelo backend (`/formularios`).
enum TipoPergunta {
  textoCurto('texto_curto', 'Texto curto'),
  textoLongo('texto_longo', 'Texto longo'),
  checklist('checklist', 'Checklist (várias opções)'),
  dropdown('dropdown', 'Lista suspensa (uma opção)'),
  upload('upload', 'Envio de arquivo');

  const TipoPergunta(this.apiValue, this.rotulo);

  final String apiValue;
  final String rotulo;

  bool get temOpcoes =>
      this == TipoPergunta.checklist || this == TipoPergunta.dropdown;

  static TipoPergunta fromApi(String? valor) => TipoPergunta.values.firstWhere(
    (tipo) => tipo.apiValue == valor,
    orElse: () => TipoPergunta.textoCurto,
  );
}

class PerguntaFormulario {
  const PerguntaFormulario({
    required this.id,
    required this.enunciado,
    required this.tipo,
    this.opcoes = const [],
    this.obrigatoria = false,
  });

  final String id;
  final String enunciado;
  final TipoPergunta tipo;
  final List<String> opcoes;
  final bool obrigatoria;

  factory PerguntaFormulario.fromJson(Map<String, dynamic> json) {
    return PerguntaFormulario(
      id: '${json['id'] ?? ''}',
      enunciado: '${json['enunciado'] ?? ''}',
      tipo: TipoPergunta.fromApi(json['tipo'] as String?),
      opcoes: (json['opcoes'] as List? ?? const [])
          .map((opcao) => '$opcao')
          .toList(),
      obrigatoria: json['obrigatoria'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'enunciado': enunciado,
    'tipo': tipo.apiValue,
    'opcoes': opcoes,
    'obrigatoria': obrigatoria,
  };

  PerguntaFormulario copyWith({
    String? enunciado,
    TipoPergunta? tipo,
    List<String>? opcoes,
    bool? obrigatoria,
  }) {
    return PerguntaFormulario(
      id: id,
      enunciado: enunciado ?? this.enunciado,
      tipo: tipo ?? this.tipo,
      opcoes: opcoes ?? this.opcoes,
      obrigatoria: obrigatoria ?? this.obrigatoria,
    );
  }
}

class Formulario {
  const Formulario({
    required this.tipo,
    required this.publicado,
    required this.perguntas,
    this.programa,
    this.salvo = true,
  });

  final String tipo;
  final String? programa;
  final bool publicado;
  final bool salvo;
  final List<PerguntaFormulario> perguntas;

  factory Formulario.fromJson(Map<String, dynamic> json) {
    return Formulario(
      tipo: '${json['tipo'] ?? ''}',
      programa: json['programa'] as String?,
      publicado: json['publicado'] == true,
      salvo: json['salvo'] != false,
      perguntas: (json['perguntas'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                PerguntaFormulario.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}
