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
  });

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
