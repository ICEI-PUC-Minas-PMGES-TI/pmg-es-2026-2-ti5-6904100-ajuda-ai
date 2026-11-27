import 'package:flutter/material.dart';

import '../theme/colors.dart';
import 'componentes_coord.dart';
import 'painel_coord.dart';

List<Map<String, dynamic>> _lista(Object? valor) => valor is List
    ? valor.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList()
    : [];
String percentualMatching(Object? valor) {
  final pontos = (num.tryParse('$valor') ?? 0) * 100;
  if (pontos > 0 && pontos < 0.01) return '<0,01%';
  return '${pontos.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '').replaceAll('.', ',')}%';
}

class IndicadoresCompatibilidade extends StatelessWidget {
  const IndicadoresCompatibilidade({super.key, required this.explicacao});
  final Map<String, dynamic> explicacao;
  @override
  Widget build(BuildContext context) {
    if (explicacao['politicaVersao'] == null) {
      return const Text(
        'Cálculo histórico: cobertura dos dados não registrada nesta versão.',
      );
    }
    final distribuicao = explicacao['distribuicao'];
    final padrinho = distribuicao is Map ? distribuicao['padrinho'] : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Cobertura dos dados: ${percentualMatching(explicacao['cobertura'])}',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        Text(
          'Afinidade entre dados avaliáveis: ${explicacao['afinidade'] == null ? 'Sem dados avaliáveis' : percentualMatching(explicacao['afinidade'])}.',
        ),
        Text(
          '${explicacao['pesoConhecido']} de ${explicacao['pesoConfigurado']} pontos de critérios conhecidos. Neutralidades: ${explicacao['pesoNeutro']}.',
        ),
        if (explicacao['viabilidade'] == 'inviavel')
          const Text('O par não atende a uma condição obrigatória.'),
        if (explicacao['viabilidade'] == 'dados_insuficientes')
          const Text('Faltam dados para conferir uma condição obrigatória.'),
        if (padrinho is Map)
          Text(
            'Ocupação projetada do padrinho: ${padrinho['confirmados']} vínculo(s) confirmado(s) + ${padrinho['sugeridos']} sugestão(ões) = ${padrinho['totalProjetado']}/${padrinho['limite']}. Equilíbrio considerado após a qualidade.',
          ),
      ],
    );
  }
}

class RelatorioRodadaMatching extends StatelessWidget {
  const RelatorioRodadaMatching({super.key, required this.relatorio});
  final Map<String, dynamic> relatorio;
  @override
  Widget build(BuildContext context) {
    if (relatorio.isEmpty) return const SizedBox.shrink();
    final semSugestao = _lista(relatorio['semSugestao']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Relatório da rodada',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            Text(
              '${relatorio['novosAtendidos']} aluno(s) sem vínculo receberam sugestão. ${semSugestao.length} continuam sem sugestão.',
            ),
            if ((relatorio['paresRecusadosNoCiclo'] as num? ?? 0) > 0)
              Text(
                '${relatorio['paresRecusadosNoCiclo']} par(es) recusado(s) permanecem fora das sugestões do ciclo.',
              ),
            const Text(
              'Primeiro atendimento e qualidade; equilíbrio entre soluções de mesma qualidade.',
            ),
            const SizedBox(height: 8),
            if (_lista(relatorio['cargaPadrinhos'])
                .any((p) => p['confirmados'] == 0))
              Text(
                'Padrinhos sem apadrinhados confirmados: ${_lista(relatorio['cargaPadrinhos']).where((p) => p['confirmados'] == 0).map((p) => p['nome']).join(', ')}.',
              ),
            for (final p in _lista(relatorio['cargaPadrinhos']))
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${p['nome']}'),
                subtitle: Text(
                  '${p['confirmados']} confirmado(s) + ${p['sugeridos']} sugestão(ões); total projetado ${p['totalProjetado']}/${p['limite']}.',
                ),
              ),
            for (final a in semSugestao)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${a['nome']} · Sem sugestão'),
                subtitle: Text(
                  '${a['descricao']}${a['pendencias'] is List && (a['pendencias'] as List).isNotEmpty ? ' Dados pendentes: ${(a['pendencias'] as List).join(', ')}.' : ''}',
                ),
              ),
            const Text('As sugestões dependem da confirmação da coordenação.'),
          ],
        ),
      ),
    );
  }
}

class DiagnosticoDadosMatching extends StatelessWidget {
  const DiagnosticoDadosMatching({super.key, required this.dados});
  final Map<String, dynamic> dados;
  Widget _cobertura(String rotulo, Map grupo) {
    final conhecidos = (grupo['conhecidos'] as num? ?? 0).toDouble();
    final total = (grupo['total'] as num? ?? 0).toDouble();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$rotulo com dados',
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
              ),
              Text(
                '${grupo['conhecidos'] ?? 0}/${grupo['total'] ?? 0}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          LinearProgressIndicator(
            value: total > 0 ? (conhecidos / total).clamp(0, 1) : 0,
            minHeight: 6,
            borderRadius: BorderRadius.circular(6),
            color: AppColors.primary,
            backgroundColor: const Color(0xFFEAE3F4),
            semanticsLabel: '$rotulo com dados',
            semanticsValue:
                '${total > 0 ? (conhecidos / total * 100).round() : 0}%',
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final criterios = _lista(dados['criterios']);
    if (criterios.isEmpty) return const SizedBox.shrink();
    final pendencias = _lista(dados['pendencias']);
    return CartaoPainelCoord(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const TituloPainelCoord(
            titulo: 'Dados antes da execução',
            descricao: 'Confira os dados dos participantes elegíveis. Ausência de resposta não significa incompatibilidade.',
          ),
          for (final c in criterios)
            Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${c['nome']}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    c['obrigatorio'] == true
                        ? 'Condição obrigatória'
                        : 'Preferência ponderada',
                    style: const TextStyle(
                      fontSize: 11,
                      color: corTextoSecundarioCoord,
                    ),
                  ),
                  _cobertura('Padrinhos', c['padrinhos'] as Map? ?? {}),
                  _cobertura('Apadrinhados', c['apadrinhados'] as Map? ?? {}),
                ],
              ),
            ),
          if (pendencias.isNotEmpty)
            Material(
              color: const Color(0xFFFFF7E8),
              borderRadius: BorderRadius.circular(9),
              child: ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: 12),
                title: Text(
                  '${pendencias.length} participante(s) com dados pendentes',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF87531C),
                  ),
                ),
                children: [
                  for (final p in pendencias)
                    ListTile(
                      title: Text(
                        '${p['nome']} (${p['papel']})',
                        style: const TextStyle(fontSize: 13),
                      ),
                      subtitle: Text(
                        '${(p['campos'] as List? ?? []).join(', ')}.${p['obrigatorio'] == true ? ' Há condição obrigatória pendente.' : ''}',
                      ),
                    ),
                ],
              ),
            )
          else
            const Text(
              'Os dados dos critérios configurados estão disponíveis para os participantes elegíveis.',
              style: TextStyle(
                color: corTextoSecundarioCoord,
                fontSize: 12,
                height: 1.5,
              ),
            ),
        ],
      ),
    );
  }
}
