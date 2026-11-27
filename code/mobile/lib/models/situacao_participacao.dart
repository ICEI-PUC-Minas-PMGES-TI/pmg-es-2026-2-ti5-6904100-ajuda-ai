/// Resposta de `GET /participacoes/situacao`.
class SituacaoParticipacao {
  const SituacaoParticipacao({
    required this.situacao,
    this.programa,
    this.registro,
    this.grupo,
    this.padrinho,
    this.padrinhos = const [],
    this.podeConversar,
    this.apadrinhados = const [],
    this.cadastro,
  });

  /// nenhuma | candidatura_pendente | candidatura_em_analise |
  /// candidatura_rejeitada | padrinho_ativo | apadrinhado_pendente |
  /// apadrinhado_rejeitado | apadrinhado_aguardando | apadrinhado_ativo |
  /// concluido
  final String situacao;

  /// Cadastro global do aluno (null se não há cadastro).
  final CadastroSituacao? cadastro;
  final ProgramaSituacao? programa;
  final Map<String, dynamic>? registro;
  final String? grupo;
  final PessoaVinculo? padrinho;
  final List<PessoaVinculo> padrinhos;
  final bool? podeConversar;
  List<PessoaVinculo> get padrinhosAtuais =>
      padrinhos.isNotEmpty ? padrinhos : [?padrinho];
  bool get conversasLiberadas =>
      (situacao == 'padrinho_ativo' || situacao == 'apadrinhado_ativo') &&
      podeConversar != false &&
      programa?.etapaAtual != 'encerramento';
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
    final cadastro = json['cadastro'];
    final listaPadrinhos = json['padrinhos'] is List
        ? (json['padrinhos'] as List)
              .whereType<Map>()
              .map((p) => PessoaVinculo.fromJson(Map<String, dynamic>.from(p)))
              .toList()
        : [
            if (padrinho is Map)
              PessoaVinculo.fromJson(Map<String, dynamic>.from(padrinho)),
          ];
    return SituacaoParticipacao(
      cadastro: cadastro is Map
          ? CadastroSituacao.fromJson(Map<String, dynamic>.from(cadastro))
          : null,
      situacao: '${json['situacao'] ?? 'nenhuma'}',
      programa: programa is Map
          ? ProgramaSituacao.fromJson(Map<String, dynamic>.from(programa))
          : null,
      registro: registro is Map ? Map<String, dynamic>.from(registro) : null,
      grupo: json['grupo'] as String?,
      padrinho: listaPadrinhos.firstOrNull,
      padrinhos: listaPadrinhos,
      podeConversar: json['podeConversar'] is bool
          ? json['podeConversar'] as bool
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

/// Estado do cadastro global (`cadastro` em `GET /participacoes/situacao`).
class CadastroSituacao {
  const CadastroSituacao({
    required this.status,
    required this.tipoParticipacao,
    this.motivoRejeicao,
  });

  /// pendente | aprovado | rejeitado
  final String status;

  /// padrinho | apadrinhado
  final String tipoParticipacao;
  final String? motivoRejeicao;

  bool get pendente => status == 'pendente';
  bool get aprovado => status == 'aprovado';
  bool get rejeitado => status == 'rejeitado';

  factory CadastroSituacao.fromJson(Map<String, dynamic> json) =>
      CadastroSituacao(
        status: '${json['status'] ?? 'pendente'}',
        tipoParticipacao: '${json['tipoParticipacao'] ?? ''}',
        motivoRejeicao:
            (json['motivoRejeicao'] as String?)?.trim().isEmpty == true
            ? null
            : json['motivoRejeicao'] as String?,
      );
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
    this.vinculoId,
    this.grupoId,
  });

  final String nome;
  final String email;
  final String curso;
  final int? periodo;
  final List<String> interesses;
  final String? fotoUrl;
  final String iniciais;
  final String? grupo;
  final int? vinculoId;
  final int? grupoId;

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
    vinculoId: (json['vinculoId'] as num?)?.toInt(),
    grupoId: (json['grupoId'] as num?)?.toInt(),
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
