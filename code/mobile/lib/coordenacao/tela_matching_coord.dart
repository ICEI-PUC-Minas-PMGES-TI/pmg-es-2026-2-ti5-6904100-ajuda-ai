import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

const _statusSugestoes = <String, String>{
  'pendente': 'Pendentes',
  'aprovada': 'Aprovadas',
  'recusada': 'Recusadas',
  'obsoleta': 'Desatualizadas',
};

Map<String, dynamic> _mapa(Object? valor) =>
    valor is Map ? Map<String, dynamic>.from(valor) : <String, dynamic>{};

List<Map<String, dynamic>> _mapas(Object? valor) => valor is List
    ? valor
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList()
    : <Map<String, dynamic>>[];

String _nome(Map<String, dynamic> pessoa) =>
    '${pessoa['nome'] ?? _mapa(pessoa['respostas'])['nome'] ?? pessoa['usuarioId'] ?? 'Participante'}';

String _percentual(Object? valor) {
  final numero = valor is num ? valor.toDouble() : double.tryParse('$valor');
  return '${((numero ?? 0) * 100).round()}%';
}

/// Fluxo F11/F12 de matching da coordenação para o ciclo selecionado no shell.
class TelaMatchingCoord extends StatefulWidget {
  const TelaMatchingCoord({
    super.key,
    required this.api,
    required this.programa,
  });

  final CoordenacaoApi api;
  final String programa;

  @override
  State<TelaMatchingCoord> createState() => _TelaMatchingCoordState();
}

class _TelaMatchingCoordState extends State<TelaMatchingCoord> {
  Map<String, dynamic>? _visao;
  List<Map<String, dynamic>> _execucoes = const [];
  List<Map<String, dynamic>> _sugestoes = const [];
  String _status = 'pendente';
  String _aba = 'operacao';
  String? _erro;
  bool _carregando = true;
  bool _alterando = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final resultados = await Future.wait<Object>([
        widget.api.matchingVisao(widget.programa),
        widget.api.execucoesMatching(widget.programa),
        widget.api.sugestoesMatching(widget.programa, status: _status),
      ]);
      if (!mounted) return;
      setState(() {
        _visao = _mapa(resultados[0]);
        _execucoes = _mapas(resultados[1]);
        _sugestoes = _mapas(resultados[2]);
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = mensagemDeErro(erro);
        _carregando = false;
      });
    }
  }

  Future<void> _selecionarStatus(String status) async {
    if (_status == status) return;
    setState(() => _status = status);
    await _carregar();
  }

  Future<void> _configurar() async {
    final visao = _visao;
    if (visao == null) return;
    final salvo = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) => _EditorMatching(
        api: widget.api,
        programa: widget.programa,
        configuracao: _mapa(visao['configuracao']),
        criteriosDisponiveis: _mapas(visao['criteriosDisponiveis']),
      ),
    );
    if (salvo == true && mounted) {
      mostrarMensagemCoord(context, 'Configuração salva em uma nova versão.');
      await _carregar();
    }
  }

  Future<void> _abrirCatalogo() async {
    final alterou = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TelaCatalogoCriteriosMatching(api: widget.api),
      ),
    );
    if (alterou == true && mounted) await _carregar();
  }

  Future<void> _executar() async {
    if (_visao?['podeExecutar'] != true || _alterando) return;
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Gerar nova rodada?',
      mensagem:
          'Sugestões pendentes anteriores ficarão desatualizadas. Decisões e '
          'vínculos confirmados serão preservados.',
      confirmar: 'Executar matching',
    );
    if (!confirmou || !mounted) return;
    setState(() {
      _alterando = true;
      _erro = null;
    });
    try {
      final resultado = await widget.api.executarMatching(widget.programa);
      if (!mounted) return;
      setState(() => _status = 'pendente');
      mostrarMensagemCoord(
        context,
        'Execução concluída: ${resultado['totalSugestoes'] ?? 0} sugestão(ões).',
      );
      await _carregar();
    } catch (erro) {
      if (mounted) setState(() => _erro = mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _alterando = false);
    }
  }

  Future<void> _abrirSugestao(Map<String, dynamic> sugestao) async {
    final id = idDe(sugestao);
    if (id == null) return;
    final alterou = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => TelaComparacaoMatching(api: widget.api, id: id),
      ),
    );
    if (alterou == true && mounted) await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final visao = _visao;
    final configuracao = _mapa(visao?['configuracao']);
    final totais = _mapa(visao?['totais']);
    final chat = _mapa(visao?['chat']);
    final bloqueios = (visao?['bloqueios'] as List? ?? const []);

    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: _carregar,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 28),
            children: [
              CabecalhoCoord(
                voltar: true,
                titulo: 'Matching',
                subtitulo:
                    'Programa ${widget.programa} · configure, gere e decida cada par.',
                acao: IconButton(
                  tooltip: 'Atualizar matching',
                  onPressed: _alterando ? null : _carregar,
                  icon: const Icon(Icons.refresh),
                ),
              ),
              if (_erro != null)
                _Aviso(
                  icone: Icons.error_outline,
                  cor: corErroCoord,
                  titulo: _erro!,
                  acao: TextButton(
                    onPressed: _carregar,
                    child: const Text('Tentar novamente'),
                  ),
                ),
              if (_carregando && visao == null)
                const Padding(
                  padding: EdgeInsets.all(48),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'operacao', label: Text('Operação')),
                    ButtonSegment(
                      value: 'criterios',
                      label: Text('Critérios'),
                    ),
                  ],
                  selected: {_aba},
                  onSelectionChanged: (valor) =>
                      setState(() => _aba = valor.single),
                ),
              ),
              if (_aba == 'criterios')
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Critérios de matching',
                        style: TextStyle(
                          fontFamily: 'Poppins',
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Gerencie o catálogo aqui e use em Formulários via '
                        '“Adicionar pergunta de matching”. Depois selecione '
                        'os pares na configuração do algoritmo.',
                        style: TextStyle(
                          color: corTextoSecundarioCoord,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _abrirCatalogo,
                        icon: const Icon(Icons.library_books_outlined),
                        label: const Text('Abrir catálogo de critérios'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          minimumSize: const Size.fromHeight(48),
                        ),
                      ),
                    ],
                  ),
                ),
              if (_aba == 'operacao' && visao != null) ...[
                _Aviso(
                  icone: visao['podeExecutar'] == true
                      ? Icons.check_circle_outline
                      : Icons.lock_outline,
                  cor: visao['podeExecutar'] == true
                      ? AppAccents.success
                      : AppAccents.iconeLaranja,
                  titulo: visao['podeExecutar'] == true
                      ? 'Pronto para executar'
                      : 'Matching bloqueado',
                  descricao: visao['podeExecutar'] == true
                      ? 'Inscrições encerradas, etapa liberada e candidatos elegíveis.'
                      : bloqueios.map((item) => '• $item').join('\n'),
                ),
                _ResumoMatching(totais: totais),
                _CardConfiguracao(
                  configuracao: configuracao,
                  alterando: _alterando,
                  onConfigurar: _configurar,
                  onExecutar: visao['podeExecutar'] == true ? _executar : null,
                ),
                _Aviso(
                  icone: Icons.chat_bubble_outline,
                  cor: AppAccents.iconeLaranja,
                  titulo: chat['disponivel'] == true
                      ? 'Chat integrado'
                      : 'Dependência de chat pendente',
                  descricao: chat['disponivel'] == true
                      ? 'A aprovação cria a conversa privada do vínculo.'
                      : '${chat['mensagem'] ?? 'A integração do chat está pendente.'} '
                            '${chat['pendencias'] ?? totais['outboxPendentes'] ?? 0} '
                            'evento(s) aguardando processamento.',
                ),
                _CabecalhoSugestoes(
                  execucao: _execucoes.isEmpty ? null : _execucoes.first,
                ),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SegmentedButton<String>(
                    segments: [
                      for (final item in _statusSugestoes.entries)
                        ButtonSegment(value: item.key, label: Text(item.value)),
                    ],
                    selected: {_status},
                    onSelectionChanged: _alterando
                        ? null
                        : (valor) => _selecionarStatus(valor.single),
                  ),
                ),
                if (_carregando)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(
                      child: CircularProgressIndicator(
                        color: AppColors.primary,
                      ),
                    ),
                  )
                else if (_sugestoes.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.auto_awesome_outlined,
                          color: AppColors.muted,
                          size: 34,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Nenhuma sugestão ${_statusSugestoes[_status]!.toLowerCase()}.',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  )
                else
                  for (final sugestao in _sugestoes)
                    _CardSugestao(
                      sugestao: sugestao,
                      onAbrir: () => _abrirSugestao(sugestao),
                    ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Aviso extends StatelessWidget {
  const _Aviso({
    required this.icone,
    required this.cor,
    required this.titulo,
    this.descricao,
    this.acao,
  });

  final IconData icone;
  final Color cor;
  final String titulo;
  final String? descricao;
  final Widget? acao;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 4, 16, 10),
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: cor.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(13),
      border: Border.all(color: cor.withValues(alpha: 0.25)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icone, color: cor, size: 21),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titulo, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (descricao?.isNotEmpty == true)
                Text(
                  descricao!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
            ],
          ),
        ),
        ?acao,
      ],
    ),
  );
}

class _ResumoMatching extends StatelessWidget {
  const _ResumoMatching({required this.totais});

  final Map<String, dynamic> totais;

  @override
  Widget build(BuildContext context) {
    final itens = [
      (
        '${totais['padrinhosElegiveis'] ?? 0} / ${totais['apadrinhadosElegiveis'] ?? 0}',
        'Padrinhos / apadrinhados',
      ),
      ('${totais['sugestoesPendentes'] ?? 0}', 'Sugestões pendentes'),
      ('${totais['vinculos'] ?? 0}', 'Vínculos confirmados'),
      ('${totais['pessoasSemVinculo'] ?? 0}', 'Sem vínculo'),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 2,
        childAspectRatio: 2.25,
        children: [
          for (final item in itens)
            Card(
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.$1,
                      style: const TextStyle(
                        fontFamily: 'Poppins',
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    Text(item.$2, style: const TextStyle(fontSize: 11)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CardConfiguracao extends StatelessWidget {
  const _CardConfiguracao({
    required this.configuracao,
    required this.alterando,
    required this.onConfigurar,
    required this.onExecutar,
  });

  final Map<String, dynamic> configuracao;
  final bool alterando;
  final VoidCallback onConfigurar;
  final VoidCallback? onExecutar;

  @override
  Widget build(BuildContext context) {
    final liberado = configuracao['liberado'] == true;
    final criterios = configuracao['criterios'] as List? ?? const [];
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 2, 16, 10),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    configuracao.isEmpty
                        ? 'Critérios e capacidades'
                        : 'Configuração v${configuracao['versao']}',
                    style: const TextStyle(
                      fontFamily: 'Poppins',
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
                if (configuracao.isNotEmpty)
                  Chip(
                    label: Text(liberado ? 'Liberado' : 'Bloqueado'),
                    avatar: Icon(
                      liberado ? Icons.lock_open : Icons.lock,
                      size: 16,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              configuracao.isEmpty
                  ? 'Defina ao menos um critério suportado para começar.'
                  : '${criterios.length} critério(s) · '
                        '${configuracao['capacidadePorPadrinho']} por padrinho · '
                        '${configuracao['capacidadePorApadrinhado']} por apadrinhado.',
              style: const TextStyle(color: corTextoSecundarioCoord),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: alterando ? null : onConfigurar,
                  icon: const Icon(Icons.tune),
                  label: Text(
                    configuracao.isEmpty ? 'Configurar' : 'Editar configuração',
                  ),
                ),
                FilledButton.icon(
                  onPressed: alterando ? null : onExecutar,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                  ),
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(alterando ? 'Processando…' : 'Gerar sugestões'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CabecalhoSugestoes extends StatelessWidget {
  const _CabecalhoSugestoes({required this.execucao});

  final Map<String, dynamic>? execucao;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Sugestões',
          style: TextStyle(
            fontFamily: 'Poppins',
            fontWeight: FontWeight.w800,
            fontSize: 18,
          ),
        ),
        Text(
          execucao == null
              ? 'Nenhuma execução registrada.'
              : 'Última execução: ${execucao!['status']}'
                    '${formatarDataCoord(execucao!['criadoEm']).isEmpty ? '' : ' · ${formatarDataCoord(execucao!['criadoEm'])}'}.',
          style: const TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
        ),
      ],
    ),
  );
}

class _CardSugestao extends StatelessWidget {
  const _CardSugestao({required this.sugestao, required this.onAbrir});

  final Map<String, dynamic> sugestao;
  final VoidCallback onAbrir;

  @override
  Widget build(BuildContext context) {
    final padrinho = _mapa(sugestao['padrinho']);
    final apadrinhado = _mapa(sugestao['apadrinhado']);
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 9, 16, 0),
      color: Colors.white,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onAbrir,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${_nome(padrinho)} ↔ ${_nome(apadrinhado)}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Text(
                    _percentual(sugestao['score']),
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
              Text(
                '${padrinho['curso'] ?? 'Curso não informado'} · '
                '${apadrinhado['curso'] ?? 'Curso não informado'}',
                style: const TextStyle(
                  fontSize: 12,
                  color: corTextoSecundarioCoord,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Chip(
                    label: Text('${sugestao['status']}'),
                    visualDensity: VisualDensity.compact,
                  ),
                  const Spacer(),
                  const Text(
                    'Comparar',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: AppColors.primary),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EditorMatching extends StatefulWidget {
  const _EditorMatching({
    required this.api,
    required this.programa,
    required this.configuracao,
    required this.criteriosDisponiveis,
  });

  final CoordenacaoApi api;
  final String programa;
  final Map<String, dynamic> configuracao;
  final List<Map<String, dynamic>> criteriosDisponiveis;

  @override
  State<_EditorMatching> createState() => _EditorMatchingState();
}

class _EditorMatchingState extends State<_EditorMatching> {
  late int _capacidadeP =
      (widget.configuracao['capacidadePorPadrinho'] as num?)?.toInt() ?? 3;
  late int _capacidadeA =
      (widget.configuracao['capacidadePorApadrinhado'] as num?)?.toInt() ?? 1;
  late final List<Map<String, dynamic>> _criterios = [
    for (final item in _mapas(widget.configuracao['criterios']))
      if (item['criterioPadrinhoId'] != null &&
          item['criterioApadrinhadoId'] != null)
        {
          'criterioPadrinhoId': (item['criterioPadrinhoId'] as num).toInt(),
          'criterioApadrinhadoId': (item['criterioApadrinhadoId'] as num)
              .toInt(),
          'operacao': '${item['operacao'] ?? 'igualdade'}',
          'peso': (item['peso'] as num?)?.toInt() ?? 10,
        },
  ];
  bool _salvando = false;
  String? _erro;

  List<Map<String, dynamic>> get _opcoes {
    final habilitaveis = widget.criteriosDisponiveis
        .where((c) => c['habilitavel'] == true)
        .toList();
    final base = habilitaveis.isNotEmpty
        ? habilitaveis
        : widget.criteriosDisponiveis;
    return base.where((c) => c['ativo'] != false).toList();
  }

  void _adicionar() {
    if (_opcoes.isEmpty) return;
    final primeiro = _opcoes.first;
    final id = (primeiro['id'] as num).toInt();
    setState(() {
      _criterios.add({
        'criterioPadrinhoId': id,
        'criterioApadrinhadoId': id,
        'operacao': primeiro['tipo'] == 'multipla_escolha'
            ? 'intersecao'
            : 'igualdade',
        'peso': 10,
      });
    });
  }

  Future<void> _salvar() async {
    if (_criterios.isEmpty || _salvando) {
      setState(() => _erro = 'Adicione ao menos um par de critérios.');
      return;
    }
    setState(() {
      _salvando = true;
      _erro = null;
    });
    try {
      await widget.api.salvarMatchingConfiguracao(
        programa: widget.programa,
        liberado: widget.configuracao['liberado'] == true,
        capacidadePorPadrinho: _capacidadeP,
        capacidadePorApadrinhado: _capacidadeA,
        criterios: _criterios,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _salvando = false;
          _erro = mensagemDeErro(erro);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Configurar matching',
              style: TextStyle(
                fontFamily: 'Poppins',
                fontWeight: FontWeight.w800,
                fontSize: 20,
              ),
            ),
            const Text(
              'Selecione pares do catálogo. Prefira critérios habilitáveis '
              '(já coletados nos dois públicos).',
              style: TextStyle(color: corTextoSecundarioCoord, fontSize: 12),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _capacidadeP,
                    decoration: const InputDecoration(
                      labelText: 'Limite por padrinho',
                    ),
                    items: [
                      for (var i = 1; i <= 20; i++)
                        DropdownMenuItem(value: i, child: Text('$i')),
                    ],
                    onChanged: (valor) =>
                        setState(() => _capacidadeP = valor ?? _capacidadeP),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _capacidadeA,
                    decoration: const InputDecoration(
                      labelText: 'Limite por apadrinhado',
                    ),
                    items: [
                      for (var i = 1; i <= 20; i++)
                        DropdownMenuItem(value: i, child: Text('$i')),
                    ],
                    onChanged: (valor) =>
                        setState(() => _capacidadeA = valor ?? _capacidadeA),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Pares de critérios',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                TextButton.icon(
                  onPressed: _opcoes.isEmpty ? null : _adicionar,
                  icon: const Icon(Icons.add),
                  label: const Text('Adicionar'),
                ),
              ],
            ),
            Expanded(
              child: _criterios.isEmpty
                  ? const Center(
                      child: Text(
                        'Adicione pares do catálogo. Critérios são geridos '
                        'na aba Critérios e usados em Formulários.',
                        textAlign: TextAlign.center,
                      ),
                    )
                  : ListView.builder(
                      itemCount: _criterios.length,
                      itemBuilder: (context, indice) {
                        final criterio = _criterios[indice];
                        final ids = {
                          for (final c in widget.criteriosDisponiveis)
                            (c['id'] as num).toInt(): c,
                        };
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'Par ${indice + 1}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                    IconButton(
                                      tooltip: 'Remover critério',
                                      onPressed: () => setState(
                                        () => _criterios.removeAt(indice),
                                      ),
                                      icon: const Icon(Icons.delete_outline),
                                    ),
                                  ],
                                ),
                                DropdownButtonFormField<int>(
                                  initialValue:
                                      criterio['criterioPadrinhoId'] as int?,
                                  decoration: const InputDecoration(
                                    labelText: 'Critério do padrinho',
                                  ),
                                  items: [
                                    for (final c
                                        in widget.criteriosDisponiveis)
                                      DropdownMenuItem(
                                        value: (c['id'] as num).toInt(),
                                        child: Text(
                                          '${c['nome']}'
                                          '${c['habilitavel'] == true ? '' : ' (parcial)'}',
                                        ),
                                      ),
                                  ],
                                  onChanged: (valor) {
                                    if (valor == null) return;
                                    setState(() {
                                      criterio['criterioPadrinhoId'] = valor;
                                      final meta = ids[valor];
                                      criterio['operacao'] =
                                          meta?['tipo'] == 'multipla_escolha'
                                          ? 'intersecao'
                                          : 'igualdade';
                                    });
                                  },
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<int>(
                                  initialValue:
                                      criterio['criterioApadrinhadoId'] as int?,
                                  decoration: const InputDecoration(
                                    labelText: 'Critério do apadrinhado',
                                  ),
                                  items: [
                                    for (final c
                                        in widget.criteriosDisponiveis)
                                      DropdownMenuItem(
                                        value: (c['id'] as num).toInt(),
                                        child: Text(
                                          '${c['nome']}'
                                          '${c['habilitavel'] == true ? '' : ' (parcial)'}',
                                        ),
                                      ),
                                  ],
                                  onChanged: (valor) => setState(
                                    () =>
                                        criterio['criterioApadrinhadoId'] =
                                            valor,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                DropdownButtonFormField<String>(
                                  initialValue:
                                      '${criterio['operacao'] ?? 'igualdade'}',
                                  decoration: const InputDecoration(
                                    labelText: 'Comparação',
                                  ),
                                  items: const [
                                    DropdownMenuItem(
                                      value: 'igualdade',
                                      child: Text('Igualdade'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'intersecao',
                                      child: Text('Interseção'),
                                    ),
                                    DropdownMenuItem(
                                      value: 'diferenca',
                                      child: Text('Diferença'),
                                    ),
                                  ],
                                  onChanged: (valor) => setState(
                                    () => criterio['operacao'] = valor,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                TextFormField(
                                  initialValue: '${criterio['peso'] ?? 10}',
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(
                                    labelText: 'Peso (1 a 100)',
                                  ),
                                  onChanged: (valor) {
                                    final peso = int.tryParse(valor);
                                    if (peso != null &&
                                        peso >= 1 &&
                                        peso <= 100) {
                                      criterio['peso'] = peso;
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            if (_erro != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _erro!,
                  style: const TextStyle(color: corErroCoord),
                ),
              ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _salvando
                        ? null
                        : () => Navigator.pop(context, false),
                    child: const Text('Cancelar'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: _salvando ? null : _salvar,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                    ),
                    child: Text(_salvando ? 'Salvando…' : 'Salvar nova versão'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

/// Catálogo CRUD de critérios de matching (paridade com a web).
class TelaCatalogoCriteriosMatching extends StatefulWidget {
  const TelaCatalogoCriteriosMatching({super.key, required this.api});

  final CoordenacaoApi api;

  @override
  State<TelaCatalogoCriteriosMatching> createState() =>
      _TelaCatalogoCriteriosMatchingState();
}

class _TelaCatalogoCriteriosMatchingState
    extends State<TelaCatalogoCriteriosMatching> {
  List<Map<String, dynamic>> _lista = const [];
  final _busca = TextEditingController();
  bool _carregando = true;
  bool _alterou = false;
  String? _erro;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void dispose() {
    _busca.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final lista = await widget.api.criteriosMatching(
        busca: _busca.text.trim().isEmpty ? null : _busca.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _lista = lista;
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = mensagemDeErro(erro);
        _carregando = false;
      });
    }
  }

  Future<void> _editar([Map<String, dynamic>? item]) async {
    Map<String, dynamic>? inicial = item;
    if (item != null) {
      try {
        inicial = await widget.api.criterioMatching((item['id'] as num).toInt());
      } catch (erro) {
        if (mounted) {
          mostrarMensagemCoord(context, mensagemDeErro(erro));
        }
        return;
      }
    }
    if (!mounted) return;
    final salvo = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) => _EditorCriterioCatalogo(
        api: widget.api,
        inicial: inicial,
      ),
    );
    if (salvo == true && mounted) {
      _alterou = true;
      await _carregar();
    }
  }

  Future<void> _alternar(Map<String, dynamic> item) async {
    try {
      await widget.api.ativarCriterioMatching(
        (item['id'] as num).toInt(),
        item['ativo'] != true,
      );
      _alterou = true;
      if (mounted) {
        mostrarMensagemCoord(
          context,
          item['ativo'] == true ? 'Critério desativado.' : 'Critério ativado.',
        );
        await _carregar();
      }
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: corFundoCoord,
      appBar: AppBar(
        title: const Text('Catálogo de critérios'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context, _alterou),
        ),
        actions: [
          IconButton(
            tooltip: 'Novo critério',
            onPressed: () => _editar(),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _carregar,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            TextField(
              controller: _busca,
              decoration: InputDecoration(
                labelText: 'Buscar',
                suffixIcon: IconButton(
                  onPressed: _carregar,
                  icon: const Icon(Icons.search),
                ),
              ),
              onSubmitted: (_) => _carregar(),
            ),
            if (_erro != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_erro!, style: const TextStyle(color: corErroCoord)),
              ),
            if (_carregando)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (_lista.isEmpty)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Text(
                  'Nenhum critério no catálogo. Crie o primeiro para usar '
                  'em Formulários e na configuração.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              for (final item in _lista)
                Card(
                  margin: const EdgeInsets.only(top: 10),
                  child: ListTile(
                    title: Text('${item['nome']}'),
                    subtitle: Text(
                      '${item['ativo'] == true ? 'Ativo' : 'Inativo'}'
                      ' · ${_mapa(item['versao'])['tipo'] ?? '—'}'
                      ' · usos: ${_mapas(_mapa(item['usos'])['formularios']).length}'
                      ' form(s), ${_mapa(item['usos'])['configuracoes'] ?? 0} config(s)',
                    ),
                    isThreeLine: true,
                    trailing: PopupMenuButton<String>(
                      onSelected: (valor) {
                        if (valor == 'editar') _editar(item);
                        if (valor == 'ativo') _alternar(item);
                      },
                      itemBuilder: (_) => [
                        const PopupMenuItem(
                          value: 'editar',
                          child: Text('Editar'),
                        ),
                        PopupMenuItem(
                          value: 'ativo',
                          child: Text(
                            item['ativo'] == true ? 'Desativar' : 'Ativar',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _EditorCriterioCatalogo extends StatefulWidget {
  const _EditorCriterioCatalogo({required this.api, this.inicial});

  final CoordenacaoApi api;
  final Map<String, dynamic>? inicial;

  @override
  State<_EditorCriterioCatalogo> createState() =>
      _EditorCriterioCatalogoState();
}

class _EditorCriterioCatalogoState extends State<_EditorCriterioCatalogo> {
  late final _nome = TextEditingController(
    text: '${widget.inicial?['nome'] ?? ''}',
  );
  late final _descricao = TextEditingController(
    text: '${widget.inicial?['descricao'] ?? ''}',
  );
  late final _enunciado = TextEditingController(
    text:
        '${_mapa(widget.inicial?['versao'])['enunciadoPadrao'] ?? ''}',
  );
  late String _tipo =
      '${_mapa(widget.inicial?['versao'])['tipo'] ?? 'escolha_unica'}';
  late bool _ativo = widget.inicial?['ativo'] != false;
  late final List<TextEditingController> _alternativas = [
    for (final alt in _mapas(_mapa(widget.inicial?['versao'])['alternativas']))
      TextEditingController(text: '${alt['rotulo'] ?? ''}'),
    if (_mapas(_mapa(widget.inicial?['versao'])['alternativas']).isEmpty &&
        _tipo != 'sim_nao')
      TextEditingController(),
  ];
  bool _salvando = false;
  String? _erro;
  List<Map<String, dynamic>> _semelhantes = const [];

  @override
  void initState() {
    super.initState();
    _nome.addListener(_atualizarSemelhantes);
  }

  Future<void> _atualizarSemelhantes() async {
    final nome = _nome.text.trim();
    if (nome.length < 3) {
      if (_semelhantes.isNotEmpty) setState(() => _semelhantes = const []);
      return;
    }
    try {
      final lista = await widget.api.criteriosMatchingSemelhantes(
        nome,
        excetoId: (widget.inicial?['id'] as num?)?.toInt(),
      );
      if (mounted) setState(() => _semelhantes = lista);
    } catch (_) {
      if (mounted) setState(() => _semelhantes = const []);
    }
  }

  @override
  void dispose() {
    _nome.removeListener(_atualizarSemelhantes);
    _nome.dispose();
    _descricao.dispose();
    _enunciado.dispose();
    for (final c in _alternativas) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _salvar() async {
    if (_salvando) return;
    setState(() {
      _salvando = true;
      _erro = null;
    });
    final corpo = <String, dynamic>{
      'nome': _nome.text.trim(),
      'descricao': _descricao.text.trim().isEmpty
          ? null
          : _descricao.text.trim(),
      'enunciadoPadrao': _enunciado.text.trim(),
      'tipo': _tipo,
      'ativo': _ativo,
      if (_tipo != 'sim_nao')
        'alternativas': [
          for (final c in _alternativas)
            if (c.text.trim().isNotEmpty) {'rotulo': c.text.trim()},
        ],
    };
    try {
      final id = (widget.inicial?['id'] as num?)?.toInt();
      if (id == null) {
        await widget.api.criarCriterioMatching(corpo);
      } else {
        await widget.api.atualizarCriterioMatching(id, corpo);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _salvando = false;
          _erro = mensagemDeErro(erro);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                widget.inicial == null ? 'Novo critério' : 'Editar critério',
                style: const TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _nome,
                decoration: const InputDecoration(labelText: 'Nome'),
              ),
              if (_semelhantes.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Definições semelhantes (não serão fundidas): '
                  '${_semelhantes.map((s) => s['nome']).join('; ')}.',
                  style: TextStyle(
                    color: Colors.orange.shade800,
                    fontSize: 13,
                  ),
                ),
              ],
              TextField(
                controller: _descricao,
                decoration: const InputDecoration(labelText: 'Descrição'),
              ),
              TextField(
                controller: _enunciado,
                decoration: const InputDecoration(
                  labelText: 'Enunciado padrão',
                ),
              ),
              DropdownButtonFormField<String>(
                initialValue: _tipo,
                decoration: const InputDecoration(labelText: 'Tipo'),
                items: const [
                  DropdownMenuItem(value: 'sim_nao', child: Text('Sim / Não')),
                  DropdownMenuItem(
                    value: 'escolha_unica',
                    child: Text('Escolha única'),
                  ),
                  DropdownMenuItem(
                    value: 'multipla_escolha',
                    child: Text('Múltipla escolha'),
                  ),
                ],
                onChanged: (valor) => setState(() {
                  _tipo = valor ?? _tipo;
                  if (_tipo == 'sim_nao') {
                    for (final c in _alternativas) {
                      c.dispose();
                    }
                    _alternativas.clear();
                  } else if (_alternativas.isEmpty) {
                    _alternativas.add(TextEditingController());
                  }
                }),
              ),
              if (_tipo != 'sim_nao') ...[
                const SizedBox(height: 8),
                const Text(
                  'Alternativas',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                for (final (i, c) in _alternativas.indexed)
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: c,
                          decoration: InputDecoration(
                            labelText: 'Alternativa ${i + 1}',
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: _alternativas.length <= 1
                            ? null
                            : () => setState(() {
                                _alternativas.removeAt(i).dispose();
                              }),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                TextButton.icon(
                  onPressed: () => setState(
                    () => _alternativas.add(TextEditingController()),
                  ),
                  icon: const Icon(Icons.add),
                  label: const Text('Alternativa'),
                ),
              ],
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _ativo,
                title: const Text('Critério ativo'),
                onChanged: (v) => setState(() => _ativo = v),
              ),
              if (_erro != null)
                Text(_erro!, style: const TextStyle(color: corErroCoord)),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _salvando ? null : _salvar,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  minimumSize: const Size.fromHeight(48),
                ),
                child: Text(_salvando ? 'Salvando…' : 'Salvar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class TelaComparacaoMatching extends StatefulWidget {
  const TelaComparacaoMatching({
    super.key,
    required this.api,
    required this.id,
  });

  final CoordenacaoApi api;
  final int id;

  @override
  State<TelaComparacaoMatching> createState() => _TelaComparacaoMatchingState();
}

class _TelaComparacaoMatchingState extends State<TelaComparacaoMatching> {
  Map<String, dynamic>? _dados;
  String? _erro;
  bool _carregando = true;
  bool _decidindo = false;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    try {
      final dados = await widget.api.sugestaoMatching(widget.id);
      if (mounted) {
        setState(() {
          _dados = dados;
          _erro = null;
          _carregando = false;
        });
      }
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = mensagemDeErro(erro);
          _carregando = false;
        });
      }
    }
  }

  Future<void> _aprovar() async {
    final dados = _dados;
    if (dados == null) return;
    final padrinho = _mapa(dados['padrinho']);
    final apadrinhado = _mapa(dados['apadrinhado']);
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Confirmar este match?',
      mensagem:
          'Será criado o vínculo entre ${_nome(padrinho)} e '
          '${_nome(apadrinhado)}. O servidor revalidará elegibilidade e capacidade.',
      confirmar: 'Confirmar match',
    );
    if (!confirmou || !mounted) return;
    setState(() => _decidindo = true);
    try {
      final resposta = await widget.api.aprovarSugestaoMatching(widget.id);
      if (!mounted) return;
      final chat = _mapa(resposta['chat']);
      mostrarMensagemCoord(
        context,
        chat['criado'] == true
            ? 'Match aprovado. Conversa privada criada.'
            : 'Match aprovado.',
      );
      Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = mensagemDeErro(erro);
          _decidindo = false;
        });
        await _carregar();
      }
    }
  }

  Future<void> _recusar() async {
    var motivo = '';
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Recusar sugestão?'),
          content: TextField(
            maxLength: 1000,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Motivo administrativo (opcional)',
            ),
            onChanged: (valor) => motivo = valor,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: corErroCoord),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirmar recusa'),
            ),
          ],
        ),
      ),
    );
    if (confirmou != true || !mounted) return;
    setState(() => _decidindo = true);
    try {
      await widget.api.recusarSugestaoMatching(
        widget.id,
        motivo: motivo.trim().isEmpty ? null : motivo.trim(),
      );
      if (!mounted) return;
      mostrarMensagemCoord(context, 'Sugestão recusada.');
      Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _erro = mensagemDeErro(erro);
          _decidindo = false;
        });
        await _carregar();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dados = _dados;
    return Scaffold(
      backgroundColor: corFundoCoord,
      appBar: AppBar(
        title: const Text('Comparar candidatos'),
        backgroundColor: Colors.white,
      ),
      body: _carregando
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            )
          : dados == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_erro ?? 'Não foi possível abrir a sugestão.'),
                    FilledButton(
                      onPressed: _carregar,
                      child: const Text('Tentar novamente'),
                    ),
                  ],
                ),
              ),
            )
          : _conteudo(dados),
    );
  }

  Widget _conteudo(Map<String, dynamic> dados) {
    final padrinho = _mapa(dados['padrinho']);
    final apadrinhado = _mapa(dados['apadrinhado']);
    final capacidade = _mapa(dados['capacidade']);
    final capP = _mapa(capacidade['padrinho']);
    final capA = _mapa(capacidade['apadrinhado']);
    final explicacao = _mapa(dados['explicacao']);
    final criterios = _mapas(explicacao['criterios']);
    final pendente = dados['status'] == 'pendente';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _PessoaMatching(titulo: 'Padrinho', pessoa: padrinho),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 42),
              child: Icon(Icons.link, color: AppColors.primary),
            ),
            Expanded(
              child: _PessoaMatching(
                titulo: 'Apadrinhado',
                pessoa: apadrinhado,
              ),
            ),
          ],
        ),
        Card(
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Compatibilidade ${_percentual(explicacao['score'] ?? dados['score'])}',
                  style: const TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
                const Text(
                  'O score descreve o cálculo configurado; não é probabilidade de sucesso.',
                  style: TextStyle(
                    fontSize: 12,
                    color: corTextoSecundarioCoord,
                  ),
                ),
                const Divider(),
                Text(
                  'Capacidade: padrinho ${capP['restante'] ?? '—'}/${capP['limite'] ?? '—'} restante(s) · '
                  'apadrinhado ${capA['restante'] ?? '—'}/${capA['limite'] ?? '—'} restante(s).',
                ),
                for (final criterio in criterios) ...[
                  const Divider(),
                  Text(
                    '${criterio['rotuloPadrinho'] ?? criterio['campoPadrinho']} '
                    '↔ ${criterio['rotuloApadrinhado'] ?? criterio['campoApadrinhado']}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    criterio['considerado'] != true
                        ? 'Não considerado: uma resposta está ausente.'
                        : '${criterio['compativel'] == true ? 'Compatível' : 'Sem correspondência'} · '
                              'contribuição ${criterio['contribuicao']}/${criterio['peso']}',
                    style: TextStyle(
                      color: criterio['compativel'] == true
                          ? AppAccents.success
                          : corTextoSecundarioCoord,
                    ),
                  ),
                  if (criterio['considerado'] == true)
                    Text(
                      'Padrinho: ${_valorCriterio(criterio['valorPadrinho'])} · '
                      'Apadrinhado: ${_valorCriterio(criterio['valorApadrinhado'])}',
                      style: const TextStyle(fontSize: 11),
                    ),
                ],
              ],
            ),
          ),
        ),
        _Aviso(
          icone: Icons.chat_bubble_outline,
          cor: AppAccents.iconeLaranja,
          titulo: 'Conversa privada',
          descricao: dados['status'] == 'aprovada'
              ? 'A conversa privada do vínculo foi criada.'
              : 'A conversa privada será criada junto com a aprovação do vínculo.',
        ),
        if (!pendente)
          _Aviso(
            icone: Icons.fact_check_outlined,
            cor: AppColors.primary,
            titulo: 'Decisão: ${dados['status']}',
            descricao:
                'Por ${dados['decididaPor'] ?? '—'}'
                '${dados['motivoDecisao'] == null ? '' : ' · ${dados['motivoDecisao']}'}',
          ),
        if (_erro != null)
          Text(_erro!, style: const TextStyle(color: corErroCoord)),
        if (pendente)
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _decidindo ? null : _recusar,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: corErroCoord,
                  ),
                  child: const Text('Recusar'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: _decidindo ? null : _aprovar,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                  ),
                  child: Text(_decidindo ? 'Registrando…' : 'Aprovar match'),
                ),
              ),
            ],
          ),
      ],
    );
  }

  String _valorCriterio(Object? valor) =>
      valor is List ? valor.join(', ') : '${valor ?? '—'}';
}

class _PessoaMatching extends StatelessWidget {
  const _PessoaMatching({required this.titulo, required this.pessoa});

  final String titulo;
  final Map<String, dynamic> pessoa;

  @override
  Widget build(BuildContext context) {
    final respostas = _mapa(pessoa['respostas']);
    return Card(
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              titulo.toUpperCase(),
              style: const TextStyle(
                color: AppColors.primary,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              _nome(pessoa),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            Text(
              '${pessoa['curso'] ?? respostas['curso'] ?? 'Curso não informado'}',
              style: const TextStyle(fontSize: 11),
            ),
            Text(
              'Período ${pessoa['periodo'] ?? respostas['periodo'] ?? '—'}',
              style: const TextStyle(fontSize: 11),
            ),
            Text(
              'Candidatura: ${pessoa['status'] ?? '—'}',
              style: const TextStyle(fontSize: 11),
            ),
            Text(
              'Programa: ${pessoa['programa'] ?? '—'}',
              style: const TextStyle(fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
