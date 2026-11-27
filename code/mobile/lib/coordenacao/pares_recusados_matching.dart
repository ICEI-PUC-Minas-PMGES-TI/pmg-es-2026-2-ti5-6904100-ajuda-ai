import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';

List<Map<String, dynamic>> _eventos(Object? valor) => valor is List
    ? valor.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList()
    : [];
String _data(Object? valor) {
  final d = DateTime.tryParse('$valor')?.toLocal();
  if (d == null) return 'Data não registrada';
  String dois(int n) => '$n'.padLeft(2, '0');
  return '${dois(d.day)}/${dois(d.month)}/${d.year} ${dois(d.hour)}:${dois(d.minute)}';
}

class HistoricoParMatching extends StatelessWidget {
  const HistoricoParMatching({super.key, required this.eventos});
  final List<Map<String, dynamic>> eventos;
  @override
  Widget build(BuildContext context) => eventos.isEmpty
      ? const SizedBox.shrink()
      : ExpansionTile(
          title: const Text('Histórico das decisões do par'),
          children: [
            for (final e in eventos)
              ListTile(
                title: Text(
                  '${e['acao'] == 'reconsiderado' ? 'Reconsiderado' : 'Recusado'} por ${e['responsavel']}',
                ),
                subtitle: Text(
                  '${_data(e['decididaEm'])}. ${e['motivo'] ?? 'Sem motivo informado.'}',
                ),
              ),
          ],
        );
}

class ValidadeSugestaoMatching extends StatelessWidget {
  const ValidadeSugestaoMatching({super.key, required this.dados});
  final Map<String, dynamic> dados;
  @override
  Widget build(BuildContext context) {
    if (dados['status'] != 'obsoleta' &&
        !(dados['status'] == 'pendente' && dados['podeAprovar'] == false)) {
      return const SizedBox.shrink();
    }
    final validade = dados['validade'];
    final mensagens =
        validade is Map &&
            validade['mensagens'] is List &&
            (validade['mensagens'] as List).isNotEmpty
        ? (validade['mensagens'] as List).join(' ')
        : 'Gere uma nova rodada antes de decidir este par.';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Text('Sugestão desatualizada. $mensagens'),
      ),
    );
  }
}

class ParesRecusadosMatching extends StatefulWidget {
  const ParesRecusadosMatching({
    super.key,
    required this.api,
    required this.programa,
    this.revisao,
    this.onAlterado,
  });
  final CoordenacaoApi api;
  final String programa;
  final Object? revisao;
  final VoidCallback? onAlterado;
  @override
  State<ParesRecusadosMatching> createState() => _ParesRecusadosMatchingState();
}

class _ParesRecusadosMatchingState extends State<ParesRecusadosMatching> {
  List<Map<String, dynamic>> _pares = [];
  String? _erro;
  bool _carregando = true;
  bool _salvando = false;
  int _consulta = 0;
  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void didUpdateWidget(covariant ParesRecusadosMatching oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.programa != widget.programa ||
        oldWidget.revisao != widget.revisao) {
      _carregar();
    }
  }

  Future<void> _carregar() async {
    final consulta = ++_consulta;
    setState(() {
      _carregando = true;
      _erro = null;
      _pares = [];
    });
    try {
      final lista = await widget.api.paresRecusadosMatching(widget.programa);
      if (mounted && consulta == _consulta) {
        setState(() {
          _pares = lista;
          _carregando = false;
        });
      }
    } catch (erro) {
      if (mounted && consulta == _consulta) {
        setState(() {
          _erro = '$erro';
          _carregando = false;
        });
      }
    }
  }

  Future<void> _reconsiderar(Map<String, dynamic> par) async {
    if (_salvando) return;
    final programaOrigem = widget.programa;
    var texto = '';
    final justificativa = await showDialog<String>(
      context: context,
      builder: (dialogo) => StatefulBuilder(
        builder: (context, atualizar) => AlertDialog(
          title: const Text('Reconsiderar este par?'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'A recusa será preservada. O par poderá aparecer em uma nova rodada; nenhum vínculo será aprovado automaticamente.',
                ),
                TextField(
                  maxLength: 1000,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Justificativa da reconsideração',
                  ),
                  onChanged: (v) => atualizar(() => texto = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogo),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: texto.trim().isEmpty
                  ? null
                  : () => Navigator.pop(dialogo, texto.trim()),
              child: const Text('Confirmar reconsideração'),
            ),
          ],
        ),
      ),
    );
    if (!mounted ||
        justificativa == null ||
        _salvando ||
        programaOrigem != widget.programa) {
      return;
    }
    setState(() {
      _salvando = true;
      _erro = null;
    });
    final programa = programaOrigem;
    try {
      await widget.api.reconsiderarParMatching(
        (par['id'] as num).toInt(),
        justificativa,
      );
      if (!mounted || programa != widget.programa) return;
      setState(() => _pares.removeWhere((p) => p['id'] == par['id']));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Par reconsiderado. Gere uma nova rodada para obter novas sugestões.',
          ),
        ),
      );
      widget.onAlterado?.call();
    } catch (erro) {
      if (mounted && programa == widget.programa) {
        setState(() => _erro = '$erro');
      }
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Pares recusados no ciclo',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const Text(
            'Ficam fora das novas rodadas até uma reconsideração explícita. As candidaturas continuam disponíveis para outros pares.',
          ),
          if (_carregando) const LinearProgressIndicator(),
          if (_erro != null) ...[
            Text(_erro!),
            TextButton(
              onPressed: _carregar,
              child: const Text('Tentar novamente'),
            ),
          ],
          if (!_carregando && _erro == null && _pares.isEmpty)
            const Text('Nenhum par recusado está impedido neste ciclo.'),
          for (final p in _pares) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                '${(p['padrinho'] as Map?)?['nome']} e ${(p['apadrinhado'] as Map?)?['nome']}',
              ),
              subtitle: Text(
                'Recusado por ${p['responsavel']}, ${_data(p['decididaEm'])}. ${p['motivo'] ?? 'Sem motivo informado.'}',
              ),
            ),
            HistoricoParMatching(eventos: _eventos(p['historico'])),
            TextButton(
              onPressed: p['podeReconsiderar'] != true || _salvando
                  ? null
                  : () => _reconsiderar(p),
              child: const Text('Reconsiderar par'),
            ),
          ],
        ],
      ),
    ),
  );
}
