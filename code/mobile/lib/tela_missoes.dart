import 'dart:ui' show ImageFilter;

import 'package:campus_map/campus_map.dart'
    show
        CampusLocationService,
        CampusLocationStatus,
        GeolocatorCampusLocationService;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'main.dart' show estiloBarraClara;
import 'models/missao.dart';
import 'models/resumo_gamificacao.dart';
import 'services/api_config.dart';
import 'services/missoes_api.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/confete_celebracao.dart';
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
  const MissoesPage({super.key, this.api, this.localizacao});

  final MissoesApi? api;

  final CampusLocationService? localizacao;

  @override
  State<MissoesPage> createState() => _MissoesPageState();
}

class _MissoesPageState extends State<MissoesPage> with WidgetsBindingObserver {
  static const _paginaInicial = 6000;
  late final MissoesApi _api = widget.api ?? MissoesApi();
  final PageController _destaqueController = PageController(
    initialPage: _paginaInicial,
    keepPage: false,
    viewportFraction: 0.94,
  );
  MissoesAluno? _dados;
  Object? _erro;
  bool _carregando = true;
  FiltroMissoes _filtro = FiltroMissoes.disponiveis;
  int _paginaDestaque = _paginaInicial;
  List<Missao> _missoesDestaque = const [];
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
    _destaqueController.dispose();
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
        _missoesDestaque = _destaques(dados);
        _dados = dados;
        if (_missoesDestaque.length < 2) _paginaDestaque = _paginaInicial;
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

  late final CampusLocationService _localizacao =
      widget.localizacao ?? GeolocatorCampusLocationService();

  Future<void> _abrirDetalhe(Missao missao) async {
    final conclusao = await mostrarDetalheMissao(
      context,
      missao,
      onResgatar: (codigo) => _resgatar(missao, codigo),
      onAtalho: (destino) => AppShell.of(context)?.ir(destino),
    );
    if (conclusao == null || !mounted) return;
    SessaoUsuario.atual.xp.value = conclusao.saldoMoedas;
    SessaoUsuario.atual.atualizarXp();
    await mostrarCelebracaoMissao(context);
    if (mounted) _carregar();
  }

  Future<ConclusaoMissao> _resgatar(Missao missao, String? codigo) async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      throw const ApiException(
        'Sua sessão expirou. Entre de novo para resgatar.',
        statusCode: 401,
      );
    }
    if (missao.requisito != RequisitoMissao.evento) {
      return _api.concluir(token, missao.id, codigo: codigo);
    }
    final leitura = await _localizacao.locate();
    final posicao = leitura.location;
    if (leitura.status != CampusLocationStatus.located || posicao == null) {
      throw ApiException(switch (leitura.status) {
        CampusLocationStatus.serviceDisabled =>
          'Ligue a localização do celular para fazer o check-in.',
        CampusLocationStatus.denied || CampusLocationStatus.deniedForever =>
          'Permita o acesso à localização para fazer o check-in no evento.',
        _ => 'Não foi possível obter sua localização. Tente de novo.',
      });
    }
    return _api.concluir(
      token,
      missao.id,
      latitude: posicao.latitude,
      longitude: posicao.longitude,
      accuracy: posicao.accuracy,
    );
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
            SliverToBoxAdapter(child: _cabecalho()),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(_gutter, 4, _gutter, 24),
                child: _conteudo(),
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
        const _TituloSecao('Suas missões', semEspacoSuperior: true),
        _Filtros(
          atual: _filtro,
          onSelecionar: (f) => setState(() => _filtro = f),
        ),
        const SizedBox(height: 4),
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

  List<Missao> _destaques(MissoesAluno dados) {
    final destaques = dados.missoes
        .where((missao) => missao.status == StatusMissao.disponivel)
        .take(3)
        .toList();
    if (_dados?.ciclo != dados.ciclo) return destaques;

    final concluidas = {
      for (final missao in dados.missoes)
        if (missao.concluida) missao.id: missao,
    };
    for (var i = 0; i < _missoesDestaque.length; i++) {
      final concluida = concluidas[_missoesDestaque[i].id];
      if (concluida != null) {
        destaques.insert(i.clamp(0, destaques.length), concluida);
        if (destaques.length > 3) destaques.removeLast();
      }
    }
    return destaques;
  }

  bool _reiniciarNoLimite(ScrollEndNotification notificacao) {
    if (notificacao.depth == 0 && _destaqueController.page == 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            _destaqueController.hasClients &&
            _destaqueController.page == 0) {
          _destaqueController.jumpToPage(_paginaInicial);
        }
      });
    }
    return false;
  }

  Widget _cabecalho() {
    final dados = _dados;
    final destaques = _missoesDestaque;
    Widget cartaoDestaque(int indice) => RepaintBoundary(
      child: _CartaoDestaque(
        missao: destaques[indice],
        onAbrir: () => _abrirDetalhe(destaques[indice]),
      ),
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: estiloBarraClara,
      child: Stack(
        children: [
          const Positioned.fill(child: _FundoDifuso()),
          Column(
            children: [
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(_gutter, 18, _gutter, 30),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
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
                      if (dados != null) ...[
                        const SizedBox(height: 22),
                        _ResumoSemana(dados: dados),
                      ],
                      if (destaques.isNotEmpty) ...[
                        const SizedBox(height: 18),
                        Semantics(
                          header: true,
                          child: const Text(
                            'Missões destacadas',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        LayoutBuilder(
                          builder: (context, area) {
                            final largura = destaques.length == 1
                                ? area.maxWidth
                                : area.maxWidth *
                                          _destaqueController.viewportFraction -
                                      10;
                            final altura = destaques
                                .map(
                                  (missao) => _CartaoDestaque.alturaPara(
                                    context,
                                    missao,
                                    largura,
                                  ),
                                )
                                .reduce((a, b) => a > b ? a : b);
                            return SizedBox(
                              height: altura,
                              child: destaques.length == 1
                                  ? cartaoDestaque(0)
                                  : NotificationListener<ScrollEndNotification>(
                                      onNotification: _reiniciarNoLimite,
                                      child: PageView.builder(
                                        key: const Key('carrossel-missoes'),
                                        controller: _destaqueController,
                                        padEnds: false,
                                        onPageChanged: (pagina) => setState(
                                          () => _paginaDestaque = pagina,
                                        ),
                                        itemBuilder: (context, pagina) =>
                                            Padding(
                                              padding: const EdgeInsets.only(
                                                right: 10,
                                              ),
                                              child: cartaoDestaque(
                                                pagina % destaques.length,
                                              ),
                                            ),
                                      ),
                                    ),
                            );
                          },
                        ),
                        if (destaques.length > 1) ...[
                          const SizedBox(height: 12),
                          _IndicadorDestaque(
                            atual: _paginaDestaque % destaques.length,
                            total: destaques.length,
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
              ),
              Container(
                height: 28,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _cartao(Missao missao) =>
      _CartaoMissao(missao: missao, onTap: () => _abrirDetalhe(missao));
}

class _Moeda extends StatelessWidget {
  const _Moeda({this.tamanho = 34});

  final double tamanho;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(tamanho), painter: const _DesenhoMoeda());
}

class _DesenhoMoeda extends CustomPainter {
  const _DesenhoMoeda();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    canvas.save();
    canvas.scale(size.width / 32, size.height / 32);
    canvas.translate(16, 16);
    canvas.rotate(-0.35);
    canvas.drawOval(
      const Rect.fromLTWH(-8, -11, 19, 24),
      paint..color = const Color(0xFFB9700B),
    );
    canvas.drawOval(
      const Rect.fromLTWH(-11, -12, 19, 24),
      paint..color = const Color(0xFFFFD05A),
    );
    canvas.drawOval(
      const Rect.fromLTWH(-8, -9, 13, 18),
      paint..color = const Color(0xFFFFE8A1),
    );
    final selo = Path()
      ..moveTo(-1.5, -5)
      ..lineTo(2, 0)
      ..lineTo(-1.5, 5)
      ..lineTo(-5, 0)
      ..close();
    canvas.drawPath(selo, paint..color = const Color(0xFFBA790E));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _DesenhoMoeda oldDelegate) => false;
}

class _PilulaMoedas extends StatelessWidget {
  const _PilulaMoedas({required this.moedas});

  final int moedas;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$moedas moedas',
      child: SizedBox(
        height: 40,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.centerLeft,
          children: [
            Container(
              margin: const EdgeInsets.only(left: 18),
              padding: const EdgeInsets.fromLTRB(26, 0, 16, 0),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Text(
                _milhar(moedas),
                key: const Key('missoes-moedas'),
                style: const TextStyle(
                  color: AppColors.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const _Moeda(tamanho: 40),
          ],
        ),
      ),
    );
  }
}

class _IndicadorDestaque extends StatelessWidget {
  const _IndicadorDestaque({required this.atual, required this.total});

  final int atual;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < total; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == atual ? 16 : 6,
            height: 6,
            decoration: BoxDecoration(
              color: i == atual
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(6),
            ),
          ),
      ],
    );
  }
}

enum _CategoriaArte {
  totem(Color(0xFF0A3C44), Color(0xFF6DE1CC), Icons.qr_code_2_rounded),
  evento(Color(0xFF512044), Color(0xFFFFAD85), Icons.calendar_month_rounded),
  conversa(Color(0xFF3C176D), Color(0xFFFFC45C), Icons.forum_rounded),
  estudo(Color(0xFF202D64), Color(0xFF9DB9FF), Icons.menu_book_rounded),
  campus(Color(0xFF163E36), Color(0xFFB8E3AA), Icons.place_rounded),
  perfil(Color(0xFF4E225B), Color(0xFFE6B1F9), Icons.badge_rounded),
  semanal(Color(0xFF3F286A), Color(0xFFC3ACFF), Icons.bolt_rounded),
  ciclo(Color(0xFF482C24), Color(0xFFFFCD90), Icons.flag_rounded);

  const _CategoriaArte(this.fundo, this.acento, this.icone);

  final Color fundo;
  final Color acento;
  final IconData icone;
}

bool _temPalavra(String texto, List<String> palavras) =>
    palavras.any(texto.contains);

_CategoriaArte? _categoriaNoTexto(String texto) {
  if (_temPalavra(texto, ['totem', 'totens', 'pucstop', 'puc stop'])) {
    return _CategoriaArte.totem;
  }
  if (_temPalavra(texto, [
    'evento',
    'palestra',
    'oficina',
    'feira',
    'semana do calouro',
    'seminário',
    'seminario',
    'workshop',
    'congresso',
  ])) {
    return _CategoriaArte.evento;
  }
  if (_temPalavra(texto, [
    'calouro',
    'conversa',
    'pergunta',
    'dúvida',
    'duvida',
    'respond',
    'chat',
    'feed',
  ])) {
    return _CategoriaArte.conversa;
  }
  if (_temPalavra(texto, [
    'biblioteca',
    'livro',
    'estudo',
    'estudar',
    'aula',
    'dica',
    'aprend',
    'conteúdo',
    'conteudo',
  ])) {
    return _CategoriaArte.estudo;
  }
  if (_temPalavra(texto, [
    'campus',
    'visite',
    'visita',
    'local',
    'mapa',
    'explor',
  ])) {
    return _CategoriaArte.campus;
  }
  if (_temPalavra(texto, ['perfil', 'cadastro', 'foto'])) {
    return _CategoriaArte.perfil;
  }
  return null;
}

_CategoriaArte _categoriaArte(Missao missao) =>
    _categoriaNoTexto(missao.titulo.toLowerCase()) ??
    _categoriaNoTexto(missao.descricao.toLowerCase()) ??
    (missao.semanal ? _CategoriaArte.semanal : _CategoriaArte.ciclo);

int _variacaoArte(String id) {
  var valor = 0;
  for (final caractere in id.codeUnits) {
    valor = (valor * 31 + caractere) % 3;
  }
  return valor;
}

class _ArteDestaque extends StatelessWidget {
  const _ArteDestaque({required this.missao, required this.categoria});

  final Missao missao;
  final _CategoriaArte categoria;

  @override
  Widget build(BuildContext context) {
    final variacao = _variacaoArte(missao.id);
    final arte = switch (categoria) {
      _CategoriaArte.conversa => _ArteConversa(variacao: variacao),
      _CategoriaArte.campus => _ArteCampus(variacao: variacao),
      _ => _ArteSimbolo(categoria: categoria, variacao: variacao),
    };
    return KeyedSubtree(
      key: Key('arte-${categoria.name}-$variacao-${missao.id}'),
      child: categoria == _CategoriaArte.campus
          ? arte
          : FittedBox(
              fit: BoxFit.cover,
              alignment: Alignment.centerRight,
              child: arte,
            ),
    );
  }
}

class _ArteConversa extends StatelessWidget {
  const _ArteConversa({required this.variacao});

  final int variacao;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 190,
      height: 126,
      child: Stack(
        children: [
          Positioned(
            left: [7.0, 12.0, 3.0][variacao],
            top: [2.0, 6.0, 0.0][variacao],
            child: Transform.rotate(
              angle: [-0.09, 0.07, -0.15][variacao],
              child: ClipPath(
                clipper: _BalaoArteClipper(),
                child: Container(
                  width: 111,
                  height: 98,
                  alignment: Alignment.topCenter,
                  padding: const EdgeInsets.only(top: 6),
                  color: const Color(0xFFF5EDFF),
                  child: Text(
                    ['?', '…', '!'][variacao],
                    style: const TextStyle(
                      color: Color(0xFF6232AA),
                      fontSize: 61,
                      fontWeight: FontWeight.w500,
                      height: 1,
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: [0.0, 5.0, 1.0][variacao],
            top: [33.0, 28.0, 37.0][variacao],
            child: Transform.rotate(
              angle: [0.08, -0.04, 0.13][variacao],
              child: ClipPath(
                clipper: _BalaoArteClipper(),
                child: Container(
                  width: 122,
                  height: 88,
                  padding: const EdgeInsets.fromLTRB(18, 19, 18, 24),
                  color: const Color(0xFFFFBE50),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _LinhaConversa(largura: 78),
                      _LinhaConversa(largura: 61),
                      _LinhaConversa(largura: 70),
                    ],
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

class _LinhaConversa extends StatelessWidget {
  const _LinhaConversa({required this.largura});

  final double largura;

  @override
  Widget build(BuildContext context) => Container(
    width: largura,
    height: 4,
    decoration: BoxDecoration(
      color: const Color(0xFF6232AA),
      borderRadius: BorderRadius.circular(4),
    ),
  );
}

class _BalaoArteClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) => Path()
    ..addRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, size.width, size.height - 14),
        const Radius.circular(18),
      ),
    )
    ..moveTo(size.width * 0.68, size.height - 15)
    ..lineTo(size.width * 0.84, size.height)
    ..lineTo(size.width * 0.8, size.height - 15)
    ..close();

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _ArteCampus extends StatelessWidget {
  const _ArteCampus({required this.variacao});

  final int variacao;

  @override
  Widget build(BuildContext context) => Image.asset(
    'assets/images/pucjardim.png',
    fit: BoxFit.cover,
    alignment: const [
      Alignment.centerLeft,
      Alignment.center,
      Alignment.centerRight,
    ][variacao],
  );
}

class _ArteSimbolo extends StatelessWidget {
  const _ArteSimbolo({required this.categoria, required this.variacao});

  final _CategoriaArte categoria;
  final int variacao;

  @override
  Widget build(BuildContext context) {
    final detalhes = switch (categoria) {
      _CategoriaArte.totem => [
        Icons.location_on_rounded,
        Icons.explore_rounded,
        Icons.route_rounded,
      ],
      _CategoriaArte.evento => [
        Icons.confirmation_number_rounded,
        Icons.campaign_rounded,
        Icons.groups_rounded,
      ],
      _CategoriaArte.estudo => [
        Icons.edit_rounded,
        Icons.lightbulb_rounded,
        Icons.school_rounded,
      ],
      _CategoriaArte.perfil => [
        Icons.person_rounded,
        Icons.edit_rounded,
        Icons.verified_rounded,
      ],
      _CategoriaArte.semanal => [
        Icons.repeat_rounded,
        Icons.timer_rounded,
        Icons.check_rounded,
      ],
      _ => [
        Icons.stars_rounded,
        Icons.emoji_events_rounded,
        Icons.auto_awesome_rounded,
      ],
    };
    final acento = categoria.acento;
    final formatoIngresso = categoria == _CategoriaArte.evento;
    return SizedBox(
      width: 220,
      height: 144,
      child: Stack(
        children: [
          for (final tamanho in [132.0, 112.0, 92.0])
            Positioned(
              right: 46 - tamanho / 2,
              top: 76 - tamanho / 2,
              child: Container(
                width: tamanho,
                height: tamanho,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: acento.withValues(alpha: 0.38)),
                ),
              ),
            ),
          Positioned(
            right: 16,
            top: 44,
            child: Transform.rotate(
              angle: const [-0.14, 0.12, -0.06][variacao],
              child: Container(
                width: formatoIngresso ? 77 : 63,
                height: formatoIngresso ? 65 : 80,
                decoration: BoxDecoration(
                  color: acento,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white54, width: 1.5),
                ),
                child: Icon(categoria.icone, color: categoria.fundo, size: 44),
              ),
            ),
          ),
          Positioned(
            right: 80,
            top: const [52.0, 39.0, 70.0][variacao],
            child: Icon(detalhes[variacao], color: acento, size: 28),
          ),
        ],
      ),
    );
  }
}

class _Manchas extends StatelessWidget {
  const _Manchas({required this.cores, this.desfoque = 28});

  final List<Color> cores;
  final double desfoque;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, area) {
        final w = area.maxWidth;
        final h = area.maxHeight;
        Widget mancha(double x, double y, double r, Color cor) => Positioned(
          left: w * x - r,
          top: h * y - r,
          child: Container(
            width: r * 2,
            height: r * 2,
            decoration: BoxDecoration(shape: BoxShape.circle, color: cor),
          ),
        );
        return ImageFiltered(
          imageFilter: ImageFilter.blur(sigmaX: desfoque, sigmaY: desfoque),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(child: ColoredBox(color: cores[3])),
              mancha(0.15, 0.2, w * 0.45, cores[0]),
              mancha(0.9, 0.15, w * 0.35, cores[1]),
              mancha(0.75, 0.85, w * 0.42, cores[2]),
              mancha(0.1, 0.95, w * 0.3, cores[1].withValues(alpha: 0.7)),
            ],
          ),
        );
      },
    );
  }
}

class _FundoDifuso extends StatelessWidget {
  const _FundoDifuso();

  @override
  Widget build(BuildContext context) {
    return const ClipRect(
      child: _Manchas(
        cores: [
          Color(0xFF5B2BB8),
          Color(0xFF8E4FD6),
          Color(0xFF3A1580),
          Color(0xFF2A0F66),
        ],
        desfoque: 60,
      ),
    );
  }
}

class _CartaoDestaque extends StatelessWidget {
  const _CartaoDestaque({required this.missao, required this.onAbrir});

  final Missao missao;
  final VoidCallback onAbrir;

  static const _estiloTitulo = TextStyle(
    color: Colors.white,
    fontSize: 30,
    fontWeight: FontWeight.w800,
    height: 1.1,
  );

  static const _estiloDescricao = TextStyle(
    fontFamily: 'Inter',
    color: Colors.white,
    fontSize: 16,
    height: 1.4,
  );

  static String _descricao(Missao missao) =>
      missao.descricao.trim().replaceAll(RegExp(r'\s+'), ' ');

  static double alturaPara(
    BuildContext context,
    Missao missao,
    double largura,
  ) {
    final escala = MediaQuery.textScalerOf(context);
    final estiloBase = DefaultTextStyle.of(context).style;
    double alturaTexto(String texto, TextStyle estilo, double largura) {
      final medidor = TextPainter(
        text: TextSpan(text: texto, style: estiloBase.merge(estilo)),
        textDirection: Directionality.of(context),
        textScaler: escala,
      )..layout(maxWidth: largura.clamp(1.0, double.infinity));
      final altura = medidor.height;
      medidor.dispose();
      return altura;
    }

    final larguraConteudo = largura - 32;
    final titulo = alturaTexto(
      missao.titulo,
      _estiloTitulo,
      larguraConteudo - (missao.concluida ? 34 : 0),
    ).clamp(missao.concluida ? 26.0 : 0.0, double.infinity);
    final descricao = alturaTexto(
      _descricao(missao),
      _estiloDescricao,
      larguraConteudo,
    );
    final recompensas = (escala.scale(23) * 1.5).clamp(28.0, double.infinity);
    return (32 + titulo + 18 + descricao + recompensas).clamp(
      222.0,
      double.infinity,
    );
  }

  @override
  Widget build(BuildContext context) {
    final categoria = _categoriaArte(missao);
    final fundo = missao.concluida ? const Color(0xFF35353D) : categoria.fundo;
    final moedas = missao.conclusao?.moedas ?? missao.moedas;
    final xp = missao.conclusao?.xp ?? missao.xp;
    final descricao = _descricao(missao);
    final fundoIlustrado = _ArteDestaque(missao: missao, categoria: categoria);
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Material(
        color: fundo,
        child: InkWell(
          key: Key('destaque-${missao.id}'),
          onTap: onAbrir,
          child: Stack(
            children: [
              Positioned.fill(
                child: ExcludeSemantics(
                  child: missao.concluida
                      ? ColorFiltered(
                          colorFilter: const ColorFilter.mode(
                            Colors.grey,
                            BlendMode.saturation,
                          ),
                          child: fundoIlustrado,
                        )
                      : fundoIlustrado,
                ),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        fundo.withValues(alpha: 0.99),
                        fundo.withValues(alpha: 0.88),
                        fundo.withValues(alpha: 0.24),
                      ],
                      stops: const [0, 0.59, 1],
                    ),
                  ),
                ),
              ),
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xB3000000)],
                    ),
                  ),
                ),
              ),
              Positioned.fill(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(missao.titulo, style: _estiloTitulo),
                          ),
                          if (missao.concluida) ...[
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.check_circle_rounded,
                              semanticLabel: 'Missão concluída',
                              color: Colors.white,
                              size: 26,
                            ),
                          ],
                        ],
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 8, bottom: 10),
                          child: Text(descricao, style: _estiloDescricao),
                        ),
                      ),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Row(
                          children: [
                            Semantics(
                              label:
                                  '$moedas ${moedas == 1 ? 'moeda' : 'moedas'}',
                              excludeSemantics: true,
                              child: Row(
                                children: [
                                  const _Moeda(tamanho: 28),
                                  const SizedBox(width: 4),
                                  _ValorDestaque(
                                    valor: moedas,
                                    cor: const Color(0xFFFFD45C),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 20),
                            _ValorDestaque(valor: xp, unidade: 'XP'),
                          ],
                        ),
                      ),
                    ],
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

class _ValorDestaque extends StatelessWidget {
  const _ValorDestaque({
    required this.valor,
    this.unidade,
    this.cor = Colors.white,
  });

  final int valor;
  final String? unidade;
  final Color cor;

  @override
  Widget build(BuildContext context) => Text.rich(
    TextSpan(
      children: [
        TextSpan(
          text: _milhar(valor),
          style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
        ),
        if (unidade != null)
          TextSpan(
            text: ' $unidade',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
      ],
    ),
    maxLines: 1,
    style: TextStyle(fontFamily: 'Inter', color: cor),
  );
}

class _ResumoSemana extends StatelessWidget {
  const _ResumoSemana({required this.dados});

  final MissoesAluno dados;

  @override
  Widget build(BuildContext context) {
    final semanal = dados.tetoSemanal;
    final faltam = semanal == null
        ? 0
        : (semanal.limite - semanal.ganho).clamp(0, semanal.limite);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'XP ganho esta semana',
          style: TextStyle(
            fontFamily: 'Inter',
            color: _textoClaro,
            fontSize: 13.5,
            fontWeight: FontWeight.w500,
          ),
        ),
        if (semanal != null) ...[
          const SizedBox(height: 2),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text.rich(
                  key: const Key('missoes-teto-semanal'),
                  TextSpan(
                    children: [
                      TextSpan(
                        text: '${semanal.ganho}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 46,
                          height: 1.1,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -1,
                        ),
                      ),
                      TextSpan(
                        text: ' / ${semanal.limite} XP',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.6),
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFD45C), Color(0xFFF5A524)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  faltam == 0 ? 'Semana completa' : 'Faltam $faltam XP',
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Color(0xFF3B2300),
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: semanal.limite == 0
                  ? 0
                  : (semanal.ganho / semanal.limite).clamp(0, 1),
              minHeight: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.16),
              color: const Color(0xFFFFD45C),
            ),
          ),
        ],
        ValueListenableBuilder<ResumoGamificacao?>(
          valueListenable: SessaoUsuario.atual.gamificacao,
          builder: (context, resumo, _) => resumo == null
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _LinhaNivel(resumo: resumo),
                ),
        ),
      ],
    );
  }
}

class _LinhaNivel extends StatelessWidget {
  const _LinhaNivel({required this.resumo});

  final ResumoGamificacao resumo;

  @override
  Widget build(BuildContext context) {
    final nivel = resumo.nivel;
    final proximo = nivel.proximoXp;
    final xp = proximo == null
        ? '${_milhar(resumo.xpAcumulado)} XP'
        : '${_milhar(resumo.xpAcumulado)} / ${_milhar(proximo)} XP';
    return Row(
      key: const Key('missoes-xp-total'),
      children: [
        EmblemaNivel(numero: nivel.numero, nome: nivel.nome, tamanho: 26),
        const SizedBox(width: 8),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: nivel.nome,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                TextSpan(text: ' · $xp'),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: _textoClaro,
              fontSize: 13.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
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
  const _TituloSecao(this.texto, {this.semEspacoSuperior = false});

  final String texto;
  final bool semEspacoSuperior;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        top: semEspacoSuperior ? 0 : 18,
        bottom: semEspacoSuperior ? 14 : 6,
      ),
      child: Text(
        texto,
        style: TextStyle(
          color: AppColors.ink,
          fontSize: semEspacoSuperior ? 20 : 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _IconeMissao extends StatelessWidget {
  const _IconeMissao({required this.missao, required this.categoria});

  final Missao missao;
  final _CategoriaArte categoria;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: missao.concluida
              ? const Color(0xFFE8F6EE)
              : Color.lerp(Colors.white, categoria.acento, 0.33),
          shape: BoxShape.circle,
        ),
        child: SizedBox.square(
          dimension: 42,
          child: Icon(
            missao.concluida ? Icons.check_rounded : categoria.icone,
            color: missao.concluida ? const Color(0xFF176A46) : categoria.fundo,
            size: 21,
          ),
        ),
      ),
    );
  }
}

class _CartaoMissao extends StatelessWidget {
  const _CartaoMissao({required this.missao, required this.onTap});

  final Missao missao;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final categoria = _categoriaArte(missao);
    final limitada = missao.status == StatusMissao.limitada;
    final xp = missao.concluida
        ? missao.conclusao?.xp ?? missao.xp
        : missao.xpPrevisto;
    final status = missao.concluida
        ? 'Concluída'
        : limitada
        ? 'Recompensa limitada'
        : 'Disponível';
    final corRecompensa = missao.concluida
        ? const Color(0xFF176A46)
        : limitada
        ? const Color(0xFF90520D)
        : categoria.fundo;
    const estiloMeta = TextStyle(
      fontFamily: 'Inter',
      color: Color(0xFF596477),
      fontSize: 12,
      height: 1.35,
    );

    return Material(
      color: Colors.white,
      child: InkWell(
        key: Key('missao-${missao.id}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              _IconeMissao(missao: missao, categoria: categoria),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      missao.titulo,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 15,
                        height: 1.25,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      !missao.concluida && missao.fim != null
                          ? '$status · Até ${_dataCurta(missao.fim!)}'
                          : status,
                      key: missao.concluida
                          ? Key('missao-concluida-${missao.id}')
                          : null,
                      style: estiloMeta,
                    ),
                    if (limitada) ...[
                      const SizedBox(height: 4),
                      Text(
                        xp == 0
                            ? 'Limite atingido: esta missão não rende XP agora.'
                            : 'Pelo limite, rende só $xp XP agora.',
                        key: Key('missao-limitada-${missao.id}'),
                        style: estiloMeta.copyWith(color: corRecompensa),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Text(
                '${_milhar(xp)} XP',
                textAlign: TextAlign.end,
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: corRecompensa,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
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

const Color _fundoBase = Color(0xFF1E0A4F);
const Color _textoClaro = Color(0xFFD9CCEC);

class _AvisoEscuro extends StatelessWidget {
  const _AvisoEscuro({super.key, required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.info_outline_rounded,
            color: Color(0xFFFCD34D),
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              texto,
              style: const TextStyle(
                fontFamily: 'Inter',
                color: Color(0xFFFDE68A),
                fontSize: 13.5,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<ConclusaoMissao?> mostrarDetalheMissao(
  BuildContext context,
  Missao missao, {
  Future<ConclusaoMissao> Function(String? codigo)? onResgatar,
  void Function(AppDestination destino)? onAtalho,
}) {
  return showGeneralDialog<ConclusaoMissao>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Fechar',
    barrierColor: Colors.transparent,
    transitionDuration: const Duration(milliseconds: 360),
    pageBuilder: (context, _, _) => _SheetMissao(
      missao: missao,
      onResgatar: onResgatar,
      onAtalho: onAtalho,
    ),
    transitionBuilder: (context, animacao, _, sheet) {
      final curva = CurvedAnimation(
        parent: animacao,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.of(context).pop(),
              child: AnimatedBuilder(
                animation: curva,
                builder: (context, _) => BackdropFilter(
                  filter: ImageFilter.blur(
                    sigmaX: 14 * curva.value,
                    sigmaY: 14 * curva.value,
                  ),
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.6 * curva.value),
                  ),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SlideTransition(
              position: Tween(
                begin: const Offset(0, 1),
                end: Offset.zero,
              ).animate(curva),
              child: sheet,
            ),
          ),
        ],
      );
    },
  );
}

class _SheetMissao extends StatefulWidget {
  const _SheetMissao({required this.missao, this.onResgatar, this.onAtalho});

  final Missao missao;
  final Future<ConclusaoMissao> Function(String? codigo)? onResgatar;
  final void Function(AppDestination destino)? onAtalho;

  @override
  State<_SheetMissao> createState() => _SheetMissaoState();
}

class _SheetMissaoState extends State<_SheetMissao> {
  final _codigo = TextEditingController();
  bool _enviando = false;
  String? _erro;

  Missao get missao => widget.missao;

  @override
  void dispose() {
    _codigo.dispose();
    super.dispose();
  }

  Future<void> _resgatar() async {
    final resgatar = widget.onResgatar;
    if (resgatar == null || _enviando) return;
    final codigo = missao.requisito == RequisitoMissao.codigo
        ? _codigo.text.trim()
        : null;
    if (codigo != null && codigo.isEmpty) {
      setState(() => _erro = 'Digite o código da atividade.');
      return;
    }
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      final conclusao = await resgatar(codigo);
      if (mounted) Navigator.of(context).pop(conclusao);
    } catch (erro) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = erro is ApiException
            ? erro.mensagem
            : 'Não foi possível resgatar agora. Tente de novo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final conclusao = missao.conclusao;
    final xp = conclusao?.xp ?? missao.xp;
    final moedas = conclusao?.moedas ?? missao.moedas;
    final midia = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(10, 0, 10, 10 + midia.padding.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: midia.size.height * 0.88),
        child: Material(
          key: const Key('detalhe-missao'),
          type: MaterialType.transparency,
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: _fundoBase,
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.4),
                  blurRadius: 30,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 10, 24, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 38,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.28),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  SizedBox(
                    key: const Key('arte-recompensa'),
                    height: 190,
                    width: double.infinity,
                    child: _ArteRecompensa(xp: xp, moedas: moedas),
                  ),
                  const SizedBox(height: 18),
                  Divider(
                    color: Colors.white.withValues(alpha: 0.18),
                    height: 1,
                  ),
                  const SizedBox(height: 24),
                  Semantics(
                    header: true,
                    child: Text(
                      missao.titulo,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        height: 1.2,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (missao.descricao.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      missao.descricao,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: _textoClaro,
                        fontSize: 15,
                        height: 1.45,
                      ),
                    ),
                  ],
                  if (missao.fim != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      'Disponível até ${_dataCurta(missao.fim!)}',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        color: Colors.white.withValues(alpha: 0.65),
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                  if (missao.status == StatusMissao.limitada) ...[
                    const SizedBox(height: 14),
                    _AvisoEscuro(
                      texto: missao.xpPrevisto == 0
                          ? 'Você já atingiu o limite de XP. Concluir agora não rende XP nem moedas.'
                          : 'Pelo limite, esta missão rende ${missao.xpPrevisto} de ${missao.xp} XP agora.',
                    ),
                  ],
                  const SizedBox(height: 28),
                  if (!missao.concluida) ...[
                    _ComoConcluir(missao: missao),
                    if (missao.requisito == RequisitoMissao.codigo &&
                        missao.pronta) ...[
                      const SizedBox(height: 14),
                      TextField(
                        key: const Key('detalhe-codigo'),
                        controller: _codigo,
                        enabled: !_enviando,
                        textCapitalization: TextCapitalization.characters,
                        autocorrect: false,
                        enableSuggestions: false,
                        maxLength: 40,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.5,
                        ),
                        decoration: InputDecoration(
                          counterText: '',
                          hintText: 'Código da atividade',
                          hintStyle: TextStyle(
                            color: Colors.white.withValues(alpha: 0.4),
                            letterSpacing: 0,
                            fontWeight: FontWeight.w500,
                          ),
                          filled: true,
                          fillColor: Colors.white.withValues(alpha: 0.08),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                        ),
                        onSubmitted: (_) => _resgatar(),
                      ),
                    ],
                    if (_atalho(missao) case (final rotulo, final destino)
                        when !missao.pronta && widget.onAtalho != null) ...[
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: OutlinedButton.icon(
                          key: const Key('detalhe-atalho'),
                          onPressed: () {
                            Navigator.of(context).pop();
                            widget.onAtalho!(destino);
                          },
                          icon: Icon(
                            destino == AppDestination.mapa
                                ? Icons.map_rounded
                                : Icons.forum_rounded,
                            size: 18,
                          ),
                          label: Text(rotulo),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: BorderSide(
                              color: Colors.white.withValues(alpha: 0.35),
                            ),
                            shape: const StadiumBorder(),
                          ),
                        ),
                      ),
                    ],
                  ],
                  if (_erro != null) ...[
                    const SizedBox(height: 14),
                    _AvisoEscuro(key: const Key('detalhe-erro'), texto: _erro!),
                  ],
                  const SizedBox(height: 20),
                  _BotaoResgate(
                    key: const Key('detalhe-concluir'),
                    texto: _textoBotao(missao, enviando: _enviando),
                    onPressed:
                        missao.pronta &&
                            !missao.concluida &&
                            !_enviando &&
                            widget.onResgatar != null
                        ? _resgatar
                        : null,
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

class _ArteRecompensa extends StatelessWidget {
  const _ArteRecompensa({required this.xp, required this.moedas});

  final int xp;
  final int moedas;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        const Positioned.fill(child: CustomPaint(painter: _ConfetesDaArte())),
        Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Semantics(
                label: '$xp XP de recompensa',
                excludeSemantics: true,
                child: SizedBox(
                  height: 82,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: '+${_milhar(xp)}'),
                          const TextSpan(
                            text: ' XP',
                            style: TextStyle(
                              color: AppAccents.star,
                              fontSize: 31,
                              letterSpacing: 0,
                            ),
                          ),
                        ],
                      ),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 76,
                        height: 1,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -2,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const _Moeda(tamanho: 42),
                const SizedBox(width: 8),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      '+${_milhar(moedas)} ${moedas == 1 ? 'moeda' : 'moedas'}',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: Color(0xFFFFDE82),
                        fontSize: 31,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _ConfetesDaArte extends CustomPainter {
  const _ConfetesDaArte();

  static const _pedacos = [
    (0.08, 0.20, 4.0, 10.0, -0.4, Color(0xFFFFD45C)),
    (0.18, 0.09, 3.0, 7.0, 0.5, Color(0xFFBBA1EF)),
    (0.39, 0.08, 7.0, 3.0, -0.2, Color(0xFFFFFFFF)),
    (0.75, 0.13, 3.0, 9.0, 0.6, Color(0xFFFFD45C)),
    (0.91, 0.25, 7.0, 3.0, -0.7, Color(0xFFBBA1EF)),
    (0.06, 0.58, 7.0, 3.0, 0.5, Color(0xFFBBA1EF)),
    (0.94, 0.58, 3.0, 8.0, -0.3, Color(0xFFFFFFFF)),
    (0.13, 0.87, 3.0, 7.0, -0.5, Color(0xFFFFFFFF)),
    (0.29, 0.92, 7.0, 3.0, 0.3, Color(0xFFFFD45C)),
    (0.83, 0.86, 4.0, 9.0, -0.6, Color(0xFFBBA1EF)),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final tinta = Paint();
    for (final (x, y, largura, altura, angulo, cor) in _pedacos) {
      canvas.save();
      canvas.translate(size.width * x, size.height * y);
      canvas.rotate(angulo);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: largura, height: altura),
          const Radius.circular(1),
        ),
        tinta..color = cor,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfetesDaArte oldDelegate) => false;
}

String _hora(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

String _vezes(int n, String um, String varios) =>
    n == 1 ? '1 $um' : '$n $varios';

String comoConcluirMissao(Missao m) {
  final meta = m.progresso?.meta ?? 1;
  final alvo = m.alvo;
  return switch (m.requisito) {
    RequisitoMissao.pucstops =>
      alvo != null
          ? 'Colete o PucStop ${alvo.nome} no mapa.'
          : 'Colete ${_vezes(meta, 'PucStop', 'PucStops diferentes')} no mapa.',
    RequisitoMissao.evento =>
      alvo == null
          ? 'Faça check-in no evento, no local e no horário dele.'
          : 'Faça check-in em ${alvo.nome}${alvo.local == null ? '' : ' (${alvo.local})'}'
                '${alvo.inicio == null ? '' : ', em ${_dataCurta(alvo.inicio!)} às ${_hora(alvo.inicio!)}'}. '
                'Precisa estar no local, com a localização ligada.',
    RequisitoMissao.feedComentarios =>
      'Comente ${_vezes(meta, 'vez', 'vezes')} em posts do feed (pelo menos 10 caracteres).',
    RequisitoMissao.feedCurtidas =>
      'Curta ${_vezes(meta, 'post', 'posts')} de colegas no feed.',
    RequisitoMissao.feedPublicacoes =>
      'Faça ${_vezes(meta, 'publicação', 'publicações')} no feed.',
    RequisitoMissao.chatMensagens =>
      'Envie ${_vezes(meta, 'mensagem', 'mensagens')} para sua dupla no chat.',
    RequisitoMissao.codigo =>
      'Digite o código mostrado na atividade pela coordenação.',
    RequisitoMissao.desconhecido =>
      'Atualize o app para ver como concluir esta missão.',
  };
}

(String, AppDestination)? _atalho(Missao m) => switch (m.requisito) {
  RequisitoMissao.pucstops ||
  RequisitoMissao.evento => ('Abrir mapa', AppDestination.mapa),
  RequisitoMissao.feedComentarios ||
  RequisitoMissao.feedCurtidas ||
  RequisitoMissao.feedPublicacoes => ('Ir para o feed', AppDestination.feed),
  _ => null,
};

String _textoBotao(Missao m, {bool enviando = false}) {
  if (m.concluida) return 'Recompensa resgatada';
  if (enviando) {
    return m.requisito == RequisitoMissao.evento
        ? 'Conferindo sua localização…'
        : 'Conferindo…';
  }
  if (m.requisito == RequisitoMissao.evento) {
    final alvo = m.alvo;
    if (m.pronta) return 'Fazer check-in e resgatar';
    final abre = alvo?.checkinAbre;
    if (abre != null && DateTime.now().isBefore(abre)) {
      return 'Check-in abre ${_dataCurta(abre)} às ${_hora(abre)}';
    }
    return 'Evento encerrado';
  }
  if (m.requisito == RequisitoMissao.codigo) return 'Validar código e resgatar';
  final faltam = m.progresso?.faltam ?? 0;
  if (!m.pronta && faltam > 0) {
    return 'Falta${faltam == 1 ? '' : 'm'} $faltam para resgatar';
  }
  return 'Resgatar recompensa';
}

class _ComoConcluir extends StatelessWidget {
  const _ComoConcluir({required this.missao});

  final Missao missao;

  @override
  Widget build(BuildContext context) {
    final progresso = missao.progresso;
    return Container(
      key: const Key('detalhe-como-concluir'),
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Como concluir',
            style: TextStyle(
              fontFamily: 'Inter',
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            comoConcluirMissao(missao),
            style: const TextStyle(
              fontFamily: 'Inter',
              color: Colors.white,
              fontSize: 14.5,
              height: 1.4,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (progresso != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: progresso.fracao,
                      minHeight: 8,
                      backgroundColor: Colors.white.withValues(alpha: 0.12),
                      color: const Color(0xFFFFD45C),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  '${progresso.atual}/${progresso.meta}',
                  key: const Key('detalhe-progresso'),
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _BotaoResgate extends StatelessWidget {
  const _BotaoResgate({super.key, required this.texto, this.onPressed});

  final String texto;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFFFFD45C),
          foregroundColor: const Color(0xFF2A1A4A),
          disabledBackgroundColor: Colors.white.withValues(alpha: 0.1),
          disabledForegroundColor: Colors.white.withValues(alpha: 0.42),
          shape: const StadiumBorder(),
        ),
        child: Text(
          texto,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

Future<void> mostrarCelebracaoMissao(BuildContext context) async {
  final entrada = OverlayEntry(
    builder: (_) => const Positioned.fill(
      child: IgnorePointer(child: ConfeteCelebracao(explodir: true)),
    ),
  );
  Overlay.of(context, rootOverlay: true).insert(entrada);
  await Future<void>.delayed(const Duration(milliseconds: 1700));
  entrada.remove();
  entrada.dispose();
}
