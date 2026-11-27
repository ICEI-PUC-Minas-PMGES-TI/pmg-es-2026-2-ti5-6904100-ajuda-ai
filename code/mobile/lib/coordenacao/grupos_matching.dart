import 'dart:math';

import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import 'resumo_matching.dart';

String novoIdOperacaoMatching() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

Map<String, dynamic> _mapa(Object? v) =>
    v is Map ? Map<String, dynamic>.from(v) : {};
List<Map<String, dynamic>> _lista(Object? v) => v is List
    ? v.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList()
    : [];

class GruposMatchingCoord extends StatelessWidget {
  const GruposMatchingCoord({
    super.key,
    required this.api,
    required this.programa,
    this.revisao,
    this.onAlterado,
  });
  final CoordenacaoApi api;
  final String programa;
  final Object? revisao;
  final Future<void> Function()? onAlterado;
  @override
  Widget build(BuildContext context) => _GruposCiclo(
    key: ValueKey(programa),
    api: api,
    programa: programa,
    revisao: revisao,
    onAlterado: onAlterado,
  );
}

class _GruposCiclo extends StatefulWidget {
  const _GruposCiclo({
    super.key,
    required this.api,
    required this.programa,
    this.revisao,
    this.onAlterado,
  });
  final CoordenacaoApi api;
  final String programa;
  final Object? revisao;
  final Future<void> Function()? onAlterado;
  @override
  State<_GruposCiclo> createState() => _GruposCicloState();
}

class _GruposCicloState extends State<_GruposCiclo> {
  Map<String, dynamic>? _dados;
  String? _erro;
  String? _mensagem;
  int _pedido = 0;
  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void didUpdateWidget(covariant _GruposCiclo oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.revisao != widget.revisao || oldWidget.api != widget.api) {
      _carregar();
    }
  }

  Future<void> _carregar() async {
    final pedido = ++_pedido;
    setState(() => _erro = null);
    try {
      final dados = await widget.api.gruposMatching(widget.programa);
      if (mounted && pedido == _pedido) {
        setState(() => _dados = dados);
      }
    } catch (erro) {
      if (mounted && pedido == _pedido) {
        setState(() => _erro = '$erro');
      }
    }
  }

  Future<void> _transferir(Map<String, dynamic> pessoa) async {
    final programa = widget.programa;
    final alterou = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => TransferirVinculoDialog(
        api: widget.api,
        programa: programa,
        pessoa: pessoa,
        aindaNoCiclo: () => mounted && programa == widget.programa,
      ),
    );
    if (!mounted) return;
    if (alterou == true) {
      setState(() => _mensagem = 'Transferência confirmada.');
      await widget.onAlterado?.call();
    }
    if (mounted) {
      await _carregar();
    }
  }

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.all(16),
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Grupos e transferências',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
          ),
          const Text('O destino será revalidado na confirmação.'),
          TextButton(
            onPressed: _carregar,
            child: const Text('Atualizar grupos'),
          ),
          if (_erro != null) Text(_erro!),
          if (_mensagem != null) Text(_mensagem!),
          if (_dados == null && _erro == null) const Text('Carregando grupos.'),
          if (_dados != null) ...[
            for (final i in _lista(_dados!['inconsistencias']))
              Text('${i['nome']}: ${i['motivo']}'),
            if (_lista(_dados!['grupos']).isEmpty)
              const Text('Nenhum grupo canônico formado neste ciclo.'),
            for (final g in _lista(_dados!['grupos'])) ...[
              const Divider(),
              Text(
                '${g['nome']} · ${_mapa(g['padrinho'])['nome']}',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              Text('${g['ocupacao'] ?? 0} apadrinhado(s).'),
              if (_lista(g['apadrinhados']).isEmpty)
                const Text('Aguardando novos vínculos.'),
              for (final a in _lista(g['apadrinhados']))
                Row(
                  children: [
                    Expanded(child: Text('${a['nome']}')),
                    TextButton(
                      onPressed: _dados!['podeMovimentar'] == true
                          ? () => _transferir(a)
                          : null,
                      child: Text('Transferir ${a['nome']}'),
                    ),
                  ],
                ),
            ],
            if (_lista(_dados!['historico']).isNotEmpty)
              ExpansionTile(
                title: const Text('Histórico de movimentações'),
                children: [
                  for (final e in _lista(_dados!['historico']))
                    ListTile(
                      title: Text('${e['acao']} · ${e['responsavel']}'),
                      subtitle: Text(
                        '${e['motivo'] ?? ''}\n${e['criadoEm'] ?? ''} · vínculos ${e['vinculoOrigemId'] ?? '—'} → ${e['vinculoDestinoId'] ?? '—'}',
                      ),
                    ),
                ],
              ),
          ],
        ],
      ),
    ),
  );
}

class TransferirVinculoDialog extends StatefulWidget {
  const TransferirVinculoDialog({
    super.key,
    required this.api,
    required this.programa,
    required this.pessoa,
    required this.aindaNoCiclo,
  });
  final CoordenacaoApi api;
  final String programa;
  final Map<String, dynamic> pessoa;
  final bool Function() aindaNoCiclo;
  @override
  State<TransferirVinculoDialog> createState() =>
      _TransferirVinculoDialogState();
}

class _TransferirVinculoDialogState extends State<TransferirVinculoDialog> {
  List<Map<String, dynamic>>? _destinos;
  int? _destino;
  final _motivo = TextEditingController();
  String? _erro;
  String? _operacaoId;
  bool _salvando = false;
  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _motivo.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    try {
      final resultado = await widget.api.destinosMatching(
        (widget.pessoa['id'] as num).toInt(),
        vinculoOrigemId: (widget.pessoa['vinculoId'] as num).toInt(),
      );
      if (mounted) {
        setState(
          () => _destinos = resultado['programa'] == widget.programa
              ? _lista(resultado['destinos'])
              : [],
        );
      }
    } catch (erro) {
      if (mounted) {
        setState(() => _erro = '$erro');
      }
    }
  }

  Future<void> _confirmar() async {
    if (_salvando || _destino == null || _motivo.text.trim().isEmpty) return;
    if (!widget.aindaNoCiclo()) {
      setState(
        () => _erro = 'O ciclo selecionado mudou. Feche e atualize os grupos.',
      );
      return;
    }
    _operacaoId ??= novoIdOperacaoMatching();
    setState(() {
      _salvando = true;
      _erro = null;
    });
    try {
      await widget.api.transferirVinculoMatching(
        (widget.pessoa['vinculoId'] as num).toInt(),
        padrinhoDestinoId: _destino!,
        motivo: _motivo.text.trim(),
        operacaoId: _operacaoId!,
      );
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (erro) {
      if (mounted) {
        setState(() => _erro = '$erro');
      }
    } finally {
      if (mounted) {
        setState(() => _salvando = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final escolhido = (_destinos ?? [])
        .where((d) => d['padrinhoId'] == _destino)
        .firstOrNull;
    final compatibilidade = _mapa(escolhido?['compatibilidade']);
    return PopScope(
      canPop: !_salvando,
      child: AlertDialog(
        title: Text('Transferir ${widget.pessoa['nome']}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Programa ${widget.programa}. A origem só será encerrada se o destino puder ser confirmado.',
              ),
              if (_destinos == null && _erro == null)
                const Text('Consultando vagas e compatibilidade.'),
              if (_destinos != null) ...[
                DropdownButtonFormField<int>(
                  initialValue: _destino,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Padrinho destino',
                  ),
                  items: [
                    for (final d in _destinos!)
                      DropdownMenuItem(
                        value: (d['padrinhoId'] as num).toInt(),
                        enabled: d['permitido'] == true,
                        child: Text(
                          '${d['nome']} · ${d['vagas']} vaga(s)${d['bloqueio'] != null ? ' · ${d['bloqueio']}' : ''}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: _operacaoId != null
                      ? null
                      : (v) => setState(() => _destino = v),
                ),
                if (escolhido != null)
                  Text(
                    'Aderência: ${percentualMatching(compatibilidade['aderencia'] ?? compatibilidade['score'])} · Cobertura: ${percentualMatching(compatibilidade['cobertura'])}',
                  ),
                if (!_destinos!.any((d) => d['permitido'] == true))
                  const Text(
                    'Nenhum destino disponível atende às regras atuais.',
                  ),
                TextField(
                  controller: _motivo,
                  enabled: _operacaoId == null,
                  maxLength: 1000,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Motivo da transferência',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ],
              if (_erro != null) Text(_erro!),
              if (_erro != null && _operacaoId != null)
                const Text(
                  'Uma nova tentativa repete a mesma operação. Para alterar o destino, atualize os grupos primeiro.',
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: _salvando
                ? null
                : () => Navigator.of(context).pop(false),
            child: Text(_operacaoId == null ? 'Cancelar' : 'Atualizar grupos'),
          ),
          FilledButton(
            onPressed:
                _salvando ||
                    escolhido?['permitido'] != true ||
                    _motivo.text.trim().isEmpty
                ? null
                : _confirmar,
            child: Text(
              _salvando
                  ? 'Transferindo…'
                  : _operacaoId == null
                  ? 'Confirmar transferência'
                  : 'Tentar mesma transferência',
            ),
          ),
        ],
      ),
    );
  }
}
