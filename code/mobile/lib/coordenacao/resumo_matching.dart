import 'package:flutter/material.dart';

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
  @override
  Widget build(BuildContext context) {
    final criterios = _lista(dados['criterios']);
    if (criterios.isEmpty) return const SizedBox.shrink();
    final pendencias = _lista(dados['pendencias']);
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Dados antes da execução',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const Text('Ausência de resposta não significa incompatibilidade.'),
            for (final c in criterios)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  '${c['nome']} — ${c['obrigatorio'] == true ? 'Condição obrigatória' : 'Preferência ponderada'}. '
                  'Padrinhos com dados: ${(c['padrinhos'] as Map)['conhecidos']}/${(c['padrinhos'] as Map)['total']}; '
                  'apadrinhados com dados: ${(c['apadrinhados'] as Map)['conhecidos']}/${(c['apadrinhados'] as Map)['total']}.',
                ),
              ),
            if (pendencias.isNotEmpty)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(
                  '${pendencias.length} participante(s) com dados pendentes',
                ),
                children: [
                  for (final p in pendencias)
                    ListTile(
                      title: Text('${p['nome']} (${p['papel']})'),
                      subtitle: Text(
                        '${(p['campos'] as List? ?? []).join(', ')}.${p['obrigatorio'] == true ? ' Há condição obrigatória pendente.' : ''}',
                      ),
                    ),
                ],
              )
            else
              const Text(
                'Os dados dos critérios configurados estão disponíveis para os participantes elegíveis.',
              ),
          ],
        ),
      ),
    );
  }
}
