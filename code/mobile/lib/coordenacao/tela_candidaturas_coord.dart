import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';
import 'detalhe_candidatura_coord.dart';
import 'tela_cadastros_coord.dart';
import 'painel_coord.dart';

/// Filtros de candidatura a padrinho.
const filtrosPadrinho = <(String?, String)>[
  (null, 'Todas'),
  ('aguardando', 'Aguardando decisão'),
  ('pendente', 'Novas'),
  ('em_analise', 'Em análise'),
  ('aprovadas', 'Aprovadas'),
  ('nao_aprovado', 'Rejeitadas'),
];

/// Filtros do público apadrinhado (cadastro + matching).
const filtrosApadrinhado = <(String?, String)>[
  ('pendente', 'Aguardando aprovação'),
  ('sem_vinculo', 'Sem vínculo'),
  ('aprovado', 'Aprovados'),
  ('rejeitado', 'Rejeitados'),
];

String rotuloFiltro(String? status, {required bool apadrinhado}) {
  final lista = apadrinhado ? filtrosApadrinhado : filtrosPadrinho;
  return lista
      .firstWhere(
        (filtro) => filtro.$1 == status,
        orElse: () => (status, status ?? 'Todas'),
      )
      .$2;
}

/// Candidaturas para padrinho (p24): busca, filtro, seleção múltipla com
/// ações em massa e detalhe completo em bottom sheet.
class TelaCandidaturasCoord extends StatefulWidget {
  const TelaCandidaturasCoord({
    super.key,
    required this.api,
    required this.programa,
    this.status,
    this.publico,
  });

  final CoordenacaoApi api;
  final String? programa;
  final String? status;

  /// `padrinho` | `apadrinhado` | null (padrão padrinho, salvo sem_vinculo).
  final String? publico;

  @override
  State<TelaCandidaturasCoord> createState() => _TelaCandidaturasCoordState();
}

class _TelaCandidaturasCoordState extends State<TelaCandidaturasCoord> {
  List<Map<String, dynamic>> _itens = const [];
  String? _erro;
  bool _carregando = true;
  bool _processando = false;

  /// `padrinho` | `apadrinhado`
  late String _publico;
  String? _status;
  String _busca = '';
  String _filtroConferencia = '';
  final Set<int> _selecionados = {};

  bool get _apadrinhado => _publico == 'apadrinhado';
  bool get _semVinculo => _apadrinhado && _status == 'sem_vinculo';
  bool get _cadastroApadrinhado => _apadrinhado && !_semVinculo;

  void _aplicarFiltrosIniciais() {
    final inicial = widget.status;
    _publico = inicial == 'sem_vinculo' || widget.publico == 'apadrinhado'
        ? 'apadrinhado'
        : 'padrinho';
    _status = _publico == 'apadrinhado' ? (inicial ?? 'sem_vinculo') : inicial;
  }

  @override
  void initState() {
    super.initState();
    _aplicarFiltrosIniciais();
    _carregar();
  }

  @override
  void didUpdateWidget(covariant TelaCandidaturasCoord oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.programa != widget.programa ||
        oldWidget.status != widget.status ||
        oldWidget.publico != widget.publico) {
      _aplicarFiltrosIniciais();
      _carregar();
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final List<Map<String, dynamic>> lista;
      if (_semVinculo) {
        lista = await widget.api.candidaturas(
          programa: widget.programa,
          status: 'sem_vinculo',
        );
      } else if (_cadastroApadrinhado) {
        final todos = await widget.api.cadastros(
          status: _status,
          programa: widget.programa,
        );
        lista = [
          for (final item in todos)
            if (item['tipoParticipacao'] == 'apadrinhado') item,
        ];
      } else {
        lista = await widget.api.candidaturas(
          programa: widget.programa,
          status: _status,
        );
      }
      if (!mounted) return;
      lista.sort(_ordenarLista);
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

  /// Pendente de decisão (pode aprovar/rejeitar em massa).
  bool _aindaPendente(Map<String, dynamic> item) {
    final statusCadastro = '${item['statusCadastro'] ?? ''}';
    if (statusCadastro.isNotEmpty) return statusCadastro == 'pendente';
    final status = '${item['status'] ?? ''}';
    return status == 'pendente' || status == 'em_analise';
  }

  bool _selecionavel(Map<String, dynamic> item) =>
      item['papel'] == 'candidato' &&
      idDe(item) != null &&
      _aindaPendente(item);

  int _ordenarLista(Map<String, dynamic> a, Map<String, dynamic> b) {
    final diff = (_aindaPendente(a) ? 0 : 1) - (_aindaPendente(b) ? 0 : 1);
    if (diff != 0) return diff;
    return '${b['criadoEm'] ?? ''}'.compareTo('${a['criadoEm'] ?? ''}');
  }

  List<Map<String, dynamic>> get _visiveis {
    final termo = _busca.trim().toLowerCase();
    final itens = _itens
        .where(
          (item) =>
              _apadrinhado ||
              _filtroConferencia.isEmpty ||
              (_filtroConferencia == 'pendente'
                  ? item['conferencia'] == null
                  : item['conferencia'] == _filtroConferencia),
        )
        .toList();
    final base = termo.isEmpty
        ? itens
        : itens.where((item) {
            final texto = [
              item['nome'],
              item['email'],
              item['curso'],
              if (item['periodo'] != null) '${item['periodo']}º período',
            ].join(' ').toLowerCase();
            return texto.contains(termo);
          }).toList();
    return [...base]..sort(_ordenarLista);
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
    final filtros = _apadrinhado ? filtrosApadrinhado : filtrosPadrinho;
    final escolhido = await showModalBottomSheet<(String?, String)>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.8,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, 10),
                  child: Text(
                    'Filtrar candidaturas',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                for (final (valor, rotulo) in filtros)
                  ListTile(
                    title: Text(rotulo),
                    trailing: valor == _status
                        ? const Icon(Icons.check, color: AppColors.primary)
                        : null,
                    onTap: () =>
                        Navigator.pop(context, (valor, _filtroConferencia)),
                  ),
                if (!_apadrinhado) ...[
                  const Divider(),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(20, 10, 20, 6),
                    child: Text(
                      'Conferência acadêmica',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  for (final (valor, rotulo) in [
                    ('', 'Conferência: todas'),
                    ('pendente', 'Conferência pendente'),
                    ('requisitos_atendidos', 'Requisitos atendidos'),
                    ('requisitos_nao_atendidos', 'Requisitos não atendidos'),
                  ])
                    ListTile(
                      title: Text(rotulo),
                      trailing: valor == _filtroConferencia
                          ? const Icon(Icons.check, color: AppColors.primary)
                          : null,
                      onTap: () => Navigator.pop(context, (_status, valor)),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
    if (escolhido == null ||
        (escolhido.$1 == _status && escolhido.$2 == _filtroConferencia)) {
      return;
    }
    final mudouStatus = escolhido.$1 != _status;
    setState(() {
      _status = escolhido.$1;
      _filtroConferencia = escolhido.$2;
      _selecionados.clear();
    });
    if (mudouStatus) await _carregar();
  }

  void _trocarPublico(String publico) {
    if (publico == _publico) return;
    setState(() {
      _publico = publico;
      _filtroConferencia = '';
      _status = publico == 'apadrinhado' ? 'sem_vinculo' : null;
      _selecionados.clear();
      _busca = '';
    });
    _carregar();
  }

  Future<void> _acaoEmMassa(String acao) async {
    final ids = _selecionados.toList();
    if (ids.isEmpty || _processando) return;
    final (titulo, verbo, feito) = switch (acao) {
      'aprovar' => ('Aprovar candidaturas', 'Aprovar', 'aprovada(s)'),
      'rejeitar' => ('Rejeitar candidaturas', 'Rejeitar', 'rejeitada(s)'),
      _ => ('Marcar em análise', 'Marcar', 'marcada(s) em análise'),
    };
    final justificativa = acao == 'rejeitar'
        ? await solicitarJustificativaCoord(context)
        : null;
    if (acao == 'rejeitar' && justificativa == null) return;
    if (!mounted) return;
    final ok =
        acao == 'rejeitar' ||
        await confirmarAcaoCoord(
          context,
          titulo: titulo,
          mensagem: '$verbo ${ids.length} candidatura(s) selecionada(s)?',
          confirmar: verbo,
          destrutiva: acao == 'rejeitar',
        );
    if (!ok || !mounted) return;

    setState(() => _processando = true);
    try {
      final resultado = await widget.api.acoesEmMassa(
        ids: ids,
        acao: acao,
        justificativa: justificativa,
      );
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

  Future<void> _detalhe(
    Map<String, dynamic> item, {
    bool avancar = true,
  }) async {
    if (_cadastroApadrinhado) {
      final id = idDe(item);
      if (id == null) return;
      final alterado = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => TelaDetalheCadastroCoord(
            api: widget.api,
            programa: widget.programa,
            id: id,
          ),
        ),
      );
      if (alterado == true && mounted) {
        await _carregar();
        if (avancar) await _abrirProximoPendente(id);
      }
      return;
    }
    final idAtual = idDe(item);
    final alterado = await mostrarDetalheCandidatura(
      context,
      api: widget.api,
      item: item,
      programa: widget.programa,
    );
    if (alterado && mounted) {
      await _carregar();
      if (avancar && idAtual != null) await _abrirProximoPendente(idAtual);
    }
  }

  /// Depois de decidir, abre o próximo pendente (fluxo rápido da coordenação).
  Future<void> _abrirProximoPendente(int idAtual) async {
    final lista = _visiveis;
    final idx = lista.indexWhere((i) => idDe(i) == idAtual);
    Map<String, dynamic>? proximo;
    for (var i = idx + 1; i < lista.length; i++) {
      if (_aindaPendente(lista[i])) {
        proximo = lista[i];
        break;
      }
    }
    if (proximo == null) {
      for (var i = 0; i < lista.length; i++) {
        if (i == idx) continue;
        if (_aindaPendente(lista[i])) {
          proximo = lista[i];
          break;
        }
      }
    }
    if (proximo != null && mounted) {
      await _detalhe(proximo);
    }
  }

  @override
  Widget build(BuildContext context) {
    final visiveis = _visiveis;
    final selecionaveis = _idsSelecionaveis;
    final todasMarcadas =
        selecionaveis.isNotEmpty && selecionaveis.every(_selecionados.contains);

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CabecalhoCoord(
            titulo: 'Candidaturas',
            subtitulo: [
              _apadrinhado
                  ? 'Aprove cadastros e defina vínculos de apadrinhados.'
                  : 'Conheça cada perfil, confira os requisitos e acompanhe as decisões.',
            ].join(' · '),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'padrinho', label: Text('Padrinhos')),
                ButtonSegment(
                  value: 'apadrinhado',
                  label: Text('Apadrinhados'),
                ),
              ],
              selected: {_publico},
              onSelectionChanged: (sel) => _trocarPublico(sel.first),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    onChanged: (valor) => setState(() => _busca = valor),
                    decoration: InputDecoration(
                      hintText: 'Buscar por nome, curso ou período…',
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
                label: Text(
                  'Filtro: ${rotuloFiltro(_status, apadrinhado: _apadrinhado)}',
                ),
                onDeleted: _apadrinhado
                    ? null
                    : () {
                        setState(() {
                          _status = null;
                          _selecionados.clear();
                        });
                        _carregar();
                      },
              ),
            ),
          if (!_apadrinhado && _filtroConferencia.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: InputChip(
                label: Text(
                  _filtroConferencia == 'pendente'
                      ? 'Conferência pendente'
                      : _filtroConferencia == 'requisitos_atendidos'
                      ? 'Requisitos atendidos'
                      : 'Requisitos não atendidos',
                ),
                onDeleted: () => setState(() => _filtroConferencia = ''),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _apadrinhado
                        ? 'Fila de apadrinhados'
                        : 'Fila de candidaturas',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                      fontSize: 14,
                    ),
                  ),
                ),
                SeloPainelCoord('${visiveis.length} registros'),
              ],
            ),
          ),
          if (!_apadrinhado && selecionaveis.isNotEmpty)
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
                    'Selecionar pendentes (${selecionaveis.length})',
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
                                ? (_apadrinhado
                                      ? 'Nenhum apadrinhado encontrado.'
                                      : 'Nenhuma candidatura encontrada.')
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
                          selecionavel: !_apadrinhado && _selecionavel(item),
                          selecionado: id != null && _selecionados.contains(id),
                          modoCadastro: _cadastroApadrinhado,
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
    this.modoCadastro = false,
  });

  final Map<String, dynamic> item;
  final bool selecionavel;
  final bool selecionado;
  final bool modoCadastro;
  final ValueChanged<bool> onSelecionar;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final apadrinhado = item['papel'] == 'apadrinhado' || modoCadastro;
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
          padding: const EdgeInsets.fromLTRB(4, 14, 10, 14),
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
                        color: corTextoSecundarioCoord,
                        fontSize: 12,
                      ),
                    ),
                    Text(
                      '${apadrinhado ? 'Cadastro' : 'Candidatura'} em '
                      '${formatarDataCoord(item['criadoEm'])}',
                      style: const TextStyle(
                        color: corTextoSecundarioCoord,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 5,
                      runSpacing: 6,
                      children: [
                        SeloStatusCoord(item: item),
                        if (!apadrinhado &&
                            ['pendente', 'em_analise'].contains(item['status']))
                          SeloPainelCoord(
                            item['conferencia'] == 'requisitos_atendidos'
                                ? 'Requisitos atendidos'
                                : item['conferencia'] ==
                                      'requisitos_nao_atendidos'
                                ? 'Requisitos não atendidos'
                                : 'Conferência pendente',
                            verde:
                                item['conferencia'] == 'requisitos_atendidos',
                          ),
                      ],
                    ),
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
  });

  final int quantidade;
  final bool processando;
  final VoidCallback onRejeitar;
  final VoidCallback onAprovar;

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
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              '$quantidade selecionada(s)',
              style: const TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 8),
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
