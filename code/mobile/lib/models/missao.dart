import 'resumo_gamificacao.dart';

enum StatusMissao { disponivel, limitada, concluida }

StatusMissao _status(Object? valor) => switch (valor) {
  'concluida' => StatusMissao.concluida,
  'limitada' => StatusMissao.limitada,
  _ => StatusMissao.disponivel,
};

DateTime? _data(Object? valor) =>
    valor is String ? DateTime.tryParse(valor)?.toLocal() : null;

int _inteiro(Object? valor) => valor is int ? valor : 0;

class ConclusaoAnterior {
  const ConclusaoAnterior({
    required this.xp,
    required this.moedas,
    required this.limitado,
    required this.concluidaEm,
  });

  final int xp;
  final int moedas;
  final bool limitado;
  final DateTime? concluidaEm;

  static ConclusaoAnterior? fromJson(Object? json) {
    if (json is! Map) return null;
    return ConclusaoAnterior(
      xp: _inteiro(json['xp']),
      moedas: _inteiro(json['moedas']),
      limitado: json['limitado'] == true,
      concluidaEm: _data(json['concluidaEm']),
    );
  }
}

enum RequisitoMissao {
  pucstops,
  evento,
  feedPublicacoes,
  feedComentarios,
  feedCurtidas,
  chatMensagens,
  codigo,
  desconhecido;

  static RequisitoMissao de(Object? valor) => switch (valor) {
    'PUCSTOPS' => pucstops,
    'EVENTO' => evento,
    'FEED_PUBLICACOES' => feedPublicacoes,
    'FEED_COMENTARIOS' => feedComentarios,
    'FEED_CURTIDAS' => feedCurtidas,
    'CHAT_MENSAGENS' => chatMensagens,
    'CODIGO' => codigo,
    _ => desconhecido,
  };
}

class ProgressoMissao {
  const ProgressoMissao({required this.atual, required this.meta});

  final int atual;
  final int meta;

  int get faltam => (meta - atual).clamp(0, meta);
  double get fracao => meta <= 0 ? 0 : (atual / meta).clamp(0, 1).toDouble();

  static ProgressoMissao? fromJson(Object? json) {
    if (json is! Map) return null;
    final atual = json['atual'];
    final meta = json['meta'];
    if (atual is! int || meta is! int || meta < 1) return null;
    return ProgressoMissao(atual: atual.clamp(0, meta), meta: meta);
  }
}

class AlvoMissao {
  const AlvoMissao({
    required this.evento,
    required this.id,
    required this.nome,
    this.checkinAbre,
    this.inicio,
    this.fim,
    this.latitude,
    this.longitude,
    this.local,
  });

  final bool evento;
  final String id;
  final String nome;
  final DateTime? checkinAbre;
  final DateTime? inicio;
  final DateTime? fim;
  final double? latitude;
  final double? longitude;
  final String? local;

  static AlvoMissao? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final nome = json['nome'];
    if (id is! String || nome is! String) return null;
    double? numero(Object? v) => v is num ? v.toDouble() : null;
    return AlvoMissao(
      evento: json['tipo'] == 'evento',
      id: id,
      nome: nome,
      checkinAbre: _data(json['checkinAbre']),
      inicio: _data(json['inicio']),
      fim: _data(json['fim']),
      latitude: numero(json['latitude']),
      longitude: numero(json['longitude']),
      local: json['local'] as String?,
    );
  }
}

class Missao {
  const Missao({
    required this.id,
    required this.titulo,
    required this.descricao,
    required this.semanal,
    required this.xp,
    required this.moedas,
    required this.fim,
    required this.status,
    required this.xpPrevisto,
    required this.conclusao,
    this.requisito = RequisitoMissao.desconhecido,
    this.progresso,
    this.pronta = false,
    this.alvo,
  });

  final RequisitoMissao requisito;
  final ProgressoMissao? progresso;

  final bool pronta;
  final AlvoMissao? alvo;

  final String id;
  final String titulo;
  final String descricao;
  final bool semanal;
  final int xp;
  final int moedas;
  final DateTime? fim;
  final StatusMissao status;
  final int xpPrevisto;
  final ConclusaoAnterior? conclusao;

  bool get concluida => status == StatusMissao.concluida;

  static Missao? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final titulo = json['titulo'];
    if (id is! String || titulo is! String) return null;
    return Missao(
      id: id,
      titulo: titulo,
      descricao: json['descricao'] as String? ?? '',
      semanal: json['tipo'] == 'SEMANAL',
      xp: _inteiro(json['xp']),
      moedas: _inteiro(json['moedas']),
      fim: _data(json['fim']),
      status: _status(json['status']),
      xpPrevisto: _inteiro(json['xpPrevisto']),
      conclusao: ConclusaoAnterior.fromJson(json['conclusao']),
      requisito: RequisitoMissao.de(json['requisito']),
      progresso: ProgressoMissao.fromJson(json['progresso']),
      pronta: json['pronta'] == true,
      alvo: AlvoMissao.fromJson(json['alvo']),
    );
  }
}

class MissoesAluno {
  const MissoesAluno({
    required this.ciclo,
    required this.tetoCiclo,
    required this.tetoSemanal,
    required this.missoes,
  });

  final String ciclo;
  final TetoGamificacao? tetoCiclo;
  final TetoGamificacao? tetoSemanal;
  final List<Missao> missoes;

  static MissoesAluno? fromJson(Object? json) {
    if (json is! Map || json['missoes'] is! List) return null;
    final limites = json['limites'];
    return MissoesAluno(
      ciclo: json['ciclo'] as String? ?? '',
      tetoCiclo: limites is Map
          ? TetoGamificacao.fromJson(limites['ciclo'])
          : null,
      tetoSemanal: limites is Map
          ? TetoGamificacao.fromJson(limites['semanal'])
          : null,
      missoes: [
        for (final item in json['missoes'] as List) ?Missao.fromJson(item),
      ],
    );
  }
}

class ConclusaoMissao {
  const ConclusaoMissao({
    required this.xp,
    required this.moedas,
    required this.xpConfigurado,
    required this.limitado,
    required this.teto,
    required this.saldoMoedas,
    required this.xpAcumulado,
    required this.nivel,
    required this.subiuDeNivel,
  });

  final int xp;
  final int moedas;
  final int xpConfigurado;
  final bool limitado;
  final String? teto;
  final int saldoMoedas;
  final int xpAcumulado;
  final NivelGamificacao? nivel;
  final bool subiuDeNivel;

  static ConclusaoMissao? fromJson(Object? json) {
    if (json is! Map) return null;
    if (json['xp'] is! int || json['saldoMoedas'] is! int) return null;
    return ConclusaoMissao(
      xp: json['xp'] as int,
      moedas: _inteiro(json['moedas']),
      xpConfigurado: _inteiro(json['xpConfigurado']),
      limitado: json['limitado'] == true,
      teto: json['teto'] as String?,
      saldoMoedas: json['saldoMoedas'] as int,
      xpAcumulado: _inteiro(json['xpAcumulado']),
      nivel: NivelGamificacao.fromJson(json['nivel']),
      subiuDeNivel: json['subiuDeNivel'] == true,
    );
  }
}
