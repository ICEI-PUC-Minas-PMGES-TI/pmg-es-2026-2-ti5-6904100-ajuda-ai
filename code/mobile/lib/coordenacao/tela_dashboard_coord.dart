import 'package:flutter/material.dart';

import '../services/coordenacao_api.dart';
import '../theme/colors.dart';

class TelaDashboardCoord extends StatefulWidget {
  const TelaDashboardCoord({
    super.key,
    required this.api,
    required this.programa,
    required this.onProgramaChanged,
    required this.onVerCandidaturas,
  });

  final CoordenacaoApi api;
  final String? programa;
  final ValueChanged<String> onProgramaChanged;
  final void Function({String? status}) onVerCandidaturas;

  @override
  State<TelaDashboardCoord> createState() => _TelaDashboardCoordState();
}

class _TelaDashboardCoordState extends State<TelaDashboardCoord> {
  Map<String, dynamic>? _dados;
  String? _erro;
  bool _carregando = true;

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
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final dados = await widget.api.dashboard(widget.programa);
      if (!mounted) return;
      final codigo = (dados['programa'] as Map?)?['codigo'] as String?;
      if (codigo != null && codigo != widget.programa) {
        widget.onProgramaChanged(codigo);
      }
      setState(() {
        _dados = dados;
        _carregando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _erro = e.toString().replaceFirst('Exception: ', '');
        _carregando = false;
      });
    }
  }

  Future<void> _abrirNovoCiclo() async {
    try {
      final criado = await widget.api.criarPrograma();
      final codigo = criado['codigo'] as String?;
      if (codigo != null) widget.onProgramaChanged(codigo);
      await _carregar();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
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
                child: Center(child: CircularProgressIndicator(color: AppColors.primary)),
              )
            else if (_erro != null && _dados == null)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _estadoErro(),
              )
            else if (_dados?['vazio'] == true || _dados?['programa'] == null)
              sliverFill(_estadoVazio())
            else
              ..._conteudo(),
          ],
        ),
      ),
    );
  }

  Widget sliverFill(Widget child) => SliverFillRemaining(
        hasScrollBody: false,
        child: child,
      );

  Widget _cabecalho() {
    final programa = (_dados?['programa'] as Map?)?['codigo'] as String?;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
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
              if (programa != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEBE4FF),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Programa $programa',
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.only(left: 12, top: 4),
            child: Text(
              'Acompanhe candidaturas e indicadores do semestre.',
              style: TextStyle(color: AppColors.muted, fontSize: 13),
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
    final ind = Map<String, dynamic>.from(_dados!['indicadores'] as Map);
    final chart = Map<String, dynamic>.from(_dados!['candidaturasVisaoGeral'] as Map);
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

    final pendentes = ind['candidaturasPendentes'] as Map? ?? {};
    final padrinhos = ind['padrinhosAprovados'] as Map? ?? {};
    final apadrinhados = ind['apadrinhadosAtivos'] as Map? ?? {};
    final grupos = ind['gruposFormados'] as Map? ?? {};

    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        sliver: SliverGrid.count(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: [
            _Kpi(
              titulo: 'Pendentes',
              valor: '${pendentes['valor'] ?? 0}',
              contexto: 'de ${pendentes['total'] ?? 0} inscritas',
              cor: AppColors.primary,
              onTap: () => widget.onVerCandidaturas(status: 'pendente'),
            ),
            _Kpi(
              titulo: 'Padrinhos',
              valor: '${padrinhos['valor'] ?? 0}',
              contexto: 'de ${padrinhos['total'] ?? 0} candidaturas',
              cor: AppAccents.success,
              onTap: () => widget.onVerCandidaturas(status: 'aprovadas'),
            ),
            _Kpi(
              titulo: 'Apadrinhados',
              valor: '${apadrinhados['valor'] ?? 0}',
              contexto: 'de ${apadrinhados['total'] ?? 0} vagas',
              cor: AppAccents.iconeAzul,
            ),
            _Kpi(
              titulo: 'Grupos',
              valor: '${grupos['valor'] ?? 0}',
              contexto: 'de ${grupos['total'] ?? 0} previstos',
              cor: AppAccents.iconeLaranja,
            ),
          ],
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: _card(
            title: 'Visão geral',
            trailing: TextButton(
              onPressed: () => widget.onVerCandidaturas(),
              child: const Text('Ver todas'),
            ),
            child: _Barras(chart: chart),
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _card(
            title: 'Ações rápidas',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _acao('Candidaturas', Icons.visibility_outlined, () => widget.onVerCandidaturas()),
                _acao('Novo ciclo', Icons.add, _abrirNovoCiclo),
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
                    'Nenhuma candidatura neste ciclo.',
                    style: TextStyle(color: AppColors.muted),
                  )
                : Column(
                    children: recentes
                        .map(
                          (item) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              backgroundColor: const Color(0xFFEBE4FF),
                              foregroundColor: AppColors.primary,
                              child: Text(
                                '${item['iniciais'] ?? '?'}',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                              ),
                            ),
                            title: Text(
                              '${item['nome'] ?? ''}',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                            ),
                            subtitle: Text(
                              '${item['curso'] ?? ''}'
                              '${item['periodo'] != null ? ' · ${item['periodo']}º período' : ''}',
                              style: const TextStyle(fontSize: 12),
                            ),
                            trailing: _statusPill('${item['statusRotulo'] ?? item['status'] ?? ''}'),
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
                    subtitle: Text('${e['periodoTexto'] ?? ''}', style: const TextStyle(fontSize: 12)),
                  );
                }).toList(),
              ),
            ),
          ),
        ),
      if (atencao.isNotEmpty)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: _card(
              title: 'Pontos de atenção',
              child: Column(
                children: atencao
                    .map(
                      (p) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: const Icon(Icons.warning_amber_rounded, color: AppAccents.iconeLaranja),
                        title: Text('${p['titulo'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        subtitle: Text('${p['descricao'] ?? ''}', style: const TextStyle(fontSize: 12)),
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
        )
      else
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
    ];
  }

  Widget _card({required String title, required Widget child, Widget? trailing}) {
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
                child: Text(
                  title,
                  style: const TextStyle(
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AppColors.ink,
                  ),
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

  Widget _acao(String label, IconData icon, VoidCallback onTap) {
    return ActionChip(
      avatar: Icon(icon, size: 18, color: AppColors.primary),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      onPressed: onTap,
      backgroundColor: AppColors.lavender,
      side: BorderSide.none,
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

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.titulo,
    required this.valor,
    required this.contexto,
    required this.cor,
    this.onTap,
  });

  final String titulo;
  final String valor;
  final String contexto;
  final Color cor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppAccents.cardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titulo, style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w600)),
              const Spacer(),
              Text(
                valor,
                style: TextStyle(
                  fontFamily: 'Poppins',
                  fontWeight: FontWeight.w800,
                  fontSize: 28,
                  color: cor,
                ),
              ),
              Text(contexto, style: const TextStyle(color: AppColors.muted, fontSize: 11)),
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
      ('Pendentes', (chart['pendentes'] as num?)?.toInt() ?? 0, AppColors.primary),
      ('Análise', (chart['emAnalise'] as num?)?.toInt() ?? 0, const Color(0xFF9B7ED9)),
      ('Aprovadas', (chart['aprovadas'] as num?)?.toInt() ?? 0, AppAccents.success),
      ('Rejeitadas', (chart['rejeitadas'] as num?)?.toInt() ?? 0, const Color(0xFFE11D48)),
    ];
    final max = itens.map((e) => e.$2).fold<int>(1, (a, b) => a > b ? a : b);

    const chartHeight = 96.0;
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final item in itens)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text('${item.$2}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                    const SizedBox(height: 4),
                    SizedBox(
                      height: chartHeight,
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: Container(
                          height: chartHeight * (item.$2 / max).clamp(0.08, 1.0),
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: item.$3,
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item.$1,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 10, color: AppColors.muted),
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
