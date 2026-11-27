import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';
import 'configurar_programa.dart';
import 'painel_coord.dart';

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
    this.programa,
    this.pendencia,
    this.iniciarNovo = false,
    this.onProgramaCriado,
    this.onProgramaSelecionado,
    this.onAbrirMatching,
    this.onProgramaExcluido,
  });

  final CoordenacaoApi api;
  final String? programa;

  /// `grupos` | `prazo` — vindo dos pontos de atenção do dashboard.
  final String? pendencia;

  /// Abre o fluxo de novo ciclo assim que a lista carrega.
  final bool iniciarNovo;
  final ValueChanged<String>? onProgramaCriado;
  final ValueChanged<String>? onProgramaSelecionado;
  final ValueChanged<String>? onAbrirMatching;
  final ValueChanged<String>? onProgramaExcluido;

  @override
  State<TelaProgramasCoord> createState() => _TelaProgramasCoordState();
}

class _TelaProgramasCoordState extends State<TelaProgramasCoord> {
  List<Map<String, dynamic>> _programas = const [];
  bool _carregando = true;
  String? _erro;
  String? _codigoSelecionado;
  String _busca = '';
  String _filtro = 'todos';
  final Set<String> _acoesEmAndamento = {};

  bool _novoAgendado = false;

  @override
  void initState() {
    super.initState();
    _carregar().then((_) {
      if (!mounted || !widget.iniciarNovo || _novoAgendado) return;
      _novoAgendado = true;
      _novoCiclo();
    });
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
        if (!lista.any((p) => p['codigo'] == _codigoSelecionado)) {
          final preferidos = lista.where((p) => p['codigo'] == widget.programa);
          final vigentes = lista.where((p) => p['vigente'] == true);
          _codigoSelecionado = preferidos.isNotEmpty
              ? '${preferidos.first['codigo']}'
              : vigentes.isNotEmpty
              ? '${vigentes.first['codigo']}'
              : lista.isEmpty
              ? null
              : '${lista.first['codigo']}';
        }
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
    final anterior = _programas.cast<Map<String, dynamic>?>().firstWhere(
      (p) => (p?['requisitosPadrinho'] as List?)?.isNotEmpty == true,
      orElse: () => null,
    );
    final requisitos = ((anterior?['requisitosPadrinho'] as List?) ?? const [])
        .whereType<Map>()
        .map((r) => Map<String, dynamic>.from(r))
        .toList();
    final salvo = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => ConfigurarPrograma(
        api: widget.api,
        novo: true,
        programa: {
          'codigo': escolhido,
          'etapaAtual': 'inscricoes',
          'datas': sugestaoCronograma(escolhido),
          'requisitosPadrinho': requisitos,
          'vagasApadrinhados': 80,
          'gruposPrevistos': 25,
        },
      ),
    );
    if (salvo == null || !mounted) return;
    final codigo = '${salvo['codigo'] ?? escolhido}';
    setState(() => _codigoSelecionado = codigo);
    mostrarMensagemCoord(context, 'Ciclo $codigo aberto.');
    widget.onProgramaCriado?.call(codigo);
    await _carregar();
  }

  Future<void> _editar(Map<String, dynamic> programa) async {
    final salvo = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => ConfigurarPrograma(api: widget.api, programa: programa),
    );
    if (salvo != null && mounted) {
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

  Future<void> _encerrarInscricoes(Map<String, dynamic> programa) async {
    final codigo = '${programa['codigo']}';
    if (_acoesEmAndamento.contains(codigo)) return;
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Encerrar inscrições?',
      mensagem:
          'As inscrições do programa $codigo serão encerradas. '
          'Nenhuma candidatura será aprovada nem vinculada por esta ação.',
      confirmar: 'Encerrar inscrições',
      destrutiva: true,
    );
    if (!confirmou || !mounted) return;
    setState(() => _acoesEmAndamento.add(codigo));
    try {
      await widget.api.encerrarInscricoes(codigo);
      if (!mounted) return;
      mostrarMensagemCoord(
        context,
        'Inscrições encerradas. As candidaturas continuam sem decisão.',
      );
      await _carregar();
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _acoesEmAndamento.remove(codigo));
    }
  }

  Future<void> _liberarMatching(Map<String, dynamic> programa) async {
    final codigo = '${programa['codigo']}';
    if (_acoesEmAndamento.contains(codigo)) return;
    final confirmou = await confirmarAcaoCoord(
      context,
      titulo: 'Liberar matching?',
      mensagem:
          'É necessário encerrar as inscrições, decidir todas as candidaturas '
          'e ter ao menos um padrinho aprovado. A liberação não cria grupos '
          'nem define vínculos automaticamente.',
      confirmar: 'Liberar matching',
    );
    if (!confirmou || !mounted) return;
    setState(() => _acoesEmAndamento.add(codigo));
    try {
      await widget.api.liberarMatching(codigo);
      if (!mounted) return;
      mostrarMensagemCoord(context, 'Matching liberado para $codigo.');
      await _carregar();
    } catch (erro) {
      if (mounted) mostrarMensagemCoord(context, mensagemDeErro(erro));
    } finally {
      if (mounted) setState(() => _acoesEmAndamento.remove(codigo));
    }
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
                subtitulo: 'Ciclos do programa de apadrinhamento, etapas, vagas e calendário.',
                acao: IconButton(
                  tooltip: 'Atualizar programas',
                  onPressed: _carregar,
                  icon: const Icon(Icons.refresh),
                  color: AppColors.primary,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.icon(
                    onPressed: _novoCiclo,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                    ),
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Abrir novo ciclo'),
                  ),
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
              else if (_programas.isEmpty)
                const CartaoPainelCoord(
                  child: Text(
                    'Nenhum programa cadastrado. Abra o primeiro ciclo.',
                  ),
                )
              else
                _painelProgramas(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _painelProgramas() {
    final lista = [..._programas]
      ..sort((a, b) => '${b['codigo']}'.compareTo('${a['codigo']}'));
    final filtrados = lista.where((p) {
      final encerrado =
          p['encerrado'] == true || p['etapaAtual'] == 'encerramento';
      return (_filtro == 'todos' ||
              (_filtro == 'encerrados' ? encerrado : !encerrado)) &&
          '${p['codigo']} ${p['nome'] ?? p['titulo'] ?? ''}'
              .toLowerCase()
              .contains(_busca.trim().toLowerCase());
    }).toList();
    final selecionados = lista.where((p) => p['codigo'] == _codigoSelecionado);
    final programa = selecionados.isEmpty ? lista.first : selecionados.first;
    final navegador = CartaoPainelCoord(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TituloPainelCoord(titulo: 'Ciclos do programa (${lista.length})'),
          TextField(
            decoration: const InputDecoration(
              labelText: 'Buscar ciclo',
              hintText: 'Buscar por semestre…',
              prefixIcon: Icon(Icons.search, color: AppColors.primary),
              border: OutlineInputBorder(),
            ),
            onChanged: (valor) => setState(() => _busca = valor),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final item in [
                ('todos', 'Todos'),
                ('ativos', 'Ativos'),
                ('encerrados', 'Encerrados'),
              ])
                ChoiceChip(
                  label: Text(item.$2),
                  selected: _filtro == item.$1,
                  showCheckmark: false,
                  selectedColor: const Color(0xFFEDE5FA),
                  labelStyle: TextStyle(
                    color: _filtro == item.$1
                        ? AppColors.primary
                        : corTextoSecundarioCoord,
                  ),
                  onSelected: (_) => setState(() => _filtro = item.$1),
                ),
            ],
          ),
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 300),
            child: SingleChildScrollView(
              child: Column(
                children: [
                  for (final p in filtrados)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Material(
                        color: p['codigo'] == programa['codigo']
                            ? const Color(0xFFEDE5FA)
                            : Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: BorderSide(
                            color: p['codigo'] == programa['codigo']
                                ? const Color(0xFFB69BDE)
                                : Colors.transparent,
                          ),
                        ),
                        child: ListTile(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          leading: const Icon(
                            Icons.calendar_month_outlined,
                            color: AppColors.primary,
                          ),
                          title: Text(
                            '${p['codigo']}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                          subtitle: Text(
                            '${p['statusRotulo'] ?? ''}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: corTextoSecundarioCoord,
                            ),
                          ),
                          trailing: p['vigente'] == true
                              ? const SeloPainelCoord('Vigente', verde: true)
                              : const Icon(
                                  Icons.chevron_right,
                                  color: AppColors.primary,
                                ),
                          selected: p['codigo'] == programa['codigo'],
                          onTap: () => setState(
                            () => _codigoSelecionado = '${p['codigo']}',
                          ),
                        ),
                      ),
                    ),
                  if (filtrados.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(20),
                      child: Text(
                        'Nenhum ciclo encontrado. Tente outro semestre ou filtro.',
                        style: TextStyle(color: corTextoSecundarioCoord),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
    final detalhe = _CardPrograma(
      programa: programa,
      onEditar: () => _editar(programa),
      onExcluir: () => _excluir(programa),
      onEncerrar: programa['podeEncerrarInscricoes'] == true
          ? () => _encerrarInscricoes(programa)
          : null,
      onLiberar: programa['podeLiberarMatching'] == true
          ? () => _liberarMatching(programa)
          : null,
      ocupado: _acoesEmAndamento.contains('${programa['codigo']}'),
      onMatching: widget.onAbrirMatching == null
          ? null
          : () => widget.onAbrirMatching!('${programa['codigo']}'),
      onAdministrar: widget.onProgramaSelecionado == null
          ? null
          : () {
              widget.onProgramaSelecionado!('${programa['codigo']}');
              Navigator.of(context).pop();
            },
    );
    return LayoutBuilder(
      builder: (context, constraints) => constraints.maxWidth >= 1000
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 320, child: navegador),
                Expanded(child: detalhe),
              ],
            )
          : Column(children: [navegador, detalhe]),
    );
  }
}

class _CardPrograma extends StatelessWidget {
  const _CardPrograma({
    required this.programa,
    required this.onEditar,
    required this.onExcluir,
    required this.ocupado,
    this.onEncerrar,
    this.onLiberar,
    this.onMatching,
    this.onAdministrar,
  });

  final Map<String, dynamic> programa;
  final VoidCallback onEditar;
  final VoidCallback onExcluir;
  final bool ocupado;
  final VoidCallback? onEncerrar;
  final VoidCallback? onLiberar;
  final VoidCallback? onMatching;
  final VoidCallback? onAdministrar;

  @override
  Widget build(BuildContext context) {
    final totais = programa['totais'] is Map
        ? Map<String, dynamic>.from(programa['totais'] as Map)
        : <String, dynamic>{};
    final etapas = (programa['etapas'] as List? ?? [])
        .whereType<Map>()
        .toList();
    final requisitos = (programa['requisitosPadrinho'] as List? ?? [])
        .whereType<Map>()
        .toList();
    final atual = etapas.indexWhere((e) => e['estado'] == 'atual');
    return CartaoPainelCoord(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.calendar_month_outlined,
                size: 29,
                color: AppColors.primary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${programa['nome'] ?? programa['titulo'] ?? 'Programa ${programa['codigo']}'}',
                      style: const TextStyle(
                        fontFamily: 'Poppins',
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        SeloPainelCoord(
                          '${programa['statusRotulo'] ?? 'Em planejamento'}',
                        ),
                        if (programa['vigente'] == true)
                          const SeloPainelCoord('Ciclo vigente', verde: true),
                      ],
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Mais ações do programa',
                onSelected: (_) => onExcluir(),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                    value: 'excluir',
                    child: Text('Excluir programa'),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: ocupado ? null : onEditar,
                icon: const Icon(Icons.tune, size: 17),
                label: const Text('Configurar'),
              ),
              if (onAdministrar != null)
                FilledButton.icon(
                  onPressed: ocupado ? null : onAdministrar,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.arrow_forward, size: 17),
                  label: const Text('Administrar'),
                ),
            ],
          ),
          const SizedBox(height: 20),
          IndicadoresPainelCoord(
            itens: [
              IndicadorPainelCoord(
                'Candidaturas',
                '${totais['candidaturas'] ?? 0}',
                'Recebidas neste ciclo',
                Icons.assignment_outlined,
              ),
              IndicadorPainelCoord(
                'Padrinhos',
                '${totais['padrinhos'] ?? 0}',
                'Participantes do programa',
                Icons.person_outline,
              ),
              IndicadorPainelCoord(
                'Apadrinhados',
                '${totais['apadrinhados'] ?? 0}',
                '${programa['vagasApadrinhados'] ?? 0} vagas no ciclo',
                Icons.groups_outlined,
              ),
              IndicadorPainelCoord(
                'Grupos formados',
                '${totais['grupos'] ?? 0}',
                '${programa['gruposPrevistos'] ?? 0} grupos previstos',
                Icons.link,
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 22),
            child: Divider(height: 1),
          ),
          const TituloPainelCoord(
            titulo: 'Etapas do programa',
            descricao: 'Do início das inscrições ao encerramento do ciclo.',
          ),
          if (atual >= 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: SeloPainelCoord('Etapa ${atual + 1} de ${etapas.length}'),
            ),
          for (var i = 0; i < etapas.length; i++)
            _EtapaPrograma(
              etapa: etapas[i],
              indice: i,
              ultima: i == etapas.length - 1,
            ),
          if (etapas.isEmpty)
            const Text(
              'O calendário deste ciclo ainda não foi definido.',
              style: TextStyle(color: corTextoSecundarioCoord, fontSize: 12),
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Divider(height: 1),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                programa['inscricoesAbertas'] == true
                    ? Icons.assignment_outlined
                    : Icons.check_circle_outline,
                color: AppColors.primary,
                size: 21,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      programa['inscricoesAbertas'] == true
                          ? 'Inscrições abertas'
                          : 'Inscrições encerradas',
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      programa['inscricoesAbertas'] == true
                          ? 'O ciclo está recebendo novas candidaturas.'
                          : programa['matchingLiberado'] == true
                          ? 'Matching liberado para a formação dos pares.'
                          : 'Consulte as candidaturas e acompanhe as próximas etapas.',
                      style: const TextStyle(
                        fontSize: 12,
                        color: corTextoSecundarioCoord,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (onEncerrar != null ||
              onLiberar != null ||
              (programa['matchingLiberado'] == true && onMatching != null))
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (onEncerrar != null)
                    OutlinedButton.icon(
                      onPressed: ocupado ? null : onEncerrar,
                      icon: const Icon(Icons.lock_outline, size: 17),
                      label: Text(
                        ocupado ? 'Processando…' : 'Encerrar inscrições',
                      ),
                    ),
                  if (onLiberar != null)
                    FilledButton.icon(
                      onPressed: ocupado ? null : onLiberar,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                      ),
                      icon: const Icon(Icons.auto_awesome, size: 17),
                      label: Text(
                        ocupado ? 'Processando…' : 'Liberar matching',
                      ),
                    ),
                  if (programa['matchingLiberado'] == true &&
                      onMatching != null)
                    OutlinedButton.icon(
                      onPressed: onMatching,
                      icon: const Icon(Icons.auto_awesome_outlined, size: 17),
                      label: const Text('Abrir matching'),
                    ),
                ],
              ),
            ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Divider(height: 1),
          ),
          const TituloPainelCoord(
            titulo: 'Requisitos para padrinho',
            descricao: 'Condições de participação neste ciclo.',
          ),
          if (programa['formularioPublicado'] == true)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: SeloPainelCoord('Formulário publicado'),
            ),
          if (requisitos.isEmpty)
            const Text(
              'Nenhuma disciplina exigida. Basta estar a partir do 2º período.',
              style: TextStyle(
                fontSize: 12,
                height: 1.5,
                color: corTextoSecundarioCoord,
              ),
            ),
          for (final r in requisitos)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.check, size: 17, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${r['descricao']}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.ink,
                          ),
                        ),
                        Text(
                          r['obrigatorio'] == false
                              ? 'Desejável'
                              : 'Obrigatório',
                          style: const TextStyle(
                            fontSize: 11,
                            color: corTextoSecundarioCoord,
                          ),
                        ),
                      ],
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

class _EtapaPrograma extends StatelessWidget {
  const _EtapaPrograma({
    required this.etapa,
    required this.indice,
    required this.ultima,
  });
  final Map etapa;
  final int indice;
  final bool ultima;
  @override
  Widget build(BuildContext context) {
    final atual = etapa['estado'] == 'atual';
    final concluida = etapa['estado'] == 'concluida';
    final cor = concluida ? const Color(0xFF176C4B) : AppColors.primary;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 30,
            child: Column(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: atual || concluida ? cor : Colors.white,
                    border: Border.all(color: cor.withValues(alpha: 0.5)),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: concluida
                      ? const Icon(Icons.check, color: Colors.white, size: 15)
                      : Text(
                          '${indice + 1}',
                          style: TextStyle(
                            color: atual ? Colors.white : AppColors.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
                if (!ultima)
                  Expanded(
                    child: Container(width: 2, color: const Color(0xFFE4DFF0)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: ultima ? 0 : 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${etapa['titulo']}',
                    style: TextStyle(
                      color: atual ? AppColors.primary : AppColors.ink,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${etapa['periodoTexto'] ?? ''}',
                    style: const TextStyle(
                      color: corTextoSecundarioCoord,
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    atual
                        ? 'Etapa atual'
                        : concluida
                        ? 'Concluída'
                        : 'Prevista',
                    style: TextStyle(
                      color: cor,
                      fontSize: 11,
                      fontWeight: atual ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
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
        FilledButton(
          onPressed: _confirmar,
          child: const Text('Revisar cronograma'),
        ),
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
    if (_excluindo || _confirmacao != 'COORDENADOR') return;
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
          onPressed: _excluindo || _confirmacao != 'COORDENADOR'
              ? null
              : _excluir,
          child: Text(_excluindo ? 'Excluindo…' : 'Excluir definitivamente'),
        ),
      ],
    ),
  );
}
