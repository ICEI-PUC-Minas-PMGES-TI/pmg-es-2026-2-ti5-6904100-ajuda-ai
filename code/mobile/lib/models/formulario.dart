/// Tipos de pergunta aceitos pelo backend (`/formularios`).
enum TipoPergunta {
  textoCurto('texto_curto', 'Texto curto'),
  textoLongo('texto_longo', 'Texto longo'),
  checklist('checklist', 'Checklist (várias opções)'),
  dropdown('dropdown', 'Lista suspensa (uma opção)'),
  naoSuportado('nao_suportado', 'Tipo não suportado');

  const TipoPergunta(this.apiValue, this.rotulo);

  final String apiValue;
  final String rotulo;

  bool get suportado => this != TipoPergunta.naoSuportado;
  static List<TipoPergunta> get suportados =>
      values.where((tipo) => tipo.suportado).toList();

  bool get temOpcoes =>
      this == TipoPergunta.checklist || this == TipoPergunta.dropdown;

  static TipoPergunta fromApi(String? valor) => TipoPergunta.values.firstWhere(
    (tipo) => tipo.apiValue == valor,
    orElse: () => TipoPergunta.naoSuportado,
  );
}

class PerguntaFormulario {
  const PerguntaFormulario({
    required this.id,
    required this.enunciado,
    required this.tipo,
    this.opcoes = const [],
    this.obrigatoria = false,
    this.tipoOriginal,
  });

  final String id;
  final String enunciado;
  final TipoPergunta tipo;
  final String? tipoOriginal;
  final List<String> opcoes;
  final bool obrigatoria;

  factory PerguntaFormulario.fromJson(Map<String, dynamic> json) {
    return PerguntaFormulario(
      id: '${json['id'] ?? ''}',
      enunciado: '${json['enunciado'] ?? ''}',
      tipo: TipoPergunta.fromApi(json['tipo']?.toString()),
      tipoOriginal: json['tipo']?.toString(),
      opcoes: (json['opcoes'] as List? ?? const [])
          .map((opcao) => '$opcao')
          .toList(),
      obrigatoria: json['obrigatoria'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'enunciado': enunciado,
    'tipo': tipo.suportado ? tipo.apiValue : tipoOriginal ?? tipo.apiValue,
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
      tipoOriginal: (tipo ?? this.tipo).suportado ? null : tipoOriginal,
      opcoes: opcoes ?? this.opcoes,
      obrigatoria: obrigatoria ?? this.obrigatoria,
    );
  }
}

const mensagemFormularioNaoSuportado =
    'Formulário contém tipo de pergunta não suportado. Procure a coordenação.';

class FormularioNaoSuportado implements Exception {
  const FormularioNaoSuportado([
    this.mensagem = mensagemFormularioNaoSuportado,
  ]);
  final String mensagem;
  @override
  String toString() => mensagem;
}

/// Requisito para padrinho definido pela coordenação para o ciclo
/// (`requisitos` em `GET /formularios/padrinho`).
class RequisitoPadrinho {
  const RequisitoPadrinho({
    required this.id,
    required this.descricao,
    this.obrigatorio = true,
  });

  final String id;
  final String descricao;

  /// Obrigatório: sem ele o backend recusa a candidatura.
  final bool obrigatorio;

  factory RequisitoPadrinho.fromJson(Map<String, dynamic> json) =>
      RequisitoPadrinho(
        id: '${json['id'] ?? ''}',
        descricao: '${json['descricao'] ?? ''}',
        obrigatorio: json['obrigatorio'] != false,
      );
}

class Formulario {
  const Formulario({
    required this.tipo,
    required this.publicado,
    required this.perguntas,
    this.programa,
    this.salvo = true,
    this.requisitos = const [],
  });

  /// Só no formulário de padrinho: requisitos do ciclo.
  final List<RequisitoPadrinho> requisitos;

  final String tipo;
  final String? programa;
  final bool publicado;
  final bool salvo;
  final List<PerguntaFormulario> perguntas;

  void exigirTiposSuportados() {
    if (perguntas.any((p) => !p.tipo.suportado)) {
      throw const FormularioNaoSuportado();
    }
  }

  factory Formulario.fromJson(Map<String, dynamic> json) {
    return Formulario(
      tipo: '${json['tipo'] ?? ''}',
      programa: json['programa'] as String?,
      publicado: json['publicado'] == true,
      salvo: json['salvo'] != false,
      requisitos: (json['requisitos'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                RequisitoPadrinho.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
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
