class PreferenciaGenero {
  const PreferenciaGenero({required this.modo, this.generos = const []});
  final String modo;
  final List<String> generos;
  static const opcoes = ['Feminino', 'Masculino', 'Não binário'];
  bool get valida => modo == 'sem_preferencia'
      ? generos.isEmpty
      : modo == 'preferencia' &&
            generos.isNotEmpty &&
            generos.toSet().length == generos.length &&
            generos.every(opcoes.contains);
  String get descricao =>
      modo == 'sem_preferencia' ? 'Sem preferência' : generos.join(', ');
  Map<String, dynamic> toJson() => {
    'modo': modo,
    'generos': List<String>.of(generos),
  };
  static PreferenciaGenero? fromJson(Object? valor) {
    if (valor is! Map ||
        valor['modo'] is! String ||
        valor['generos'] is! List) {
      return null;
    }
    final lista = valor['generos'] as List;
    if (lista.any((v) => v is! String)) return null;
    final pref = PreferenciaGenero(
      modo: valor['modo'] as String,
      generos: lista.cast<String>(),
    );
    return pref.valida ? pref : null;
  }
}
