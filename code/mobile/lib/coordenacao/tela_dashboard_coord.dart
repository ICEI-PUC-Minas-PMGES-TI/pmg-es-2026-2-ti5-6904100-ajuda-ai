import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../services/api_config.dart';
import '../theme/colors.dart';
import 'componentes_coord.dart';

class TelaDashboardCoord extends StatefulWidget {
  const TelaDashboardCoord({
    super.key,
    required this.api,
    required this.programa,
    required this.onProgramaChanged,
    required this.onVerCandidaturas,
    this.onAbrirDestino,
    this.mostrarSeletor = true,
  });

  final CoordenacaoApi api;
  final bool mostrarSeletor;
  final String programa;
  final ValueChanged<String> onProgramaChanged;
  final void Function({String? status, String? publico}) onVerCandidaturas;
  final void Function(String destino, Map<String, String> query)?
  onAbrirDestino;

  @override
  State<TelaDashboardCoord> createState() => _TelaDashboardCoordState();
}

class _TelaDashboardCoordState extends State<TelaDashboardCoord> {
  Map<String, dynamic>? _dados;
  String? _erro;
  bool _carregando = true;
  int _consulta = 0;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  @override
  void didUpdateWidget(covariant TelaDashboardCoord oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.programa != widget.programa) {
      _carregar();
    }
  }

  Future<void> _carregar() async {
    final consulta = ++_consulta;
    setState(() {
      _dados = null;
      _carregando = true;
      _erro = null;
    });
    try {
      final dados = await widget.api.dashboard(widget.programa);
      if (!mounted || consulta != _consulta) return;
      final codigo = (dados['programa'] as Map?)?['codigo'] as String?;
      if (codigo == null) {
        throw const ApiException('Programa indisponível.', statusCode: 404);
      }
      if (codigo != widget.programa) {
        throw const ApiException('O dashboard retornou outro programa.');
      }
      setState(() {
        _dados = dados;
        _carregando = false;
      });
    } catch (e) {
      if (!mounted || consulta != _consulta) return;
      setState(() {
        _erro = e is ApiException && e.statusCode == 404
            ? 'O programa selecionado não está disponível. Atualize os programas e selecione outro ciclo.'
            : 'Não foi possível carregar o dashboard. Verifique sua conexão e tente novamente.';
        _carregando = false;
      });
    }
  }

  void _abrirNovoCiclo() {
    final acoes = _dados?['acoes'] as Map?;
    if (acoes?['podeAbrirNovoCiclo'] == false) return;
    final abrir = widget.onAbrirDestino;
    if (abrir == null) return;
    abrir('programas', const {'novo': '1'});
  }

  Future<void> _abrirSeletorPrograma(
    List<Map<String, dynamic>> programas,
  ) async {
    final selecionado = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        final maxH = MediaQuery.sizeOf(context).height * 0.55;
        final atual = (_dados?['programa'] as Map?)?['codigo'];
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxH),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 4, 20, 8),
                  child: Text(
                    'Selecionar programa',
                    style: TextStyle(
                      fontFamily: 'Poppins',
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                    itemCount: programas.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 4),
                    itemBuilder: (context, index) {
                      final p = programas[index];
                      final codigo = '${p['codigo'] ?? ''}';
                      final ativo = codigo == atual;
                      final status =
                          '${p['statusRotulo'] ?? p['etapaAtual'] ?? ''}';
                      final vigente = p['vigente'] == true;
                      final encerrado = p['encerrado'] == true;
                      return Material(
                        color: ativo
                            ? const Color(0xFFEBE4FF)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        child: ListTile(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          title: Text(
                            '${p['nome'] ?? p['titulo'] ?? 'Programa $codigo'}',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: ativo ? AppColors.primary : AppColors.ink,
                            ),
                          ),
                          subtitle: Text(
                            [
                              status,
                              if (vigente) 'vigente',
                              if (encerrado) 'encerrado',
                            ].join(' · '),
                            style: const TextStyle(
                              color: Color(0xFF5C5678),
                              fontSize: 12,
                            ),
                          ),
                          trailing: ativo
                              ? const Icon(
                                  Icons.check,
                                  color: AppColors.primary,
                                )
                              : const Icon(
                                  Icons.chevron_right,
                                  color: AppColors.muted,
                                ),
                          onTap: () => Navigator.pop(context, codigo),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (selecionado != null && selecionado.isNotEmpty) {
      widget.onProgramaChanged(selecionado);
    }
  }

  void _abrirAtencao(Map<String, dynamic> item) {
    final destino = '${item['destino'] ?? 'candidaturas'}';
    final query = Map<String, String>.from(
      (item['query'] as Map?)?.map((k, v) => MapEntry('$k', '$v')) ?? {},
    );
    if (destino == 'candidaturas') {
      widget.onVerCandidaturas(status: query['status']);
      return;
    }
    widget.onAbrirDestino?.call(destino, query);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _carregar,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _cabecalho()),
            if (_carregando && _dados == null)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (_erro != null && _dados == null)
              SliverFillRemaining(hasScrollBody: false, child: _estadoErro())
            else if (_dados?['vazio'] == true || _dados?['programa'] == null)
              SliverFillRemaining(hasScrollBody: false, child: _estadoVazio())
            else
              ..._conteudo(),
          ],
        ),
      ),
    );
  }

  Widget _cabecalho() {
    final programa = _dados?['programa'] as Map?;
    final programas = (_dados?['programas'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final nome = programa == null
        ? 'Programa'
        : '${programa['nome'] ?? programa['titulo'] ?? 'Programa ${programa['codigo']}'}';
    final status = programa == null
        ? ''
        : '${programa['statusRotulo'] ?? ''}${programa['vigente'] == true ? ' · vigente' : ''}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                color: AppColors.primary,
              ),
              const Expanded(
                child: Text(
                  'Coordenação',
                  style: TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 22,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          if (widget.mostrarSeletor && programa != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 0, 0),
              child: Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: programas.isEmpty
                      ? null
                      : () => _abrirSeletorPrograma(programas),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppAccents.cardBorder),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.calendar_month_outlined,
                          size: 18,
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                nome,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: AppColors.ink,
                                ),
                              ),
                              if (status.isNotEmpty)
                                Text(
                                  status,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF5C5678),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const Icon(Icons.expand_more, color: AppColors.primary),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          const Padding(
            padding: EdgeInsets.fromLTRB(8, 8, 8, 0),
            child: Text(
              'Acompanhe candidaturas a padrinho e indicadores do semestre.',
              style: TextStyle(color: Color(0xFF5C5678), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _estadoErro() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(_erro!, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _carregar,
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  Widget _estadoVazio() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('Nenhum programa cadastrado no momento.'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _abrirNovoCiclo,
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            child: const Text('Abrir novo ciclo'),
          ),
        ],
      ),
    );
  }

  List<Widget> _conteudo() {
    final ind = Map<String, dynamic>.from(
      _dados!['indicadores'] as Map? ?? const {},
    );
    final chart = Map<String, dynamic>.from(
      _dados!['candidaturasVisaoGeral'] as Map? ?? const {},
    );
    final recentes = (_dados!['candidaturasRecentes'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final etapas = (_dados!['etapas'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final atencao = (_dados!['pontosAtencao'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final acoes = Map<String, dynamic>.from(_dados!['acoes'] as Map? ?? {});
    final resumo = Map<String, dynamic>.from(_dados!['resumo'] as Map? ?? {});

    final pendentes = ind['candidaturasPendentes'] as Map? ?? {};
    final padrinhos = ind['padrinhosAprovados'] as Map? ?? {};
    final apadrinhados = ind['apadrinhadosAtivos'] as Map? ?? {};
    final grupos = ind['gruposFormados'] as Map? ?? {};

    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        sliver: SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            // Altura acompanha a fonte do sistema; proporção fixa estourava em telas estreitas.
            mainAxisExtent: MediaQuery.textScalerOf(context).scale(60) + 24,
          ),
          delegate: SliverChildListDelegate([
            _Kpi(
              titulo: 'Candidaturas pendentes',
              valor: '${pendentes['valor'] ?? 0}',
              contexto:
                  '${pendentes['detalhe'] ?? '${pendentes['valor'] ?? 0} de ${pendentes['total'] ?? 0}'}',
              icon: Icons.assignment_outlined,
              cor: AppColors.primary,
              onTap: () => widget.onVerCandidaturas(status: 'aguardando'),
            ),
            _Kpi(
              titulo: 'Padrinhos aprovados',
              valor: '${padrinhos['valor'] ?? 0}',
              contexto:
                  '${padrinhos['detalhe'] ?? '${padrinhos['valor'] ?? 0} de ${padrinhos['total'] ?? 0}'}',
              icon: Icons.check_circle_outline,
              cor: AppAccents.success,
              onTap: () => widget.onVerCandidaturas(status: 'aprovadas'),
            ),
            _Kpi(
              titulo: 'Apadrinhados ativos',
              valor: '${apadrinhados['valor'] ?? 0}',
              contexto:
                  '${apadrinhados['detalhe'] ?? '${apadrinhados['valor'] ?? 0} de ${apadrinhados['total'] ?? 0} vagas'}',
              icon: Icons.person_outline,
              cor: AppAccents.iconeAzul,
              onTap: () => widget.onAbrirDestino?.call('usuarios', const {}),
            ),
            _Kpi(
              titulo: 'Grupos formados',
              valor: '${grupos['valor'] ?? 0}',
              contexto:
                  '${grupos['detalhe'] ?? '${grupos['valor'] ?? 0} de ${grupos['total'] ?? 0} previstos'}',
              icon: Icons.groups_outlined,
              cor: AppAccents.iconeLaranja,
              onTap: () => widget.onAbrirDestino?.call('programas', {
                'pendencia': 'grupos',
              }),
            ),
          ]),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _card(
            title: '${chart['titulo'] ?? 'Visão geral das candidaturas'}',
            subtitle:
                '${chart['descricao'] ?? 'Candidaturas a padrinho por status'}'
                '${chart['total'] != null ? ' · total ${chart['total']}' : ''}',
            trailing: TextButton(
              onPressed: () => widget.onVerCandidaturas(),
              child: const Text('Ver todas'),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Barras(chart: chart),
                const SizedBox(height: 8),
                Text(
                  'Pendentes no card = novas + em análise '
                  '(${(chart['pendentes'] as num?)?.toInt() ?? 0} + '
                  '${(chart['emAnalise'] as num?)?.toInt() ?? 0}).',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF5C5678),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _card(
            title: 'Ações rápidas',
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _AcaoRapida(
                        label: 'Candidaturas',
                        icon: Icons.visibility_outlined,
                        onTap: () => widget.onVerCandidaturas(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _AcaoRapida(
                        label: 'Novo ciclo',
                        icon: Icons.add,
                        enabled: acoes['podeAbrirNovoCiclo'] != false,
                        onTap: _abrirNovoCiclo,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _AcaoRapida(
                  label: 'Formulários',
                  icon: Icons.dynamic_form_outlined,
                  onTap: () =>
                      widget.onAbrirDestino?.call('formularios', const {}),
                ),
                if (resumo['encerrado'] == true) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'Ciclo encerrado — algumas ações ficam indisponíveis.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF5C5678)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _card(
            title: 'Candidaturas recentes',
            child: recentes.isEmpty
                ? const Text(
                    'Nenhuma candidatura a padrinho neste ciclo.',
                    style: TextStyle(color: Color(0xFF5C5678)),
                  )
                : Column(
                    children: recentes
                        .map(
                          (item) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            leading: AvatarCoord(item: item, raio: 18),
                            title: Text(
                              '${item['nome'] ?? ''}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                              ),
                            ),
                            subtitle: Text(
                              '${item['curso'] ?? ''}'
                              '${item['periodo'] != null ? ' · ${item['periodo']}º período' : ''}',
                              style: const TextStyle(
                                fontSize: 11,
                                color: Color(0xFF5C5678),
                              ),
                            ),
                            trailing: _statusPill(
                              '${item['statusRotulo'] ?? item['status'] ?? ''}',
                            ),
                          ),
                        )
                        .toList(),
                  ),
          ),
        ),
      ),
      if (etapas.isNotEmpty)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _card(
              title: 'Etapas do semestre',
              child: Column(
                children: etapas.map((e) {
                  final atual = e['estado'] == 'atual';
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: Icon(
                      e['estado'] == 'concluida'
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      color: atual ? AppColors.primary : AppColors.muted,
                      size: 20,
                    ),
                    title: Text(
                      '${e['titulo'] ?? ''}${atual ? ' · atual' : ''}',
                      style: TextStyle(
                        fontWeight: atual ? FontWeight.w700 : FontWeight.w500,
                        fontSize: 13,
                      ),
                    ),
                    subtitle: Text(
                      '${e['periodoTexto'] ?? ''}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF5C5678),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          child: _card(
            title: 'Pontos de atenção',
            child: _erro != null && atencao.isEmpty
                ? Column(
                    children: [
                      Text(
                        _erro!,
                        style: const TextStyle(color: Color(0xFFB42318)),
                      ),
                      TextButton(
                        onPressed: _carregar,
                        child: const Text('Tentar novamente'),
                      ),
                    ],
                  )
                : atencao.isEmpty
                ? const _AtencaoVazia()
                : Column(
                    children: atencao
                        .map(
                          (p) => Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(10),
                              onTap: () => _abrirAtencao(p),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                ),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 34,
                                      height: 34,
                                      decoration: BoxDecoration(
                                        color: p['severidade'] == 'alta'
                                            ? const Color(0xFFFFE8E8)
                                            : const Color(0xFFFFF4E5),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Icon(
                                        _iconeAtencao(
                                          '${p['icon'] ?? 'alert'}',
                                        ),
                                        size: 18,
                                        color: p['severidade'] == 'alta'
                                            ? const Color(0xFFB42318)
                                            : AppAccents.iconeLaranja,
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            '${p['titulo'] ?? p['texto'] ?? ''}',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 13,
                                              color: AppColors.ink,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            '${p['descricao'] ?? p['texto'] ?? ''}',
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: Color(0xFF5C5678),
                                              height: 1.35,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const Icon(
                                      Icons.chevron_right,
                                      color: AppColors.muted,
                                      size: 18,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
          ),
        ),
      ),
    ];
  }

  IconData _iconeAtencao(String nome) {
    return switch (nome) {
      'clipboard' => Icons.assignment_outlined,
      'users' => Icons.people_outline,
      'groups' => Icons.groups_outlined,
      'clock' => Icons.schedule,
      _ => Icons.warning_amber_rounded,
    };
  }

  Widget _card({
    required String title,
    required Widget child,
    Widget? trailing,
    String? subtitle,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontFamily: 'Poppins',
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                        color: AppColors.ink,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF5C5678),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }

  Widget _statusPill(String texto) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        texto,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

class _AtencaoVazia extends StatelessWidget {
  const _AtencaoVazia();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppAccents.successBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_circle, color: AppAccents.success),
          SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Nenhuma pendência no momento',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Os indicadores deste programa estão em dia.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF5C5678)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AcaoRapida extends StatelessWidget {
  const _AcaoRapida({
    required this.label,
    required this.icon,
    required this.onTap,
    this.enabled = true,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.lavender,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: SizedBox(
            height: 64,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Icon(icon, color: AppColors.primary, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.titulo,
    required this.valor,
    required this.contexto,
    required this.icon,
    required this.cor,
    this.onTap,
  });

  final String titulo;
  final String valor;
  final String contexto;
  final IconData icon;
  final Color cor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppAccents.cardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: cor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(icon, size: 15, color: cor),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      titulo,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF5C5678),
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        height: 1.15,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.chevron_right,
                    size: 15,
                    color: Colors.grey.shade400,
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                valor,
                style: TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                  height: 1.0,
                  color: cor,
                ),
              ),
              Text(
                contexto,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xFF5C5678),
                  fontSize: 10,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Barras extends StatelessWidget {
  const _Barras({required this.chart});

  final Map<String, dynamic> chart;

  @override
  Widget build(BuildContext context) {
    final itens = [
      ('Novas', (chart['pendentes'] as num?)?.toInt() ?? 0, AppColors.primary),
      (
        'Análise',
        (chart['emAnalise'] as num?)?.toInt() ?? 0,
        const Color(0xFF9B7ED9),
      ),
      (
        'Aprovadas',
        (chart['aprovadas'] as num?)?.toInt() ?? 0,
        AppAccents.success,
      ),
      (
        'Rejeitadas',
        (chart['rejeitadas'] as num?)?.toInt() ?? 0,
        const Color(0xFFE11D48),
      ),
    ];
    final max = itens.map((e) => e.$2).fold<int>(1, (a, b) => a > b ? a : b);
    const chartHeight = 100.0;

    // Sem altura fixa: rótulos maiores (fonte do sistema) não estouram.
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final item in itens)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${item.$2}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    height: chartHeight,
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Container(
                        height: item.$2 == 0
                            ? 0
                            : chartHeight * (item.$2 / max).clamp(0.12, 1.0),
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: item.$3,
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      item.$1,
                      maxLines: 1,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF5C5678),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
