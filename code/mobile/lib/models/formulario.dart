import 'visibilidade_perguntas.dart';

export 'visibilidade_perguntas.dart';

/// Tipos de pergunta aceitos pelo backend (`/formularios`).
enum TipoPergunta {
  textoCurto('texto_curto', 'Texto curto'),
  textoLongo('texto_longo', 'Texto longo'),
  checklist('checklist', 'Múltipla escolha'),
  dropdown('dropdown', 'Escolha única'),
  simNao('sim_nao', 'Sim / Não'),
  escolhaUnica('escolha_unica', 'Escolha única (matching)'),
  multiplaEscolha('multipla_escolha', 'Múltipla escolha (matching)'),
  naoSuportado('nao_suportado', 'Tipo não suportado');

  const TipoPergunta(this.apiValue, this.rotulo);

  final String apiValue;
  final String rotulo;

  bool get suportado => this != TipoPergunta.naoSuportado;
  static List<TipoPergunta> get suportados =>
      values.where((tipo) => tipo.suportado).toList();

  static List<TipoPergunta> get comuns => const [
        TipoPergunta.textoCurto,
        TipoPergunta.textoLongo,
        TipoPergunta.checklist,
        TipoPergunta.dropdown,
      ];

  bool get temOpcoes =>
      this == TipoPergunta.checklist || this == TipoPergunta.dropdown;

  bool get matching =>
      this == TipoPergunta.simNao ||
      this == TipoPergunta.escolhaUnica ||
      this == TipoPergunta.multiplaEscolha;

  bool get temAlternativas =>
      this == TipoPergunta.escolhaUnica || this == TipoPergunta.multiplaEscolha;

  static TipoPergunta fromApi(String? valor) => TipoPergunta.values.firstWhere(
        (tipo) => tipo.apiValue == valor,
        orElse: () => TipoPergunta.naoSuportado,
      );
}

class AlternativaPergunta {
  const AlternativaPergunta({required this.id, required this.rotulo});

  final String id;
  final String rotulo;

  factory AlternativaPergunta.fromJson(Map<String, dynamic> json) =>
      AlternativaPergunta(
        id: '${json['id'] ?? ''}',
        rotulo: '${json['rotulo'] ?? ''}',
      );

  Map<String, dynamic> toJson() => {'id': id, 'rotulo': rotulo};
}

class CampoFixoFormulario {
  const CampoFixoFormulario({
    required this.id,
    required this.rotulo,
    this.matching = false,
  });

  final String id;
  final String rotulo;
  final bool matching;

  factory CampoFixoFormulario.fromJson(Map<String, dynamic> json) =>
      CampoFixoFormulario(
        id: '${json['id'] ?? ''}',
        rotulo: '${json['rotulo'] ?? ''}',
        matching: json['matching'] == true,
      );
}

class PerguntaFormulario {
  const PerguntaFormulario({
    required this.id,
    required this.enunciado,
    required this.tipo,
    this.opcoes = const [],
    this.alternativas = const [],
    this.obrigatoria = false,
    this.tipoOriginal,
    this.ajuda = '',
    this.secao = '',
    this.matching = false,
    this.criterioId,
    this.criterioVersao,
    this.criterioNome,
    this.visivelSe,
  });

  final String id;
  final String enunciado;
  final TipoPergunta tipo;
  final String? tipoOriginal;
  final List<String> opcoes;
  final List<AlternativaPergunta> alternativas;
  final bool obrigatoria;
  final String ajuda;
  final String secao;
  final bool matching;
  final int? criterioId;
  final int? criterioVersao;
  final String? criterioNome;
  final CondicaoVisibilidade? visivelSe;

  factory PerguntaFormulario.fromJson(Map<String, dynamic> json) {
    final condicao = json['visivelSe'];
    final tipo = TipoPergunta.fromApi(json['tipo']?.toString());
    return PerguntaFormulario(
      id: '${json['id'] ?? ''}',
      enunciado: '${json['enunciado'] ?? ''}',
      tipo: tipo,
      tipoOriginal: json['tipo']?.toString(),
      opcoes: (json['opcoes'] as List? ?? const [])
          .map((opcao) => '$opcao')
          .toList(),
      alternativas: (json['alternativas'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                AlternativaPergunta.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
      obrigatoria: json['obrigatoria'] == true,
      ajuda: '${json['ajuda'] ?? ''}',
      secao: '${json['secao'] ?? ''}',
      matching: json['matching'] == true || tipo.matching,
      criterioId: (json['criterioId'] as num?)?.toInt(),
      criterioVersao: (json['criterioVersao'] as num?)?.toInt(),
      criterioNome: json['criterioNome']?.toString(),
      visivelSe: condicao is Map
          ? CondicaoVisibilidade.fromJson(Map<String, dynamic>.from(condicao))
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'enunciado': enunciado,
        'tipo': tipo.suportado ? tipo.apiValue : tipoOriginal ?? tipo.apiValue,
        'opcoes': tipo.temOpcoes ? opcoes : const [],
        if (tipo.temAlternativas || tipo == TipoPergunta.simNao)
          'alternativas': [for (final a in alternativas) a.toJson()],
        'obrigatoria': obrigatoria,
        if (ajuda.isNotEmpty) 'ajuda': ajuda,
        if (secao.isNotEmpty) 'secao': secao,
        if (tipo.matching && criterioId != null && criterioVersao != null) ...{
          'criterioId': criterioId,
          'criterioVersao': criterioVersao,
          'matching': true,
        },
        if (visivelSe != null) 'visivelSe': visivelSe!.toJson(),
      };

  PerguntaFormulario copyWith({
    String? enunciado,
    TipoPergunta? tipo,
    List<String>? opcoes,
    List<AlternativaPergunta>? alternativas,
    bool? obrigatoria,
    String? ajuda,
    String? secao,
    bool? matching,
    int? criterioId,
    int? criterioVersao,
    String? criterioNome,
    CondicaoVisibilidade? visivelSe,
    bool limparCondicao = false,
  }) {
    final novoTipo = tipo ?? this.tipo;
    return PerguntaFormulario(
      id: id,
      enunciado: enunciado ?? this.enunciado,
      tipo: novoTipo,
      tipoOriginal: novoTipo.suportado ? null : tipoOriginal,
      opcoes: opcoes ?? this.opcoes,
      alternativas: alternativas ?? this.alternativas,
      obrigatoria: obrigatoria ?? this.obrigatoria,
      ajuda: ajuda ?? this.ajuda,
      secao: secao ?? this.secao,
      matching: novoTipo.matching ||
          (novoTipo.temOpcoes && (matching ?? this.matching)),
      criterioId: criterioId ?? this.criterioId,
      criterioVersao: criterioVersao ?? this.criterioVersao,
      criterioNome: criterioNome ?? this.criterioNome,
      visivelSe: limparCondicao ? null : (visivelSe ?? this.visivelSe),
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
    this.status = 'rascunho',
    this.versao = 0,
    this.encerradoEm,
    this.camposFixos = const [],
    this.requisitos = const [],
  });

  final String tipo;
  final String? programa;
  final bool publicado;
  final bool salvo;
  final String status;
  final int versao;
  final String? encerradoEm;
  final List<CampoFixoFormulario> camposFixos;
  final List<RequisitoPadrinho> requisitos;
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
      status:
          '${json['status'] ?? (json['publicado'] == true ? 'publicado' : 'rascunho')}',
      versao: (json['versao'] as num?)?.toInt() ?? 0,
      encerradoEm: json['encerradoEm']?.toString(),
      camposFixos: (json['camposFixos'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                CampoFixoFormulario.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
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
