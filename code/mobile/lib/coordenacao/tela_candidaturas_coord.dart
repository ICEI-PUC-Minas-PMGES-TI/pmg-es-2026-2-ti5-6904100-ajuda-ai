import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';
import 'detalhe_candidatura_coord.dart';

/// Filtros aceitos por `GET /coordenacao/candidaturas?status=`.
const filtrosCandidaturas = <(String?, String)>[
  (null, 'Todas'),
  ('aguardando', 'Aguardando decisão'),
  ('pendente', 'Novas'),
  ('em_analise', 'Em análise'),
  ('aprovadas', 'Aprovadas'),
  ('nao_aprovado', 'Rejeitadas'),
  ('sem_vinculo', 'Apadrinhados sem vínculo'),
];

String rotuloFiltro(String? status) => filtrosCandidaturas
    .firstWhere(
      (filtro) => filtro.$1 == status,
      orElse: () => (status, status ?? 'Todas'),
    )
    .$2;

/// Candidaturas para padrinho (p24): busca, filtro, seleção múltipla com
/// ações em massa e detalhe completo em bottom sheet.
class TelaCandidaturasCoord extends StatefulWidget {
  const TelaCandidaturasCoord({
    super.key,
    required this.api,
    required this.programa,
    this.status,
  });

  final CoordenacaoApi api;
  final String? programa;
  final String? status;

  @override
  State<TelaCandidaturasCoord> createState() => _TelaCandidaturasCoordState();
}

class _TelaCandidaturasCoordState extends State<TelaCandidaturasCoord> {
  List<Map<String, dynamic>> _itens = const [];
  String? _erro;
  bool _carregando = true;
  bool _processando = false;
  String? _status;
  String _busca = '';
  final Set<int> _selecionados = {};

  @override
  void initState() {
    super.initState();
    _status = widget.status;
    _carregar();
  }

  @override
  void didUpdateWidget(covariant TelaCandidaturasCoord oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.programa != widget.programa ||
        oldWidget.status != widget.status) {
      _status = widget.status;
      _carregar();
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final lista = await widget.api.candidaturas(
        programa: widget.programa,
        status: _status,
      );
      if (!mounted) return;
      setState(() {
        _itens = lista;
        _carregando = false;
        _selecionados.removeWhere(
          (id) => !lista.any((item) => idDe(item) == id),
        );
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = mensagemDeErro(erro);
        _carregando = false;
      });
    }
  }

  bool _selecionavel(Map<String, dynamic> item) =>
      item['papel'] == 'candidato' && idDe(item) != null;

  List<Map<String, dynamic>> get _visiveis {
    final termo = _busca.trim().toLowerCase();
    if (termo.isEmpty) return _itens;
    return _itens.where((item) {
      final texto = [
        item['nome'],
        item['email'],
        item['curso'],
        if (item['periodo'] != null) '${item['periodo']}º período',
      ].join(' ').toLowerCase();
      return texto.contains(termo);
    }).toList();
  }

  List<int> get _idsSelecionaveis => [
    for (final item in _visiveis)
      if (_selecionavel(item)) idDe(item)!,
  ];

  void _alternarTodas(bool marcar) {
    setState(() {
      if (marcar) {
        _selecionados.addAll(_idsSelecionaveis);
      } else {
        _selecionados.removeAll(_idsSelecionaveis);
      }
    });
  }

  Future<void> _escolherFiltro() async {
    final escolhido = await showModalBottomSheet<(String?,)>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (valor, rotulo) in filtrosCandidaturas)
              ListTile(
                title: Text(rotulo),
                trailing: valor == _status
                    ? const Icon(Icons.check, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.pop(context, (valor,)),
              ),
          ],
        ),
      ),
    );
    if (escolhido == null || escolhido.$1 == _status) return;
    setState(() {
      _status = escolhido.$1;
      _selecionados.clear();
    });
    await _carregar();
  }

  Future<void> _acaoEmMassa(String acao) async {
    final ids = _selecionados.toList();
    if (ids.isEmpty || _processando) return;
    final (titulo, verbo, feito) = switch (acao) {
      'aprovar' => ('Aprovar candidaturas', 'Aprovar', 'aprovada(s)'),
      'rejeitar' => ('Rejeitar candidaturas', 'Rejeitar', 'rejeitada(s)'),
      _ => ('Marcar em análise', 'Marcar', 'marcada(s) em análise'),
    };
    final ok = await confirmarAcaoCoord(
      context,
      titulo: titulo,
      mensagem: '$verbo ${ids.length} candidatura(s) selecionada(s)?',
      confirmar: verbo,
      destrutiva: acao == 'rejeitar',
    );
    if (!ok || !mounted) return;

    setState(() => _processando = true);
    try {
      final resultado = await widget.api.acoesEmMassa(ids: ids, acao: acao);
      if (!mounted) return;
      final sucesso = (resultado['sucesso'] as num?)?.toInt() ?? 0;
      final falhas = (resultado['falhas'] as List? ?? const [])
          .whereType<Map>()
          .toList();
      final detalheFalha = falhas.isEmpty
          ? ''
          : ' ${falhas.length} não processada(s): '
                '${falhas.map((f) => f['erro']).toSet().join('; ')}';
      mostrarMensagemCoord(
        context,
        '$sucesso candidatura(s) $feito.$detalheFalha',
      );
      setState(() {
        _processando = false;
        _selecionados.clear();
      });
      await _carregar();
    } catch (erro) {
      if (!mounted) return;
      setState(() => _processando = false);
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  Future<void> _detalhe(Map<String, dynamic> item) async {
    final alterado = await mostrarDetalheCandidatura(
      context,
      api: widget.api,
      item: item,
      programa: widget.programa,
    );
    if (alterado && mounted) await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final semVinculo = _status == 'sem_vinculo';
    final visiveis = _visiveis;
    final selecionaveis = _idsSelecionaveis;
    final todasMarcadas =
        selecionaveis.isNotEmpty && selecionaveis.every(_selecionados.contains);

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CabecalhoCoord(
            titulo: semVinculo
                ? 'Apadrinhados sem vínculo'
                : 'Candidaturas para padrinho',
            subtitulo: [
              if (widget.programa != null) 'Programa ${widget.programa}',
              semVinculo
                  ? 'Defina um padrinho para cada apadrinhado.'
                  : 'Analise as candidaturas e selecione os novos padrinhos.',
            ].join(' · '),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    onChanged: (valor) => setState(() => _busca = valor),
                    decoration: InputDecoration(
                      hintText: 'Buscar por nome ou período...',
                      prefixIcon: const Icon(Icons.search),
                      isDense: true,
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppAccents.cardBorder,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppAccents.cardBorder,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: _escolherFiltro,
                  icon: const Icon(Icons.filter_alt_outlined, size: 18),
                  label: const Text('Filtrar'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    backgroundColor: Colors.white,
                    minimumSize: const Size(0, 48),
                    side: const BorderSide(color: AppAccents.cardBorder),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_status != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: InputChip(
                label: Text('Filtro: ${rotuloFiltro(_status)}'),
                onDeleted: () {
                  setState(() {
                    _status = null;
                    _selecionados.clear();
                  });
                  _carregar();
                },
              ),
            ),
          if (!semVinculo && selecionaveis.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: Material(
                color: AppColors.lavender,
                borderRadius: BorderRadius.circular(12),
                child: CheckboxListTile(
                  value: todasMarcadas,
                  dense: true,
                  controlAffinity: ListTileControlAffinity.leading,
                  activeColor: AppColors.primary,
                  title: Text(
                    'Selecionar todas (${selecionaveis.length})',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  onChanged: (marcar) => _alternarTodas(marcar ?? false),
                ),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _carregar,
              child: _carregando
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: AppColors.primary,
                      ),
                    )
                  : _erro != null
                  ? ListView(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            children: [
                              Text(_erro!, textAlign: TextAlign.center),
                              const SizedBox(height: 12),
                              FilledButton(
                                onPressed: _carregar,
                                style: FilledButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                ),
                                child: const Text('Tentar novamente'),
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : visiveis.isEmpty
                  ? ListView(
                      children: [
                        const SizedBox(height: 80),
                        Center(
                          child: Text(
                            _busca.isEmpty
                                ? 'Nenhuma candidatura encontrada.'
                                : 'Nenhum resultado para "$_busca".',
                            style: const TextStyle(color: AppColors.muted),
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: visiveis.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final item = visiveis[index];
                        final id = idDe(item);
                        return _ItemCandidatura(
                          item: item,
                          selecionavel: !semVinculo && _selecionavel(item),
                          selecionado: id != null && _selecionados.contains(id),
                          onSelecionar: (marcar) => setState(() {
                            if (id == null) return;
                            marcar
                                ? _selecionados.add(id)
                                : _selecionados.remove(id);
                          }),
                          onTap: () => _detalhe(item),
                        );
                      },
                    ),
            ),
          ),
          if (_selecionados.isNotEmpty)
            _BarraSelecao(
              quantidade: _selecionados.length,
              processando: _processando,
              onRejeitar: () => _acaoEmMassa('rejeitar'),
              onAprovar: () => _acaoEmMassa('aprovar'),
              onEmAnalise: () => _acaoEmMassa('em_analise'),
            ),
        ],
      ),
    );
  }
}

class _ItemCandidatura extends StatelessWidget {
  const _ItemCandidatura({
    required this.item,
    required this.selecionavel,
    required this.selecionado,
    required this.onSelecionar,
    required this.onTap,
  });

  final Map<String, dynamic> item;
  final bool selecionavel;
  final bool selecionado;
  final ValueChanged<bool> onSelecionar;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final apadrinhado = item['papel'] == 'apadrinhado';
    return Material(
      color: selecionado ? AppColors.lavender : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selecionado ? AppColors.primary : AppAccents.cardBorder,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 10, 8, 10),
          child: Row(
            children: [
              if (selecionavel)
                Checkbox(
                  value: selecionado,
                  activeColor: AppColors.primary,
                  semanticLabel: 'Selecionar ${item['nome'] ?? ''}',
                  onChanged: (marcar) => onSelecionar(marcar ?? false),
                )
              else
                const SizedBox(width: 12),
              AvatarCoord(item: item),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item['nome'] ?? ''}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: AppColors.ink,
                      ),
                    ),
                    Text(
                      [
                        if (item['periodo'] != null)
                          '${item['periodo']}º período',
                        '${item['curso'] ?? ''}',
                      ].join(' · '),
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    Text(
                      '${apadrinhado ? 'Cadastro' : 'Candidatura'} em '
                      '${formatarDataCoord(item['criadoEm'])}',
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    SeloStatusCoord(item: item),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _BarraSelecao extends StatelessWidget {
  const _BarraSelecao({
    required this.quantidade,
    required this.processando,
    required this.onRejeitar,
    required this.onAprovar,
    required this.onEmAnalise,
  });

  final int quantidade;
  final bool processando;
  final VoidCallback onRejeitar;
  final VoidCallback onAprovar;
  final VoidCallback onEmAnalise;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Color(0x141B1340),
            blurRadius: 12,
            offset: Offset(0, -3),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$quantidade selecionada(s)',
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              TextButton(
                onPressed: processando ? null : onEmAnalise,
                child: const Text('Marcar em análise'),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: processando ? null : onRejeitar,
                  icon: const Icon(Icons.close),
                  label: const Text('Rejeitar'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: corErroCoord,
                    side: const BorderSide(color: Color(0xFFFCA5A5)),
                    minimumSize: const Size.fromHeight(46),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: processando ? null : onAprovar,
                  icon: processando
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.check),
                  label: const Text('Aprovar'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    minimumSize: const Size.fromHeight(46),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
