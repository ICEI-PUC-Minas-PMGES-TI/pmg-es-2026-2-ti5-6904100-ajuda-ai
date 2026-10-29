class FeedComment {
  const FeedComment({
    required this.id,
    required this.texto,
    required this.autorId,
    required this.nome,
    this.fotoUrl,
    this.criadoEm,
    this.paiId,
    this.podeExcluir = false,
    this.curtidas = 0,
    this.curtidoPorMim = false,
  });
  final int id;
  final String texto;
  final String autorId;
  final String nome;
  final String? fotoUrl;
  final DateTime? criadoEm;
  final int? paiId;
  final bool podeExcluir;
  final int curtidas;
  final bool curtidoPorMim;
  factory FeedComment.fromJson(Map<String, dynamic> json) {
    final autor = json['autor'] as Map<String, dynamic>? ?? {};
    return FeedComment(
      id: (json['id'] as num).toInt(),
      texto: json['texto'] as String? ?? '',
      autorId: autor['id']?.toString() ?? '',
      nome: autor['nome'] as String? ?? 'Usuário indisponível',
      fotoUrl: autor['fotoUrl'] as String?,
      criadoEm: DateTime.tryParse(json['criadoEm']?.toString() ?? ''),
      paiId: (json['paiId'] as num?)?.toInt(),
      podeExcluir: json['podeExcluir'] == true,
      curtidas: (json['curtidas'] as num?)?.toInt() ?? 0,
      curtidoPorMim: json['curtidoPorMim'] == true,
    );
  }
  String get iniciais => nome
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .take(2)
      .map((p) => p[0].toUpperCase())
      .join();
}
