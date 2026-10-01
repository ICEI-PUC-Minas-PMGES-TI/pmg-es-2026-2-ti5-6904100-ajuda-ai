import 'package:flutter/material.dart';

import '../theme/colors.dart';

enum PapelCiclo {
  apadrinhado('Apadrinhado'),
  candidato('Candidato a padrinho'),
  padrinho('Padrinho');

  const PapelCiclo(this.rotulo);
  final String rotulo;

  static PapelCiclo fromApi(String valor) {
    return switch (valor) {
      'padrinho' => PapelCiclo.padrinho,
      'apadrinhado' => PapelCiclo.apadrinhado,
      _ => PapelCiclo.candidato,
    };
  }

  String get apiValue => switch (this) {
    PapelCiclo.padrinho => 'padrinho',
    PapelCiclo.apadrinhado => 'apadrinhado',
    PapelCiclo.candidato => 'candidato',
  };
}

enum StatusCiclo {
  concluido(
    'Concluído',
    AppColors.primary,
    AppColors.lavender,
  ),
  naoAprovado(
    'Não aprovado',
    Color(0xFFB45309),
    Color(0xFFFFF7ED),
  ),
  emAndamento(
    'Em andamento',
    AppAccents.success,
    AppAccents.successBg,
  ),
  emAnalise(
    'Em análise',
    AppColors.primary,
    AppColors.lavender,
  );

  const StatusCiclo(this.rotulo, this.corSelo, this.fundoSelo);
  final String rotulo;
  final Color corSelo;
  final Color fundoSelo;

  Color get corPonto => corSelo;

  static StatusCiclo fromApi(String valor) {
    return switch (valor) {
      'em_andamento' => StatusCiclo.emAndamento,
      'concluido' => StatusCiclo.concluido,
      'nao_aprovado' => StatusCiclo.naoAprovado,
      'pendente' || 'em_analise' => StatusCiclo.emAnalise,
      _ => StatusCiclo.emAnalise,
    };
  }

  String get apiValue => switch (this) {
    StatusCiclo.emAndamento => 'em_andamento',
    StatusCiclo.concluido => 'concluido',
    StatusCiclo.naoAprovado => 'nao_aprovado',
    StatusCiclo.emAnalise => 'em_analise',
  };
}

class CicloParticipacao {
  const CicloParticipacao({
    this.id,
    required this.semestre,
    required this.papel,
    required this.status,
    this.grupo,
    this.apadrinhados = 0,
    this.inicioEm,
    this.terminoEm,
  });

  final int? id;
  final String semestre;
  final PapelCiclo papel;
  final StatusCiclo status;
  final String? grupo;
  final int apadrinhados;
  final DateTime? inicioEm;
  final DateTime? terminoEm;

  String get titulo => switch (papel) {
    PapelCiclo.padrinho when status == StatusCiclo.emAndamento =>
      'Padrinho',
    PapelCiclo.candidato => 'Candidatura de padrinho',
    _ => papel.rotulo,
  };

  String get descricao => switch (status) {
    StatusCiclo.emAnalise =>
      'Sua candidatura está sendo analisada pela coordenação.',
    StatusCiclo.emAndamento =>
      'Participação em andamento no programa Ajuda Aí.',
    StatusCiclo.concluido => 'Participação concluída neste ciclo.',
    StatusCiclo.naoAprovado =>
      'Candidatura não aprovada neste ciclo do programa.',
  };

  List<(String, String)> get detalhes {
    final itens = <(String, String)>[];
    if (grupo != null && grupo!.trim().isNotEmpty) {
      itens.add(('Grupo', grupo!));
    }
    if (papel == PapelCiclo.padrinho && apadrinhados > 0) {
      itens.add((
        'Apadrinhados',
        '$apadrinhados',
      ));
    }
    if (inicioEm != null) {
      itens.add(('Início', _formatarMesAno(inicioEm!)));
    }
    if (terminoEm != null && status == StatusCiclo.concluido) {
      itens.add(('Término', _formatarMesAno(terminoEm!)));
    }
    return itens;
  }

  factory CicloParticipacao.fromJson(Map<String, dynamic> json) {
    return CicloParticipacao(
      id: json['id'] is int ? json['id'] as int : int.tryParse('${json['id']}'),
      semestre: '${json['programa'] ?? ''}',
      papel: PapelCiclo.fromApi('${json['papel'] ?? ''}'),
      status: StatusCiclo.fromApi('${json['status'] ?? ''}'),
      grupo: json['grupo'] as String?,
      apadrinhados: json['apadrinhados'] is int
          ? json['apadrinhados'] as int
          : int.tryParse('${json['apadrinhados'] ?? 0}') ?? 0,
      inicioEm: _parseData(json['inicioEm']),
      terminoEm: _parseData(json['terminoEm']),
    );
  }

  static DateTime? _parseData(dynamic valor) {
    if (valor == null) return null;
    return DateTime.tryParse(valor.toString());
  }

  static String _formatarMesAno(DateTime data) {
    const meses = [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ];
    return '${meses[data.month - 1]}/${data.year}';
  }
}
