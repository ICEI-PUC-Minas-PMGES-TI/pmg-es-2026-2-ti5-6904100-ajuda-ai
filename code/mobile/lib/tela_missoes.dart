import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'main.dart' show estiloBarraClara;
import 'models/missao.dart';
import 'services/api_config.dart';
import 'services/missoes_api.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/app_feedback.dart';
import 'widgets/navegacao_app.dart';
import 'widgets/progresso_gamificacao.dart';

const double _gutter = 20;

String _milhar(int valor) {
  final texto = valor.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < texto.length; i++) {
    if (i > 0 && (texto.length - i) % 3 == 0) buffer.write('.');
    buffer.write(texto[i]);
  }
  return buffer.toString();
}

String _dataCurta(DateTime data) =>
    '${data.day.toString().padLeft(2, '0')}/${data.month.toString().padLeft(2, '0')}';

enum FiltroMissoes { disponiveis, semanais, concluidas }

class MissoesPage extends StatefulWidget {
  const MissoesPage({super.key, this.api});

  final MissoesApi? api;

  @override
  State<MissoesPage> createState() => _MissoesPageState();
}

class _MissoesPageState extends State<MissoesPage> with WidgetsBindingObserver {
  late final MissoesApi _api = widget.api ?? MissoesApi();
  MissoesAluno? _dados;
  Object? _erro;
  bool _carregando = true;
  FiltroMissoes _filtro = FiltroMissoes.disponiveis;
  final Set<String> _concluindo = {};
  AppDestination? _aba;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _carregar();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final aba = AppShell.of(context)?.atual;
    if (aba == AppDestination.missoes && _aba != null && _aba != aba) {
      _carregar();
    }
    _aba = aba;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        (_aba == null || _aba == AppDestination.missoes)) {
      _carregar();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _carregar() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      setState(() {
        _carregando = false;
        _erro = const ApiException(
          'Sua sessão expirou. Entre de novo para ver as missões.',
          statusCode: 401,
        );
      });
      return;
    }
    setState(() {
      _carregando = true;
      _erro = null;
    });
    try {
      final dados = await _api.listar(token);
      if (!mounted) return;
      setState(() {
        _dados = dados;
        _carregando = false;
      });
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _erro = erro;
        _carregando = false;
      });
    }
  }

  Future<void> _concluir(Missao missao) async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null || _concluindo.contains(missao.id)) return;
    setState(() => _concluindo.add(missao.id));
    ConclusaoMissao? conclusao;
    String? falha;
    try {
      conclusao = await _api.concluir(token, missao.id);
      SessaoUsuario.atual.xp.value = conclusao.saldoMoedas;
      SessaoUsuario.atual.atualizarXp();
    } on ApiException catch (erro) {
      falha = erro.mensagem;
    } catch (erro) {
      falha = '$erro';
    }
    if (!mounted) return;
    setState(() => _concluindo.remove(missao.id));
    if (falha != null) mostrarFeedback(context, falha, erro: true);
    if (conclusao != null) await mostrarConclusaoMissao(context, conclusao);
    if (mounted) await _carregar();
  }

  Future<void> _abrirDetalhe(Missao missao) async {
    final concluir = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => MissaoDetalhePage(missao: missao)),
    );
    if (concluir == true && mounted) await _concluir(missao);
  }

  List<Missao> _filtradas(List<Missao> missoes) => switch (_filtro) {
    FiltroMissoes.disponiveis => missoes.where((m) => !m.concluida).toList(),
    FiltroMissoes.semanais => missoes.where((m) => m.semanal).toList(),
    FiltroMissoes.concluidas => missoes.where((m) => m.concluida).toList(),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _carregar,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            const SliverToBoxAdapter(child: _Cabecalho()),
            SliverToBoxAdapter(
              child: Transform.translate(
                offset: const Offset(0, -28),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(28),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(_gutter, 24, _gutter, 24),
                  child: _conteudo(),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: AppShell.dentro(context)
          ? null
          : AppBottomNavigation(
              selected: AppDestination.missoes,
              destinations: SessaoUsuario.atual.destinos,
              onSelected: (destino) => navegarDestino(
                context,
                destino,
                atual: AppDestination.missoes,
              ),
            ),
    );
  }

  Widget _conteudo() {
    final dados = _dados;
    if (_carregando && dados == null) {
      return const Padding(
        padding: EdgeInsets.only(top: 48),
        child: Center(
          child: CircularProgressIndicator(
            key: Key('missoes-carregando'),
            color: AppColors.primary,
          ),
        ),
      );
    }
    if (_erro != null && dados == null) {
      final erro = _erro;
      final expirada =
          erro is ApiException &&
          (erro.statusCode == 401 || erro.statusCode == 403);
      return _EstadoVazio(
        key: const Key('missoes-erro'),
        icone: expirada ? Icons.lock_outline_rounded : Icons.wifi_off_rounded,
        titulo: expirada
            ? 'Missões indisponíveis'
            : 'Não foi possível carregar as missões',
        mensagem: erro is ApiException ? erro.mensagem : '$erro',
        acao: expirada ? null : 'Tentar de novo',
        onAcao: _carregar,
      );
    }
    final missoes = _filtradas(dados!.missoes);
    final semanais = missoes.where((m) => m.semanal).toList();
    final doCiclo = missoes.where((m) => !m.semanal).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CartaoLimites(dados: dados),
        const SizedBox(height: 18),
        _Filtros(
          atual: _filtro,
          onSelecionar: (f) => setState(() => _filtro = f),
        ),
        const SizedBox(height: 8),
        if (missoes.isEmpty)
          _EstadoVazio(
            key: const Key('missoes-vazio'),
            icone: Icons.flag_outlined,
            titulo: switch (_filtro) {
              FiltroMissoes.concluidas => 'Nenhuma missão concluída ainda',
              _ => 'Nenhuma missão disponível',
            },
            mensagem: switch (_filtro) {
              FiltroMissoes.concluidas =>
                'Conclua uma missão para ela aparecer aqui.',
              _ => 'A coordenação publica novas missões ao longo do semestre.',
            },
          ),
        if (semanais.isNotEmpty) ...[
          const _TituloSecao('Semanais'),
          for (final m in semanais) _cartao(m),
        ],
        if (doCiclo.isNotEmpty) ...[
          const _TituloSecao('Do ciclo'),
          for (final m in doCiclo) _cartao(m),
        ],
      ],
    );
  }

  Widget _cartao(Missao missao) => _CartaoMissao(
    missao: missao,
    concluindo: _concluindo.contains(missao.id),
    onTap: () => _abrirDetalhe(missao),
    onConcluir: () => _concluir(missao),
  );
}

class _Cabecalho extends StatelessWidget {
  const _Cabecalho();

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: estiloBarraClara,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppAccents.headerTop, AppAccents.headerBottom],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(_gutter, 20, _gutter, 52),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Missões',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ),
                    ValueListenableBuilder<int?>(
                      valueListenable: SessaoUsuario.atual.xp,
                      builder: (context, moedas, _) => moedas == null
                          ? const SizedBox.shrink()
                          : _PilulaMoedas(moedas: moedas),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Complete desafios e ganhe XP e moedas',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: Color(0xFFD9CCEC),
                    fontSize: 15,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PilulaMoedas extends StatelessWidget {
  const _PilulaMoedas({required this.moedas});

  final int moedas;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$moedas moedas',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.toll_rounded, color: AppAccents.star, size: 20),
            const SizedBox(width: 8),
            Text(
              _milhar(moedas),
              key: const Key('missoes-moedas'),
              style: const TextStyle(
                fontFamily: 'Inter',
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartaoLimites extends StatelessWidget {
  const _CartaoLimites({required this.dados});

  final MissoesAluno dados;

  @override
  Widget build(BuildContext context) {
    final semanal = dados.tetoSemanal;
    final ciclo = dados.tetoCiclo;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Esta semana',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.ink,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (semanal != null) ...[
            const SizedBox(height: 6),
            Text(
              '${semanal.ganho} de ${semanal.limite} XP em missões semanais',
              key: const Key('missoes-teto-semanal'),
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.ink,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: semanal.limite == 0
                    ? 0
                    : (semanal.ganho / semanal.limite).clamp(0, 1),
                minHeight: 8,
                backgroundColor: AppColors.lavender,
                color: AppColors.primary,
              ),
            ),
          ],
          if (ciclo != null) ...[
            const SizedBox(height: 10),
            Text(
              'Ciclo ${dados.ciclo} · ${_milhar(ciclo.ganho)} de ${_milhar(ciclo.limite)} XP',
              style: const TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 13.5,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Filtros extends StatelessWidget {
  const _Filtros({required this.atual, required this.onSelecionar});

  final FiltroMissoes atual;
  final ValueChanged<FiltroMissoes> onSelecionar;

  @override
  Widget build(BuildContext context) {
    const rotulos = {
      FiltroMissoes.disponiveis: 'Disponíveis',
      FiltroMissoes.semanais: 'Semanais',
      FiltroMissoes.concluidas: 'Concluídas',
    };
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final entrada in rotulos.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                key: Key('filtro-${entrada.key.name}'),
                label: Text(entrada.value),
                selected: atual == entrada.key,
                showCheckmark: false,
                onSelected: (_) => onSelecionar(entrada.key),
                selectedColor: AppColors.primary,
                backgroundColor: AppColors.lavender,
                side: BorderSide.none,
                shape: const StadiumBorder(),
                labelStyle: TextStyle(
                  fontFamily: 'Inter',
                  fontWeight: FontWeight.w600,
                  color: atual == entrada.key ? Colors.white : AppColors.ink,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TituloSecao extends StatelessWidget {
  const _TituloSecao(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 10),
      child: Text(
        texto,
        style: const TextStyle(
          color: AppColors.ink,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _IconeMissao extends StatelessWidget {
  const _IconeMissao({required this.missao, this.tamanho = 48});

  final Missao missao;
  final double tamanho;

  @override
  Widget build(BuildContext context) {
    final (fundo, cor, icone) = missao.concluida
        ? (AppAccents.tileVerde, AppAccents.iconeVerde, Icons.check_rounded)
        : missao.semanal
        ? (
            AppAccents.tileLaranja,
            AppAccents.iconeLaranja,
            Icons.repeat_rounded,
          )
        : (AppAccents.tileLilas, AppColors.primary, Icons.flag_outlined);
    return Container(
      width: tamanho,
      height: tamanho,
      decoration: BoxDecoration(
        color: fundo,
        borderRadius: BorderRadius.circular(tamanho * 0.3),
      ),
      child: Icon(icone, color: cor, size: tamanho * 0.5),
    );
  }
}

class _PilulaRecompensa extends StatelessWidget {
  const _PilulaRecompensa({required this.xp, required this.moedas});

  final int xp;
  final int moedas;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        '+$xp XP · +$moedas ${moedas == 1 ? 'moeda' : 'moedas'}',
        style: const TextStyle(
          fontFamily: 'Inter',
          color: AppColors.primary,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _CartaoMissao extends StatelessWidget {
  const _CartaoMissao({
    required this.missao,
    required this.concluindo,
    required this.onTap,
    required this.onConcluir,
  });

  final Missao missao;
  final bool concluindo;
  final VoidCallback onTap;
  final VoidCallback onConcluir;

  @override
  Widget build(BuildContext context) {
    final conclusao = missao.conclusao;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          key: Key('missao-${missao.id}'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppAccents.cardBorder),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _IconeMissao(missao: missao),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        missao.titulo,
                        style: const TextStyle(
                          color: AppColors.ink,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (missao.descricao.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          missao.descricao,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 13.5,
                          ),
                        ),
                      ],
                      if (missao.status == StatusMissao.limitada) ...[
                        const SizedBox(height: 6),
                        Text(
                          missao.xpPrevisto == 0
                              ? 'Limite atingido: esta missão não rende XP agora.'
                              : 'Pelo limite, rende só ${missao.xpPrevisto} XP agora.',
                          key: Key('missao-limitada-${missao.id}'),
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: Color(0xFFB45309),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: missao.concluida && conclusao != null
                                ? _PilulaRecompensa(
                                    xp: conclusao.xp,
                                    moedas: conclusao.moedas,
                                  )
                                : _PilulaRecompensa(
                                    xp: missao.xp,
                                    moedas: missao.moedas,
                                  ),
                          ),
                          const SizedBox(width: 8),
                          _acao(),
                        ],
                      ),
                      if (!missao.concluida && missao.fim != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Disponível até ${_dataCurta(missao.fim!)}',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.muted,
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _acao() {
    if (missao.concluida) {
      return Container(
        key: Key('missao-concluida-${missao.id}'),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppAccents.successBg,
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Concluída',
              style: TextStyle(
                fontFamily: 'Inter',
                color: AppAccents.success,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(width: 4),
            Icon(Icons.check_rounded, color: AppAccents.success, size: 16),
          ],
        ),
      );
    }
    return FilledButton(
      key: Key('concluir-${missao.id}'),
      onPressed: concluindo ? null : onConcluir,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      child: concluindo
          ? const SizedBox.square(
              dimension: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : const Text(
              'Concluir',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
    );
  }
}

class _EstadoVazio extends StatelessWidget {
  const _EstadoVazio({
    super.key,
    required this.icone,
    required this.titulo,
    required this.mensagem,
    this.acao,
    this.onAcao,
  });

  final IconData icone;
  final String titulo;
  final String mensagem;
  final String? acao;
  final VoidCallback? onAcao;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppColors.lavender,
              shape: BoxShape.circle,
            ),
            child: Icon(icone, color: AppColors.primary, size: 30),
          ),
          const SizedBox(height: 14),
          Text(
            titulo,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            mensagem,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 14,
            ),
          ),
          if (acao != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onAcao, child: Text(acao!)),
          ],
        ],
      ),
    );
  }
}

class MissaoDetalhePage extends StatelessWidget {
  const MissaoDetalhePage({super.key, required this.missao});

  final Missao missao;

  @override
  Widget build(BuildContext context) {
    final conclusao = missao.conclusao;
    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          AnnotatedRegion<SystemUiOverlayStyle>(
            value: estiloBarraClara,
            child: Container(
              width: double.infinity,
              color: AppAccents.headerTop,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, _gutter, 40),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: 'Voltar',
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(
                          Icons.arrow_back_rounded,
                          color: Colors.white,
                        ),
                      ),
                      const Expanded(
                        child: Text(
                          'Detalhe da missão',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: Transform.translate(
              offset: const Offset(0, -24),
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(_gutter, 28, _gutter, 24),
                  children: [
                    Center(child: _IconeMissao(missao: missao, tamanho: 88)),
                    const SizedBox(height: 18),
                    Text(
                      missao.titulo,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.lavender,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          missao.semanal ? 'Missão semanal' : 'Missão do ciclo',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    Row(
                      children: [
                        Expanded(
                          child: _TileRecompensa(
                            icone: Icons.bar_chart_rounded,
                            cor: AppColors.primary,
                            texto: '+${conclusao?.xp ?? missao.xp} XP',
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _TileRecompensa(
                            icone: Icons.toll_rounded,
                            cor: AppAccents.iconeLaranja,
                            texto:
                                '+${conclusao?.moedas ?? missao.moedas} moedas',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'Como concluir',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      missao.descricao,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontSize: 15.5,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      [
                        missao.semanal
                            ? 'Renova toda segunda-feira · Limite de 60 XP por semana'
                            : 'Vale uma vez por semestre',
                        if (missao.fim != null)
                          'Disponível até ${_dataCurta(missao.fim!)}',
                      ].join(' · '),
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.muted,
                        fontSize: 13.5,
                      ),
                    ),
                    if (missao.status == StatusMissao.limitada) ...[
                      const SizedBox(height: 16),
                      _AvisoLimite(
                        texto: missao.xpPrevisto == 0
                            ? 'Você já atingiu o limite de XP. Concluir agora não rende XP nem moedas.'
                            : 'Pelo limite, esta missão rende ${missao.xpPrevisto} de ${missao.xp} XP agora.',
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(_gutter, 0, _gutter, 16),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  key: const Key('detalhe-concluir'),
                  onPressed: missao.concluida
                      ? null
                      : () => Navigator.of(context).pop(true),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: Text(
                    missao.concluida ? 'Missão concluída' : 'Concluir missão',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TileRecompensa extends StatelessWidget {
  const _TileRecompensa({
    required this.icone,
    required this.cor,
    required this.texto,
  });

  final IconData icone;
  final Color cor;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 18),
      decoration: BoxDecoration(
        color: AppAccents.cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icone, color: cor),
          const SizedBox(width: 8),
          Text(
            texto,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: AppColors.ink,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _AvisoLimite extends StatelessWidget {
  const _AvisoLimite({required this.texto, super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppAccents.tileLaranja,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Text(
        texto,
        style: const TextStyle(
          fontFamily: 'Inter',
          color: Color(0xFF92400E),
          fontSize: 14.5,
          height: 1.4,
        ),
      ),
    );
  }
}

String mensagemLimite(ConclusaoMissao c) {
  final motivo = c.teto == 'semanal'
      ? 'Você atingiu o limite semanal de missões.'
      : 'Você atingiu o limite de XP do semestre.';
  if (c.xp == 0) return '$motivo Esta conclusão não rendeu XP nem moedas.';
  return '$motivo Foram creditados ${c.xp} de ${c.xpConfigurado} XP.';
}

Future<void> mostrarConclusaoMissao(
  BuildContext context,
  ConclusaoMissao conclusao,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) => _SheetConclusao(conclusao: conclusao),
  );
}

class _SheetConclusao extends StatelessWidget {
  const _SheetConclusao({required this.conclusao});

  final ConclusaoMissao conclusao;

  @override
  Widget build(BuildContext context) {
    final nivel = conclusao.nivel;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(_gutter, 0, _gutter, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (nivel != null)
              Center(
                child: EmblemaNivel(
                  numero: nivel.numero,
                  nome: nivel.nome,
                  tamanho: 120,
                ),
              ),
            const SizedBox(height: 16),
            Text(
              conclusao.subiuDeNivel
                  ? 'Você subiu de nível!'
                  : conclusao.limitado
                  ? 'Missão concluída'
                  : 'Missão concluída!',
              key: const Key('sheet-conclusao-titulo'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.ink,
                fontSize: 26,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (conclusao.limitado) ...[
              const SizedBox(height: 16),
              _AvisoLimite(
                key: const Key('sheet-conclusao-limite'),
                texto: mensagemLimite(conclusao),
              ),
            ],
            const SizedBox(height: 16),
            const Text(
              'Você ganhou',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Inter',
                color: AppColors.muted,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 12,
              runSpacing: 8,
              children: [
                _Ganho(
                  texto: '+${conclusao.xp} XP',
                  fundo: AppAccents.tileLilas,
                  cor: AppColors.primary,
                ),
                _Ganho(
                  texto: '+${conclusao.moedas} moedas',
                  fundo: const Color(0xFFFEF3C7),
                  cor: const Color(0xFF854D0E),
                  icone: Icons.toll_rounded,
                ),
              ],
            ),
            if (nivel != null) ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Nível ${nivel.numero} · ${nivel.nome}',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Text(
                    nivel.proximoXp == null
                        ? '${_milhar(conclusao.xpAcumulado)} XP'
                        : '${_milhar(conclusao.xpAcumulado)} / ${_milhar(nivel.proximoXp!)} XP',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              BarraNivel(nivel: nivel),
            ],
            const SizedBox(height: 20),
            SizedBox(
              height: 54,
              child: FilledButton(
                key: const Key('sheet-conclusao-continuar'),
                onPressed: () => Navigator.of(context).pop(),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: const Text(
                  'Continuar',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Ganho extends StatelessWidget {
  const _Ganho({
    required this.texto,
    required this.fundo,
    required this.cor,
    this.icone,
  });

  final String texto;
  final Color fundo;
  final Color cor;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: fundo,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icone != null) ...[
            Icon(icone, color: AppAccents.iconeLaranja, size: 22),
            const SizedBox(width: 8),
          ],
          Text(
            texto,
            style: TextStyle(
              fontFamily: 'Inter',
              color: cor,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
