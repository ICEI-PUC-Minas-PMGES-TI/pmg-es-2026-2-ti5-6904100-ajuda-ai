/// Conquistas do aluno (F32): `GET /me/conquistas`.
library;

class ConquistaObtida {
  const ConquistaObtida({
    required this.id,
    required this.nome,
    required this.descricao,
    required this.imagemUrl,
    required this.criterioTexto,
    required this.contexto,
    required this.xpCreditado,
    required this.desbloqueadaEm,
    required this.arquivada,
  });

  final String id;
  final String nome;
  final String descricao;
  final String? imagemUrl;
  final String criterioTexto;

  /// Ciclo do desbloqueio (ex.: 2026/2) ou `GERAL` (carreira).
  final String contexto;
  final int xpCreditado;
  final DateTime? desbloqueadaEm;
  final bool arquivada;

  String get rotuloContexto =>
      contexto == 'GERAL' ? 'Conquista de carreira' : 'Semestre $contexto';

  static ConquistaObtida? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final nome = json['nome'];
    if (id is! String || nome is! String) return null;
    return ConquistaObtida(
      id: id,
      nome: nome,
      descricao: json['descricao'] as String? ?? '',
      imagemUrl: json['imagemUrl'] as String?,
      criterioTexto: json['criterioTexto'] as String? ?? '',
      contexto: json['contexto'] as String? ?? '',
      xpCreditado: (json['xpCreditado'] as num?)?.toInt() ?? 0,
      desbloqueadaEm: DateTime.tryParse(json['desbloqueadaEm'] as String? ?? '')
          ?.toLocal(),
      arquivada: json['arquivada'] == true,
    );
  }
}

class ConquistaDisponivel {
  const ConquistaDisponivel({
    required this.id,
    required this.nome,
    required this.descricao,
    required this.imagemUrl,
    required this.criterioTexto,
    required this.xp,
    required this.atual,
    required this.meta,
  });

  final String id;
  final String nome;
  final String descricao;
  final String? imagemUrl;
  final String criterioTexto;
  final int xp;
  final int atual;
  final int meta;

  /// 0.0–1.0 para a barra.
  double get fracao => meta <= 0 ? 0 : (atual / meta).clamp(0.0, 1.0);

  static ConquistaDisponivel? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final nome = json['nome'];
    final progresso = json['progresso'];
    if (id is! String || nome is! String || progresso is! Map) return null;
    return ConquistaDisponivel(
      id: id,
      nome: nome,
      descricao: json['descricao'] as String? ?? '',
      imagemUrl: json['imagemUrl'] as String?,
      criterioTexto: json['criterioTexto'] as String? ?? '',
      xp: (json['xp'] as num?)?.toInt() ?? 0,
      atual: (progresso['atual'] as num?)?.toInt() ?? 0,
      meta: (progresso['meta'] as num?)?.toInt() ?? 0,
    );
  }
}

class ColecaoConquistas {
  const ColecaoConquistas({
    required this.ciclo,
    required this.obtidas,
    required this.disponiveis,
    required this.novas,
  });

  final String ciclo;
  final List<ConquistaObtida> obtidas;
  final List<ConquistaDisponivel> disponiveis;

  /// Ids desbloqueados nesta consulta (para o aviso na tela).
  final Set<String> novas;

  /// Texto do aviso das conquistas desbloqueadas agora, ou `null`.
  String? get avisoNovas {
    final novasObtidas = obtidas.where((o) => novas.contains(o.id)).toList();
    if (novasObtidas.isEmpty) return null;
    if (novasObtidas.length == 1) {
      return 'Conquista desbloqueada: ${novasObtidas.first.nome}!';
    }
    return 'Você desbloqueou ${novasObtidas.length} conquistas!';
  }

  static ColecaoConquistas? fromJson(Object? json) {
    if (json is! Map) return null;
    final obtidas = json['obtidas'];
    final disponiveis = json['disponiveis'];
    if (obtidas is! List || disponiveis is! List) return null;
    return ColecaoConquistas(
      ciclo: json['ciclo'] as String? ?? '',
      obtidas: obtidas
          .map(ConquistaObtida.fromJson)
          .whereType<ConquistaObtida>()
          .toList(),
      disponiveis: disponiveis
          .map(ConquistaDisponivel.fromJson)
          .whereType<ConquistaDisponivel>()
          .toList(),
      novas: {
        for (final id in (json['novas'] as List? ?? const []))
          if (id is String) id,
      },
    );
  }
}
