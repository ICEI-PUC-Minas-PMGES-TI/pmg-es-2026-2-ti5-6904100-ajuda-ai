import 'package:flutter/material.dart';

import 'theme/colors.dart';
import 'widgets/cabecalho_logos.dart';

enum PapelCiclo {
  apadrinhado('Apadrinhado'),
  candidato('Candidato a padrinho'),
  padrinho('Padrinho');

  const PapelCiclo(this.rotulo);
  final String rotulo;
}

enum StatusCiclo {
  concluido('Concluído', AppColors.primary, AppAccents.success),
  naoAprovado('Não aprovado', _vermelho, _vermelho),
  emAndamento('Em andamento', AppAccents.success, AppAccents.success);

  const StatusCiclo(this.rotulo, this.corPonto, this.corSelo);
  final String rotulo;
  final Color corPonto;
  final Color corSelo;
}

const _vermelho = Color(0xFFDC2626);

class CicloParticipacao {
  const CicloParticipacao({
    required this.semestre,
    required this.papel,
    required this.status,
    required this.titulo,
    required this.descricao,
    this.detalhes = const [],
    this.apadrinhados = 0,
  });

  final String semestre;
  final PapelCiclo papel;
  final StatusCiclo status;
  final String titulo;
  final String descricao;
  final List<(String, String)> detalhes;
  final int apadrinhados;
}

// TODO: buscar o histórico no backend.
const _ciclosExemplo = [
  CicloParticipacao(
    semestre: '2025/1',
    papel: PapelCiclo.apadrinhado,
    status: StatusCiclo.concluido,
    titulo: 'Apadrinhado',
    descricao: 'Você participou e concluiu sua jornada.',
    detalhes: [('Padrinho', 'Thiago Moreira'), ('Encontros', '5')],
  ),
  CicloParticipacao(
    semestre: '2025/2',
    papel: PapelCiclo.candidato,
    status: StatusCiclo.naoAprovado,
    titulo: 'Candidatura não aprovada',
    descricao: 'Neste ciclo sua candidatura não foi aprovada.',
    detalhes: [('Acesso', 'Mapa + Feed'), ('Vínculo', 'Sem vínculo')],
  ),
  CicloParticipacao(
    semestre: '2026/1',
    papel: PapelCiclo.padrinho,
    status: StatusCiclo.concluido,
    titulo: 'Padrinho',
    descricao: 'Você atuou como padrinho e concluiu o semestre.',
    detalhes: [('Apadrinhados', '3'), ('Encontros', '8')],
    apadrinhados: 3,
  ),
  CicloParticipacao(
    semestre: '2026/2',
    papel: PapelCiclo.padrinho,
    status: StatusCiclo.emAndamento,
    titulo: 'Padrinho ativo',
    descricao: 'Você está atuando como padrinho neste semestre.',
    detalhes: [('Apadrinhados', '2'), ('Encontros', '6')],
    apadrinhados: 2,
  ),
];

class HistoricoParticipacaoPage extends StatelessWidget {
  const HistoricoParticipacaoPage({super.key, this.ciclos = _ciclosExemplo});
  final List<CicloParticipacao> ciclos;

  int get _totalApadrinhados =>
      ciclos.fold(0, (total, ciclo) => total + ciclo.apadrinhados);

  int get _semestresComoPadrinho => ciclos
      .where(
        (ciclo) =>
            ciclo.papel == PapelCiclo.padrinho &&
            ciclo.status != StatusCiclo.naoAprovado,
      )
      .length;

  @override
  Widget build(BuildContext context) {
    final primeiro = ciclos.isEmpty ? null : ciclos.first.papel;
    final atual = ciclos.isEmpty ? null : ciclos.last.papel;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CabecalhoLogos(
                acao: IconButton(
                  onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Filtros: em breve!')),
                  ),
                  icon: const Icon(Icons.tune),
                  color: AppColors.primary,
                  tooltip: 'Filtrar',
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Histórico de participação',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              const Text(
                'Veja sua evolução no programa e seus papéis em cada ciclo.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 16),
              LayoutBuilder(
                builder: (context, constraints) {
                  final resumos = [
                    _Resumo(
                      valor: '$_totalApadrinhados',
                      rotulo: 'Apadrinhados no total',
                      icone: Icons.groups_outlined,
                    ),
                    _Resumo(
                      valor: '$_semestresComoPadrinho',
                      rotulo: 'Semestres como padrinho',
                      icone: Icons.emoji_events_outlined,
                    ),
                    _Resumo(
                      valor: 'Transição',
                      rotulo: primeiro == null || primeiro == atual
                          ? (atual?.rotulo ?? '—')
                          : '${primeiro.rotulo} → ${atual!.rotulo}',
                      icone: Icons.trending_up,
                    ),
                  ];
                  if (constraints.maxWidth < 520) {
                    return Column(
                      children: [
                        for (var i = 0; i < resumos.length; i++) ...[
                          if (i > 0) const SizedBox(height: 8),
                          resumos[i],
                        ],
                      ],
                    );
                  }
                  return Row(
                    children: [
                      for (var i = 0; i < resumos.length; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(child: resumos[i]),
                      ],
                    ],
                  );
                },
              ),
              const SizedBox(height: 18),
              _LinhaDoTempo(ciclos: ciclos),
              const SizedBox(height: 18),
              for (final (i, ciclo) in ciclos.indexed)
                _CardCiclo(ciclo: ciclo, ultimo: i == ciclos.length - 1),
              if (_totalApadrinhados > 0) ...[
                const SizedBox(height: 4),
                _Impacto(
                  apadrinhados: _totalApadrinhados,
                  semestres: _semestresComoPadrinho,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Resumo extends StatelessWidget {
  const _Resumo({
    required this.valor,
    required this.rotulo,
    required this.icone,
  });

  final String valor;
  final String rotulo;
  final IconData icone;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 84),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  valor,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: AppColors.ink,
                    fontSize: valor.length > 3 ? 13 : 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Icon(icone, size: 18, color: AppColors.primary),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            rotulo,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 11,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _LinhaDoTempo extends StatelessWidget {
  const _LinhaDoTempo({required this.ciclos});

  final List<CicloParticipacao> ciclos;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final (i, ciclo) in ciclos.indexed)
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ciclo.semestre,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  ciclo.titulo,
                  maxLines: 2,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    CircleAvatar(
                      radius: 6,
                      backgroundColor: ciclo.status.corPonto,
                    ),
                    if (i < ciclos.length - 1)
                      Expanded(
                        child: Container(
                          height: 2,
                          color: AppAccents.cardBorder,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _CardCiclo extends StatelessWidget {
  const _CardCiclo({required this.ciclo, required this.ultimo});

  final CicloParticipacao ciclo;
  final bool ultimo;

  @override
  Widget build(BuildContext context) {
    final cor = ciclo.status.corSelo;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 22,
            child: Column(
              children: [
                const SizedBox(height: 18),
                CircleAvatar(radius: 6, backgroundColor: ciclo.status.corPonto),
                if (!ultimo)
                  Expanded(
                    child: Container(width: 2, color: AppAccents.cardBorder),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: ciclo.status == StatusCiclo.naoAprovado
                    ? _vermelho.withValues(alpha: 0.05)
                    : AppAccents.cardBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: ciclo.status == StatusCiclo.naoAprovado
                      ? _vermelho.withValues(alpha: 0.2)
                      : AppAccents.cardBorder,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Programa ${ciclo.semestre}',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 11,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: cor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          ciclo.status.rotulo,
                          style: TextStyle(
                            fontFamily: 'Inter',
                            color: cor,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  Text(
                    ciclo.titulo,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    ciclo.descricao,
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.muted,
                      fontSize: 12,
                    ),
                  ),
                  if (ciclo.detalhes.isNotEmpty) ...[
                    const Divider(height: 18, color: AppAccents.cardBorder),
                    Row(
                      children: [
                        for (final (rotulo, valor) in ciclo.detalhes)
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  rotulo,
                                  style: const TextStyle(
                                    fontFamily: 'Inter',
                                    color: AppColors.muted,
                                    fontSize: 10,
                                  ),
                                ),
                                Text(
                                  valor,
                                  style: const TextStyle(
                                    fontFamily: 'Inter',
                                    color: AppColors.ink,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Impacto extends StatelessWidget {
  const _Impacto({required this.apadrinhados, required this.semestres});

  final int apadrinhados;
  final int semestres;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.emoji_events_outlined,
            color: AppColors.primary,
            size: 26,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'IMPACTO TOTAL',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.primary,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                Text(
                  'Você já apoiou $apadrinhados '
                  '${apadrinhados == 1 ? 'apadrinhado' : 'apadrinhados'} em '
                  '$semestres ${semestres == 1 ? 'semestre' : 'semestres'} '
                  'como padrinho.',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
