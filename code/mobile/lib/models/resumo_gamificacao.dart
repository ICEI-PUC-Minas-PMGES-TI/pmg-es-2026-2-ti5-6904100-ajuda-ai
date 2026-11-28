/// Nível calculado pelo servidor (`GET /me/xp` → `nivel`). O app não guarda
/// os limiares: só mostra o que a API devolve.
class NivelGamificacao {
  const NivelGamificacao({
    required this.numero,
    required this.nome,
    required this.xpMinimo,
    required this.proximoXp,
    required this.proximoNome,
    required this.xpNoNivel,
    required this.xpDoNivel,
    required this.xpRestante,
    required this.progresso,
    required this.maximo,
  });

  final int numero;
  final String nome;
  final int xpMinimo;
  final int? proximoXp;
  final String? proximoNome;
  final int xpNoNivel;
  final int? xpDoNivel;
  final int xpRestante;

  /// 0–100.
  final int progresso;
  final bool maximo;

  static NivelGamificacao? fromJson(Object? json) {
    if (json is! Map) return null;
    final numero = json['numero'];
    final nome = json['nome'];
    final progresso = json['progresso'];
    if (numero is! int || nome is! String || progresso is! int) return null;
    int? inteiro(String k) => json[k] is int ? json[k] as int : null;
    return NivelGamificacao(
      numero: numero,
      nome: nome,
      xpMinimo: inteiro('xpMinimo') ?? 0,
      proximoXp: inteiro('proximoXp'),
      proximoNome: json['proximoNome'] as String?,
      xpNoNivel: inteiro('xpNoNivel') ?? 0,
      xpDoNivel: inteiro('xpDoNivel'),
      xpRestante: inteiro('xpRestante') ?? 0,
      progresso: progresso.clamp(0, 100),
      maximo: json['maximo'] == true,
    );
  }
}

/// Teto de ganho num ciclo: quanto já foi ganho e o limite.
class TetoGamificacao {
  const TetoGamificacao({required this.ganho, required this.limite});

  final int ganho;
  final int limite;

  int get restante => (limite - ganho).clamp(0, limite);
  bool get atingido => ganho >= limite;

  static TetoGamificacao? fromJson(Object? json) {
    if (json is! Map) return null;
    final ganho = json['ganho'];
    final limite = json['limite'];
    if (ganho is! int || limite is! int) return null;
    return TetoGamificacao(ganho: ganho, limite: limite);
  }
}

/// Conquista de nível ainda não celebrada (`GET /me/xp` → `celebracao`).
/// Subir vários níveis de uma vez gera uma só conquista, do nível final.
class ConquistaNivel {
  const ConquistaNivel({
    required this.de,
    required this.para,
    required this.nome,
    this.niveisAvancados = 1,
  });

  /// Último nível já celebrado.
  final int de;

  /// Nível conquistado.
  final int para;
  final String nome;
  final int niveisAvancados;

  static ConquistaNivel? fromJson(Object? json) {
    if (json is! Map) return null;
    final de = json['de'];
    final para = json['para'];
    final nome = json['nome'];
    if (de is! int || para is! int || nome is! String || para <= de) {
      return null;
    }
    final avancados = json['niveisAvancados'];
    return ConquistaNivel(
      de: de,
      para: para,
      nome: nome,
      niveisAvancados: avancados is int && avancados > 0
          ? avancados
          : para - de,
    );
  }
}

/// Linha da tabela de níveis (`GET /qa/gamificacao/acesso` → `niveis`).
class NivelTabela {
  const NivelTabela({
    required this.numero,
    required this.nome,
    required this.xpMinimo,
  });

  final int numero;
  final String nome;
  final int xpMinimo;

  static NivelTabela? fromJson(Object? json) {
    if (json is! Map) return null;
    final numero = json['numero'];
    final nome = json['nome'];
    final xp = json['xpMinimo'];
    if (numero is! int || nome is! String || xp is! int) return null;
    return NivelTabela(numero: numero, nome: nome, xpMinimo: xp);
  }
}

/// `GET /me/xp`: XP acumulado (nível), moedas (lojinha) e tetos do ciclo.
class ResumoGamificacao {
  const ResumoGamificacao({
    required this.xpAcumulado,
    required this.moedas,
    required this.nivel,
    this.ciclo,
    this.tetoTotens,
    this.tetoCiclo,
    this.celebracao,
    this.simulado = false,
  });

  final int xpAcumulado;
  final int moedas;
  final NivelGamificacao nivel;
  final String? ciclo;
  final TetoGamificacao? tetoTotens;
  final TetoGamificacao? tetoCiclo;

  /// Conquista pendente de animação (só no progresso real).
  final ConquistaNivel? celebracao;

  /// Perfil simulado pelo painel de QA (`GET /qa/gamificacao/simulacao`).
  final bool simulado;

  /// Resposta fora do contrato → `null` (quem chama trata como falha, nunca
  /// como "zero XP").
  static ResumoGamificacao? fromJson(Object? json) {
    if (json is! Map) return null;
    final xp = json['xpAcumulado'];
    final moedas = json['moedas'] ?? json['saldo'];
    final nivel = NivelGamificacao.fromJson(json['nivel']);
    if (xp is! int || xp < 0 || moedas is! int || moedas < 0 || nivel == null) {
      return null;
    }
    final limites = json['limites'];
    return ResumoGamificacao(
      xpAcumulado: xp,
      moedas: moedas,
      nivel: nivel,
      ciclo: json['ciclo'] as String?,
      tetoTotens: limites is Map
          ? TetoGamificacao.fromJson(limites['totens'])
          : null,
      tetoCiclo: limites is Map
          ? TetoGamificacao.fromJson(limites['ciclo'])
          : null,
      celebracao: ConquistaNivel.fromJson(json['celebracao']),
      simulado: json['simulado'] == true,
    );
  }
}
