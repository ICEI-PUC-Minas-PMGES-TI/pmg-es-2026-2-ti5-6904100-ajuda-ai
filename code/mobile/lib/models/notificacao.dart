class Notificacao {
  const Notificacao({
    required this.id,
    required this.tipo,
    required this.titulo,
    required this.mensagem,
    required this.link,
    required this.lida,
    required this.criadoEm,
  });

  final String id;
  final String tipo;
  final String titulo;
  final String mensagem;
  final String? link;
  final bool lida;
  final DateTime? criadoEm;

  Notificacao comoLida() => Notificacao(
    id: id,
    tipo: tipo,
    titulo: titulo,
    mensagem: mensagem,
    link: link,
    lida: true,
    criadoEm: criadoEm,
  );

  static Notificacao? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final titulo = json['titulo'];
    if (id is! String || titulo is! String) return null;
    final criado = json['criadoEm'];
    return Notificacao(
      id: id,
      tipo: json['tipo'] as String? ?? '',
      titulo: titulo,
      mensagem: json['mensagem'] as String? ?? '',
      link: json['link'] as String?,
      lida: json['lida'] == true,
      criadoEm: criado is String ? DateTime.tryParse(criado)?.toLocal() : null,
    );
  }
}

class Notificacoes {
  const Notificacoes({required this.naoLidas, required this.itens});

  final int naoLidas;
  final List<Notificacao> itens;

  static const vazias = Notificacoes(naoLidas: 0, itens: []);

  static Notificacoes? fromJson(Object? json) {
    if (json is! Map || json['itens'] is! List) return null;
    final naoLidas = json['naoLidas'];
    return Notificacoes(
      naoLidas: naoLidas is int ? naoLidas : 0,
      itens: [
        for (final item in json['itens'] as List) ?Notificacao.fromJson(item),
      ],
    );
  }
}

String tempoRelativo(DateTime? data, {DateTime? agora}) {
  if (data == null) return '';
  final referencia = agora ?? DateTime.now();
  final minutos = referencia.difference(data).inMinutes;
  if (minutos < 1) return 'agora';
  if (minutos < 60) return 'há $minutos min';
  final hoje = DateTime(referencia.year, referencia.month, referencia.day);
  final dia = DateTime(data.year, data.month, data.day);
  final dias = (hoje.difference(dia).inHours / 24).round();
  if (dias <= 0) return 'há ${minutos ~/ 60} h';
  if (dias == 1) return 'ontem';
  return '${data.day.toString().padLeft(2, '0')}/${data.month.toString().padLeft(2, '0')}';
}
