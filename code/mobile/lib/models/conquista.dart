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

  /// Desbloqueios desta consulta (para o aviso na tela), como
  /// `chaveDesbloqueio(id, contexto)`: a mesma conquista obtida em dois
  /// semestres aparece duas vezes em [obtidas], e só uma é nova.
  final Set<String> novas;

  static String chaveDesbloqueio(String id, String contexto) => '$id|$contexto';

  /// A obtida [o] tem aviso "Nova!" ainda não confirmado?
  bool ehNova(ConquistaObtida o) =>
      novas.contains(chaveDesbloqueio(o.id, o.contexto));

  /// Desbloqueios cujo aviso a tela exibe, para confirmar ao servidor
  /// (`POST /me/conquistas/vistas`) depois de mostrar.
  List<Map<String, String>> get vistasParaConfirmar => [
    for (final o in obtidas.where(ehNova)) {'id': o.id, 'contexto': o.contexto},
  ];

  /// Texto do aviso das conquistas desbloqueadas agora, ou `null`.
  String? get avisoNovas {
    final novasObtidas = obtidas.where(ehNova).toList();
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
        for (final n in (json['novas'] as List? ?? const []))
          if (n is Map && n['id'] is String && n['contexto'] is String)
            chaveDesbloqueio(n['id'] as String, n['contexto'] as String),
      },
    );
  }
}
