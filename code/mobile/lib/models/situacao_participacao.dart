/// Resposta de `GET /participacoes/situacao`.
class SituacaoParticipacao {
  const SituacaoParticipacao({
    required this.situacao,
    this.programa,
    this.registro,
    this.grupo,
    this.padrinho,
    this.apadrinhados = const [],
  });

  /// nenhuma | candidatura_pendente | candidatura_em_analise |
  /// candidatura_rejeitada | padrinho_ativo | apadrinhado_aguardando |
  /// apadrinhado_ativo | concluido
  final String situacao;
  final ProgramaSituacao? programa;
  final Map<String, dynamic>? registro;
  final String? grupo;
  final PessoaVinculo? padrinho;
  final List<PessoaVinculo> apadrinhados;

  Map<String, dynamic>? get respostas {
    final valor = registro?['respostas'];
    return valor is Map ? Map<String, dynamic>.from(valor) : null;
  }

  DateTime? get criadoEm =>
      DateTime.tryParse('${registro?['criadoEm'] ?? ''}')?.toLocal();

  DateTime? get atualizadoEm =>
      DateTime.tryParse('${registro?['atualizadoEm'] ?? ''}')?.toLocal();

  factory SituacaoParticipacao.fromJson(Map<String, dynamic> json) {
    final programa = json['programa'];
    final registro = json['registro'];
    final padrinho = json['padrinho'];
    return SituacaoParticipacao(
      situacao: '${json['situacao'] ?? 'nenhuma'}',
      programa: programa is Map
          ? ProgramaSituacao.fromJson(Map<String, dynamic>.from(programa))
          : null,
      registro: registro is Map ? Map<String, dynamic>.from(registro) : null,
      grupo: json['grupo'] as String?,
      padrinho: padrinho is Map
          ? PessoaVinculo.fromJson(Map<String, dynamic>.from(padrinho))
          : null,
      apadrinhados: (json['apadrinhados'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) => PessoaVinculo.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}

class ProgramaSituacao {
  const ProgramaSituacao({
    required this.codigo,
    required this.titulo,
    this.etapaAtual,
    this.statusRotulo,
    this.inscricoesAbertas = false,
    this.etapas = const [],
  });

  final String codigo;
  final String titulo;
  final String? etapaAtual;
  final String? statusRotulo;
  final bool inscricoesAbertas;
  final List<EtapaPrograma> etapas;

  EtapaPrograma? etapa(String id) {
    for (final etapa in etapas) {
      if (etapa.id == id) return etapa;
    }
    return null;
  }

  factory ProgramaSituacao.fromJson(Map<String, dynamic> json) {
    return ProgramaSituacao(
      codigo: '${json['codigo'] ?? ''}',
      titulo: '${json['titulo'] ?? 'Programa ${json['codigo'] ?? ''}'}',
      etapaAtual: json['etapaAtual'] as String?,
      statusRotulo: json['statusRotulo'] as String?,
      inscricoesAbertas: json['inscricoesAbertas'] == true,
      etapas: (json['etapas'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) => EtapaPrograma.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}

class EtapaPrograma {
  const EtapaPrograma({
    required this.id,
    required this.titulo,
    required this.estado,
    this.periodoTexto,
  });

  final String id;
  final String titulo;

  /// concluida | atual | futura
  final String estado;
  final String? periodoTexto;

  factory EtapaPrograma.fromJson(Map<String, dynamic> json) => EtapaPrograma(
    id: '${json['id'] ?? ''}',
    titulo: '${json['titulo'] ?? ''}',
    estado: '${json['estado'] ?? 'futura'}',
    periodoTexto: json['periodoTexto'] as String?,
  );
}

/// Padrinho ou apadrinhado vinculado ao usuário.
class PessoaVinculo {
  const PessoaVinculo({
    required this.nome,
    this.email = '',
    this.curso = '',
    this.periodo,
    this.interesses = const [],
    this.fotoUrl,
    this.iniciais = '',
    this.grupo,
  });

  final String nome;
  final String email;
  final String curso;
  final int? periodo;
  final List<String> interesses;
  final String? fotoUrl;
  final String iniciais;
  final String? grupo;

  factory PessoaVinculo.fromJson(Map<String, dynamic> json) => PessoaVinculo(
    nome: '${json['nome'] ?? ''}',
    email: '${json['email'] ?? ''}',
    curso: '${json['curso'] ?? ''}',
    periodo: (json['periodo'] as num?)?.toInt(),
    interesses: (json['interesses'] as List? ?? const [])
        .map((item) => '$item')
        .toList(),
    fotoUrl: json['fotoUrl'] as String?,
    iniciais: '${json['iniciais'] ?? ''}',
    grupo: json['grupo'] as String?,
  );
}

/// Aviso/comunicado de `GET /avisos`.
class Aviso {
  const Aviso({
    required this.titulo,
    required this.descricao,
    this.id,
    this.publico,
    this.data,
  });

  final Object? id;
  final String titulo;
  final String descricao;
  final String? publico;
  final DateTime? data;

  factory Aviso.fromJson(Map<String, dynamic> json) => Aviso(
    id: json['id'],
    titulo: '${json['titulo'] ?? ''}',
    descricao: '${json['descricao'] ?? ''}',
    publico: json['publico'] as String?,
    data: DateTime.tryParse('${json['data'] ?? ''}'),
  );
}
