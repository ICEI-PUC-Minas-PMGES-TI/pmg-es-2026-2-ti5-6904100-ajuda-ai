import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

/// Semestre pela data (mesma regra do backend: jan–jun = /1, jul–dez = /2).
String codigoCicloDaData([DateTime? data]) {
  final d = data ?? DateTime.now();
  return '${d.year}/${d.month <= 6 ? 1 : 2}';
}

String _semestreSeguinte(String codigo) {
  final [ano, semestre] = codigo.split('/').map(int.parse).toList();
  return semestre == 1 ? '$ano/2' : '${ano + 1}/1';
}

/// Sugestões para o novo ciclo: o vigente pela data e os próximos, se ainda
/// não existem.
List<String> sugestoesDeCiclo(List<String> existentes, [DateTime? data]) {
  final atual = codigoCicloDaData(data);
  final seguinte = _semestreSeguinte(atual);
  return [
    atual,
    seguinte,
    _semestreSeguinte(seguinte),
  ].where((codigo) => !existentes.contains(codigo)).toList();
}

final _padraoCodigoCiclo = RegExp(r'^\d{4}/[12]$');

/// Programas (ciclos): totais, etapa atual, inscrições e novo ciclo.
class TelaProgramasCoord extends StatefulWidget {
  const TelaProgramasCoord({
    super.key,
    required this.api,
    this.pendencia,
    this.onProgramaCriado,
    this.onProgramaSelecionado,
    this.onProgramaExcluido,
  });

  final CoordenacaoApi api;

  /// `grupos` | `prazo` — vindo dos pontos de atenção do dashboard.
  final String? pendencia;
  final ValueChanged<String>? onProgramaCriado;
  final ValueChanged<String>? onProgramaSelecionado;
  final ValueChanged<String>? onProgramaExcluido;

  @override
  State<TelaProgramasCoord> createState() => _TelaProgramasCoordState();
}

class _TelaProgramasCoordState extends State<TelaProgramasCoord> {
  List<Map<String, dynamic>> _programas = const [];
  bool _carregando = true;
  String? _erro;

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
      final lista = await widget.api.programas();
      if (!mounted) return;
      setState(() {
        _programas = lista;
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

  /// Abre um ciclo com código explícito (ex.: 2027/1), sem depender da data.
  Future<void> _novoCiclo() async {
    final existentes = [for (final p in _programas) '${p['codigo']}'];
    final sugestoes = sugestoesDeCiclo(existentes);
    final vigente = codigoCicloDaData();
    final escolhido = await showDialog<String>(
      context: context,
      builder: (_) => _DialogoNovoCiclo(
        existentes: existentes,
        sugestoes: sugestoes,
        vigentePelaData: vigente,
      ),
    );
    if (escolhido == null || !mounted) return;
    try {
      final criado = await widget.api.criarPrograma(escolhido);
      if (!mounted) return;
      final codigo = criado['codigo'] as String?;
      mostrarMensagemCoord(context, 'Ciclo ${codigo ?? ''} aberto.');
      if (codigo != null) widget.onProgramaCriado?.call(codigo);
      await _carregar();
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  Future<void> _editar(Map<String, dynamic> programa) async {
    final salvo = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) => _EditorPrograma(api: widget.api, programa: programa),
    );
    if (salvo == true && mounted) {
      mostrarMensagemCoord(context, 'Programa atualizado.');
      await _carregar();
    }
  }

  Future<void> _excluir(Map<String, dynamic> programa) async {
    final codigo = programa['codigo'] as String;
    final excluido = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ExcluirProgramaDialog(api: widget.api, codigo: codigo),
    );
    if (!mounted || excluido != true) return;
    mostrarMensagemCoord(context, 'Programa $codigo excluído.');
    widget.onProgramaExcluido?.call(codigo);
    await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final aviso = switch (widget.pendencia) {
      'grupos' =>
        'Há grupos incompletos: confira os totais de grupos e apadrinhados '
            'e use "Usuários" para definir padrinhos.',
      'prazo' =>
        'O prazo de inscrições está próximo do fim: revise a etapa atual e '
            'se as inscrições continuam abertas.',
      _ => null,
    };

    return Scaffold(
      backgroundColor: corFundoCoord,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: _carregar,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              CabecalhoCoord(
                voltar: true,
                titulo: 'Programas',
                subtitulo: 'Ciclos do Ajuda-aí e suas etapas.',
                acao: IconButton(
                  tooltip: 'Abrir novo ciclo',
                  onPressed: _novoCiclo,
                  icon: const Icon(Icons.add_circle_outline),
                  color: AppColors.primary,
                ),
              ),
              if (aviso != null)
                Container(
                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppAccents.tileLaranja,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    aviso,
                    style: const TextStyle(fontSize: 13, height: 1.35),
                  ),
                ),
              if (_carregando)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  ),
                )
              else if (_erro != null)
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
                )
              else
                for (final programa in _programas)
                  _CardPrograma(
                    programa: programa,
                    onEditar: () => _editar(programa),
                    onExcluir: () => _excluir(programa),
                    onAdministrar: widget.onProgramaSelecionado == null
                        ? null
                        : () {
                            widget.onProgramaSelecionado!(
                              programa['codigo'] as String,
                            );
                            Navigator.of(context).pop();
                          },
                  ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: OutlinedButton.icon(
                  onPressed: _novoCiclo,
                  icon: const Icon(Icons.add),
                  label: const Text('Abrir novo ciclo'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary,
                    minimumSize: const Size.fromHeight(48),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CardPrograma extends StatelessWidget {
  const _CardPrograma({
    required this.programa,
    required this.onEditar,
    required this.onExcluir,
    this.onAdministrar,
  });

  final Map<String, dynamic> programa;
  final VoidCallback onEditar;
  final VoidCallback onExcluir;
  final VoidCallback? onAdministrar;

  @override
  Widget build(BuildContext context) {
    final totais = programa['totais'] is Map
        ? Map<String, dynamic>.from(programa['totais'] as Map)
        : const <String, dynamic>{};
    final etapas = (programa['etapas'] as List? ?? const [])
        .whereType<Map>()
        .toList();
    final vigente = programa['vigente'] == true;

    Widget total(String rotulo, Object? valor) => Expanded(
      child: Column(
        children: [
          Text(
            '${valor ?? 0}',
            style: const TextStyle(
              fontFamily: 'Poppins',
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: AppColors.ink,
            ),
          ),
          Text(
            rotulo,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              color: corTextoSecundarioCoord,
            ),
          ),
        ],
      ),
    );

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: vigente ? AppColors.primary : AppAccents.cardBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${programa['titulo'] ?? programa['codigo']}',
                  style: const TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AppColors.ink,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: vigente ? AppAccents.successBg : AppColors.lavender,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${programa['statusRotulo'] ?? ''}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: vigente ? AppAccents.success : AppColors.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            [
              if (vigente) 'Ciclo vigente',
              programa['inscricoesAbertas'] == true
                  ? 'Inscrições abertas'
                  : 'Inscrições fechadas',
              programa['formularioPublicado'] == true
                  ? 'Formulário publicado'
                  : 'Formulário não publicado',
              if (programa['matchingPendente'] == true) 'Matching pendente',
            ].join(' · '),
            style: const TextStyle(
              fontSize: 12,
              color: corTextoSecundarioCoord,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Requisitos para padrinho — ${programa['codigo']}',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 4),
          if ((programa['requisitosPadrinho'] as List? ?? const []).isEmpty)
            const Text(
              'Nenhuma disciplina exigida (basta estar a partir do 2º período).',
              style: TextStyle(fontSize: 12, color: corTextoSecundarioCoord),
            )
          else
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final r
                    in (programa['requisitosPadrinho'] as List)
                        .whereType<Map>())
                  Chip(
                    label: Text(
                      '${r['descricao']}'
                      '${r['obrigatorio'] == false ? ' (desejável)' : ''}',
                    ),
                    visualDensity: VisualDensity.compact,
                    backgroundColor: AppColors.lavender,
                    side: BorderSide.none,
                  ),
              ],
            ),
          const Text(
            'A edição dos requisitos é feita no painel web (Programas).',
            style: TextStyle(fontSize: 11, color: corTextoSecundarioCoord),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              total('Candidaturas', totais['candidaturas']),
              total('Padrinhos', totais['padrinhos']),
              total('Apadrinhados', totais['apadrinhados']),
              total(
                'Grupos'
                '${programa['gruposPrevistos'] == null ? '' : ' / ${programa['gruposPrevistos']}'}',
                totais['grupos'],
              ),
            ],
          ),
          if (etapas.isNotEmpty) ...[
            const SizedBox(height: 12),
            for (final etapa in etapas)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Icon(
                      switch (etapa['estado']) {
                        'concluida' => Icons.check_circle,
                        'atual' => Icons.radio_button_checked,
                        _ => Icons.radio_button_unchecked,
                      },
                      size: 16,
                      color: etapa['estado'] == 'futura'
                          ? AppColors.muted
                          : AppColors.primary,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        '${etapa['titulo']}'
                        '${etapa['periodoTexto'] == null ? '' : ' — ${etapa['periodoTexto']}'}',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: etapa['estado'] == 'atual'
                              ? FontWeight.w700
                              : FontWeight.w400,
                          color: AppColors.ink,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (onAdministrar != null)
            TextButton.icon(
              onPressed: onAdministrar,
              icon: const Icon(Icons.dashboard_outlined),
              label: const Text('Administrar este programa'),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: PopupMenuButton<String>(
              tooltip: 'Mais ações do programa',
              onSelected: (_) => onExcluir(),
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'excluir',
                  child: Text('Excluir programa'),
                ),
              ],
            ),
          ),
          if (programa['encerrado'] != true)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onEditar,
                icon: const Icon(Icons.edit_outlined, size: 18),
                label: const Text('Editar etapa e inscrições'),
              ),
            ),
        ],
      ),
    );
  }
}

class _EditorPrograma extends StatefulWidget {
  const _EditorPrograma({required this.api, required this.programa});

  final CoordenacaoApi api;
  final Map<String, dynamic> programa;

  @override
  State<_EditorPrograma> createState() => _EditorProgramaState();
}

class _EditorProgramaState extends State<_EditorPrograma> {
  late String? _etapa = widget.programa['etapaAtual'] as String?;
  late bool _inscricoes = widget.programa['inscricoesAbertas'] == true;
  late bool _matching = widget.programa['matchingPendente'] == true;
  bool _salvando = false;

  static const _etapasPadrao = {
    'inscricoes': 'Inscrições abertas',
    'analise': 'Análise de candidaturas',
    'formacao': 'Formação dos grupos',
    'andamento': 'Programa em andamento',
    'encerramento': 'Encerramento',
  };

  Map<String, String> get _etapas {
    final lista = (widget.programa['etapas'] as List? ?? const [])
        .whereType<Map>();
    final mapa = {
      for (final etapa in lista) '${etapa['id']}': '${etapa['titulo']}',
    };
    return mapa.isEmpty ? _etapasPadrao : mapa;
  }

  Future<void> _salvar() async {
    setState(() => _salvando = true);
    try {
      await widget.api.atualizarPrograma('${widget.programa['codigo']}', {
        'etapaAtual': ?_etapa,
        'inscricoesAbertas': _inscricoes,
        'matchingPendente': _matching,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (!mounted) return;
      setState(() => _salvando = false);
      mostrarMensagemCoord(context, mensagemDeErro(erro));
    }
  }

  @override
  Widget build(BuildContext context) {
    final etapas = _etapas;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Editar ${widget.programa['titulo'] ?? widget.programa['codigo']}',
              style: const TextStyle(
                fontFamily: 'Poppins',
                fontWeight: FontWeight.w800,
                fontSize: 18,
              ),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: etapas.containsKey(_etapa) ? _etapa : null,
              decoration: const InputDecoration(
                labelText: 'Etapa atual',
                border: OutlineInputBorder(),
              ),
              items: [
                for (final MapEntry(:key, :value) in etapas.entries)
                  DropdownMenuItem(value: key, child: Text(value)),
              ],
              onChanged: (valor) => setState(() => _etapa = valor),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _inscricoes,
              activeTrackColor: AppColors.primary,
              title: const Text('Inscrições abertas'),
              onChanged: (valor) => setState(() => _inscricoes = valor),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _matching,
              activeTrackColor: AppColors.primary,
              title: const Text('Matching pendente'),
              onChanged: (valor) => setState(() => _matching = valor),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _salvando ? null : _salvar,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size.fromHeight(48),
              ),
              child: Text(_salvando ? 'Salvando...' : 'Salvar'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DialogoNovoCiclo extends StatefulWidget {
  const _DialogoNovoCiclo({
    required this.existentes,
    required this.sugestoes,
    required this.vigentePelaData,
  });

  final List<String> existentes;
  final List<String> sugestoes;
  final String vigentePelaData;

  @override
  State<_DialogoNovoCiclo> createState() => _DialogoNovoCicloState();
}

class _DialogoNovoCicloState extends State<_DialogoNovoCiclo> {
  late final _codigo = TextEditingController(
    text: widget.sugestoes.isEmpty ? '' : widget.sugestoes.first,
  );
  String? _erro;

  @override
  void dispose() {
    _codigo.dispose();
    super.dispose();
  }

  void _confirmar() {
    final codigo = _codigo.text.trim();
    if (!_padraoCodigoCiclo.hasMatch(codigo)) {
      setState(() => _erro = 'Use o formato AAAA/1 ou AAAA/2 (ex.: 2027/1).');
      return;
    }
    if (widget.existentes.contains(codigo)) {
      setState(() => _erro = 'O ciclo $codigo já existe.');
      return;
    }
    Navigator.of(context).pop(codigo);
  }

  @override
  Widget build(BuildContext context) {
    final vigenteAberto = widget.existentes.contains(widget.vigentePelaData);
    return AlertDialog(
      title: const Text('Abrir novo ciclo'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _codigo,
            maxLength: 6,
            decoration: InputDecoration(
              labelText: 'Código do ciclo',
              hintText: 'Ex.: 2027/1',
              errorText: _erro,
            ),
            onChanged: (_) => setState(() => _erro = null),
            onSubmitted: (_) => _confirmar(),
          ),
          if (widget.sugestoes.isNotEmpty)
            Wrap(
              spacing: 6,
              children: [
                for (final codigo in widget.sugestoes)
                  ActionChip(
                    label: Text(codigo),
                    onPressed: () => setState(() {
                      _codigo.text = codigo;
                      _erro = null;
                    }),
                  ),
              ],
            ),
          const SizedBox(height: 8),
          Text(
            'Pela data de hoje, o ciclo vigente é ${widget.vigentePelaData}'
            '${vigenteAberto ? ' (já aberto).' : ' — ainda não aberto: cadastros e candidaturas ficam bloqueados até ele existir.'}'
            ' O ciclo não é criado automaticamente.',
            style: const TextStyle(
              fontSize: 12,
              color: corTextoSecundarioCoord,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(onPressed: _confirmar, child: const Text('Abrir ciclo')),
      ],
    );
  }
}

class _ExcluirProgramaDialog extends StatefulWidget {
  const _ExcluirProgramaDialog({required this.api, required this.codigo});
  final CoordenacaoApi api;
  final String codigo;
  @override
  State<_ExcluirProgramaDialog> createState() => _ExcluirProgramaDialogState();
}

class _ExcluirProgramaDialogState extends State<_ExcluirProgramaDialog> {
  String _confirmacao = '';
  bool _excluindo = false;
  String? _erro;
  Future<void> _excluir() async {
    if (_excluindo || _confirmacao.trim().toUpperCase() != 'COORDENADOR') {
      return;
    }
    setState(() {
      _excluindo = true;
      _erro = null;
    });
    try {
      await widget.api.excluirPrograma(widget.codigo, _confirmacao);
      if (mounted) Navigator.pop(context, true);
    } catch (erro) {
      if (mounted) {
        setState(() {
          _excluindo = false;
          _erro = mensagemDeErro(erro);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_excluindo,
    child: AlertDialog(
      title: Text('Excluir programa ${widget.codigo}?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'A operação é permanente. Programas com candidaturas, participações, histórico, formulários ou comunicados não podem ser excluídos. Nesses casos, encerre o programa.',
            ),
            TextField(
              enabled: !_excluindo,
              decoration: const InputDecoration(
                labelText: 'Digite COORDENADOR para confirmar',
              ),
              onChanged: (valor) => setState(() => _confirmacao = valor),
            ),
            if (_erro != null)
              Text(_erro!, style: const TextStyle(color: Colors.red)),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _excluindo ? null : () => Navigator.pop(context, false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
          onPressed:
              _excluindo || _confirmacao.trim().toUpperCase() != 'COORDENADOR'
              ? null
              : _excluir,
          child: Text(_excluindo ? 'Excluindo…' : 'Excluir definitivamente'),
        ),
      ],
    ),
  );
}
