import 'visibilidade_perguntas.dart';

export 'visibilidade_perguntas.dart';

/// Tipos de pergunta aceitos pelo backend (`/formularios`).
enum TipoPergunta {
  textoCurto('texto_curto', 'Texto curto'),
  textoLongo('texto_longo', 'Texto longo'),
  checklist('checklist', 'Múltipla escolha'),
  dropdown('dropdown', 'Escolha única'),
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
    this.obrigatoria = false,
    this.tipoOriginal,
    this.ajuda = '',
    this.secao = '',
    this.matching = false,
    this.visivelSe,
  });

  final String id;
  final String enunciado;
  final TipoPergunta tipo;
  final String? tipoOriginal;
  final List<String> opcoes;
  final bool obrigatoria;
  final String ajuda;
  final String secao;
  final bool matching;
  final CondicaoVisibilidade? visivelSe;

  factory PerguntaFormulario.fromJson(Map<String, dynamic> json) {
    final condicao = json['visivelSe'];
    return PerguntaFormulario(
      id: '${json['id'] ?? ''}',
      enunciado: '${json['enunciado'] ?? ''}',
      tipo: TipoPergunta.fromApi(json['tipo']?.toString()),
      tipoOriginal: json['tipo']?.toString(),
      opcoes: (json['opcoes'] as List? ?? const [])
          .map((opcao) => '$opcao')
          .toList(),
      obrigatoria: json['obrigatoria'] == true,
      ajuda: '${json['ajuda'] ?? ''}',
      secao: '${json['secao'] ?? ''}',
      matching: json['matching'] == true,
      visivelSe: condicao is Map
          ? CondicaoVisibilidade.fromJson(Map<String, dynamic>.from(condicao))
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'enunciado': enunciado,
    'tipo': tipo.suportado ? tipo.apiValue : tipoOriginal ?? tipo.apiValue,
    'opcoes': opcoes,
    'obrigatoria': obrigatoria,
    if (ajuda.isNotEmpty) 'ajuda': ajuda,
    if (secao.isNotEmpty) 'secao': secao,
    if (matching) 'matching': true,
    if (visivelSe != null) 'visivelSe': visivelSe!.toJson(),
  };

  PerguntaFormulario copyWith({
    String? enunciado,
    TipoPergunta? tipo,
    List<String>? opcoes,
    bool? obrigatoria,
    String? ajuda,
    String? secao,
    bool? matching,
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
      obrigatoria: obrigatoria ?? this.obrigatoria,
      ajuda: ajuda ?? this.ajuda,
      secao: secao ?? this.secao,
      matching: novoTipo.temOpcoes && (matching ?? this.matching),
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
      status: '${json['status'] ?? (json['publicado'] == true ? 'publicado' : 'rascunho')}',
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
