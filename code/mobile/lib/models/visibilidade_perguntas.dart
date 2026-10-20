import 'formulario.dart';

/// Operadores alinhados ao backend (`visibilidade-perguntas.ts`).
enum OperadorCondicao {
  igual('igual', 'for igual a'),
  diferente('diferente', 'for diferente de'),
  contem('contem', 'contiver'),
  preenchida('preenchida', 'estiver preenchida'),
  vazia('vazia', 'estiver vazia');

  const OperadorCondicao(this.apiValue, this.rotulo);
  final String apiValue;
  final String rotulo;

  bool get precisaValor =>
      this == igual || this == diferente || this == contem;

  static OperadorCondicao fromApi(String? valor) =>
      OperadorCondicao.values.firstWhere(
        (op) => op.apiValue == valor,
        orElse: () => OperadorCondicao.igual,
      );
}

class CondicaoVisibilidade {
  const CondicaoVisibilidade({
    required this.perguntaId,
    required this.operador,
    this.valor = '',
  });

  final String perguntaId;
  final OperadorCondicao operador;
  final String valor;

  factory CondicaoVisibilidade.fromJson(Map<String, dynamic> json) =>
      CondicaoVisibilidade(
        perguntaId: '${json['perguntaId'] ?? ''}',
        operador: OperadorCondicao.fromApi(json['operador']?.toString()),
        valor: '${json['valor'] ?? ''}',
      );

  Map<String, dynamic> toJson() => {
    'perguntaId': perguntaId,
    'operador': operador.apiValue,
    if (operador.precisaValor) 'valor': valor,
  };

  CondicaoVisibilidade copyWith({
    String? perguntaId,
    OperadorCondicao? operador,
    String? valor,
  }) => CondicaoVisibilidade(
    perguntaId: perguntaId ?? this.perguntaId,
    operador: operador ?? this.operador,
    valor: valor ?? this.valor,
  );
}

bool _preenchida(Object? valor) => switch (valor) {
  String texto => texto.trim().isNotEmpty,
  List lista => lista.isNotEmpty,
  _ => false,
};

bool condicaoSatisfeita(CondicaoVisibilidade condicao, Object? resposta) {
  switch (condicao.operador) {
    case OperadorCondicao.preenchida:
      return _preenchida(resposta);
    case OperadorCondicao.vazia:
      return !_preenchida(resposta);
    case OperadorCondicao.igual:
      if (resposta is List) {
        return resposta.length == 1 && resposta.first == condicao.valor;
      }
      if (resposta == null) return condicao.valor.isEmpty;
      return '$resposta' == condicao.valor;
    case OperadorCondicao.diferente:
      if (!_preenchida(resposta)) return true;
      if (resposta is List) {
        return !(resposta.length == 1 && resposta.first == condicao.valor);
      }
      return '$resposta' != condicao.valor;
    case OperadorCondicao.contem:
      if (resposta is List) return resposta.contains(condicao.valor);
      return '$resposta'.toLowerCase().contains(condicao.valor.toLowerCase());
  }
}

bool perguntaVisivel(
  PerguntaFormulario pergunta,
  Map<String, dynamic> respostas,
) {
  final condicao = pergunta.visivelSe;
  if (condicao == null) return true;
  return condicaoSatisfeita(condicao, respostas[condicao.perguntaId]);
}

List<PerguntaFormulario> perguntasVisiveis(
  List<PerguntaFormulario> perguntas,
  Map<String, dynamic> respostas,
) => [
  for (final pergunta in perguntas)
    if (perguntaVisivel(pergunta, respostas)) pergunta,
];
