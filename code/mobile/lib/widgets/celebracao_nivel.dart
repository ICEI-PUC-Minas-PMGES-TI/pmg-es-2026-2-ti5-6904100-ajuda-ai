import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/sons_conquista.dart';
import '../theme/colors.dart';
import 'progresso_gamificacao.dart' show assetEmblemaNivel;

/// Linha do tempo da animação (ms). Os mesmos valores da web
/// (`code/front/src/components/levelup/CelebracaoNivel.jsx` e o CSS):
///   0–650     entrada: overlay escurece, emblema salta com elástico, brilho
///   650–1650  giro de 360° com profundidade (frente/verso, luz, reflexo)
///   1650–2550 celebração: onda, raios, estrelas, faíscas e confetes; textos
///   2550–3400 encerramento: efeitos somem, o emblema fica em destaque
abstract final class TemposCelebracao {
  static const total = 3400;
  static const giro = 650;
  static const revelacao = 1650;
  static const brilho = 1850;
  static const acoes = 2050;

  /// Antes disto um toque no fundo não fecha (evita fechar sem querer).
  static const fecharNoFundo = 1200;
}

const tituloCelebracao = 'NOVO NÍVEL ALCANÇADO!';

const _cores = [
  Color(0xFFA78BFA),
  Color(0xFFFBBF24),
  Color(0xFFFDE68A),
  Color(0xFFFFFFFF),
  Color(0xFFC4B5FD),
  Color(0xFFF9A8D4),
];

enum TipoParticula { estrela, faisca, confete }

/// Uma partícula da explosão; posições relativas ao tamanho do palco.
class ParticulaCelebracao {
  const ParticulaCelebracao({
    required this.tipo,
    required this.dx,
    required this.dy,
    required this.tamanho,
    required this.rot,
    required this.atraso,
    required this.duracao,
    required this.escala,
    required this.queda,
    required this.cor,
  });

  final TipoParticula tipo;
  final double dx;
  final double dy;
  final double tamanho;

  /// Giro final em graus.
  final double rot;
  final int atraso;
  final int duracao;
  final double escala;
  final double queda;
  final Color cor;
}

double _arredondar(double x, int casas) {
  final f = math.pow(10, casas);
  return (x * f + 0.5).floorToDouble() / f;
}

/// Mesmo gerador com semente da web: o mesmo nível tem as mesmas partículas
/// nas duas plataformas.
List<ParticulaCelebracao> gerarParticulas(int numero) {
  var s = ((numero <= 0 ? 1 : numero) * 2654435761) & 0xFFFFFFFF;
  double rnd() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return s / 4294967296;
  }

  final lista = <ParticulaCelebracao>[];
  void adicionar(
    TipoParticula tipo,
    int n,
    List<double> distancia,
    List<double> tamanho,
  ) {
    for (var i = 0; i < n; i++) {
      final angulo = ((i + rnd() * 0.7) / n) * math.pi * 2;
      final d = distancia[0] + rnd() * (distancia[1] - distancia[0]);
      final dx = _arredondar(math.cos(angulo) * d, 3);
      final dy = _arredondar(math.sin(angulo) * d, 3);
      final t = (tamanho[0] + rnd() * (tamanho[1] - tamanho[0]) + 0.5)
          .floorToDouble();
      final sinal = rnd() > 0.5 ? 1 : -1;
      final rot = (sinal * (180 + rnd() * 540) + 0.5).floorToDouble();
      final atraso = (rnd() * 160 + 0.5).floor();
      final duracao = (900 + rnd() * 500 + 0.5).floor();
      final escala = _arredondar(0.5 + rnd() * 0.7, 2);
      final queda = _arredondar(0.12 + rnd() * 0.3, 2);
      final cor = _cores[(rnd() * _cores.length).floor()];
      lista.add(
        ParticulaCelebracao(
          tipo: tipo,
          dx: dx,
          dy: dy,
          tamanho: t,
          rot: rot,
          atraso: atraso,
          duracao: duracao,
          escala: escala,
          queda: queda,
          cor: cor,
        ),
      );
    }
  }

  adicionar(TipoParticula.estrela, 8, [0.42, 0.72], [12, 22]);
  adicionar(TipoParticula.faisca, 10, [0.3, 0.68], [6, 12]);
  adicionar(TipoParticula.confete, 14, [0.48, 0.85], [9, 15]);
  return lista;
}

/// Abre a animação sobre a tela atual. Só exibe: quem chama decide quando
/// (e confirma a conquista no servidor, no fluxo real).
Future<void> mostrarCelebracaoNivel(
  BuildContext context, {
  required int numero,
  String? nome,
  int niveisAvancados = 1,
  bool teste = false,
}) {
  return showGeneralDialog<void>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: false,
    barrierLabel: tituloCelebracao,
    barrierColor: Colors.transparent,
    transitionDuration: Duration.zero,
    pageBuilder: (contexto, _, _) => CelebracaoNivel(
      numero: numero,
      nome: nome,
      niveisAvancados: niveisAvancados,
      teste: teste,
      onFechar: () => Navigator.of(contexto).pop(),
    ),
  );
}

/// Animação de conquista de nível com o emblema real (pixel art).
class CelebracaoNivel extends StatefulWidget {
  const CelebracaoNivel({
    super.key,
    required this.numero,
    this.nome,
    this.niveisAvancados = 1,
    this.teste = false,
    required this.onFechar,
  });

  final int numero;
  final String? nome;
  final int niveisAvancados;

  /// Pré-visualização do painel de QA (selo visível; não confirma nada).
  final bool teste;
  final VoidCallback onFechar;

  @override
  State<CelebracaoNivel> createState() => _CelebracaoNivelState();
}

class _CelebracaoNivelState extends State<CelebracaoNivel>
    with TickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: TemposCelebracao.total),
  );
  late final AnimationController _saida = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  late final List<ParticulaCelebracao> _particulas = gerarParticulas(
    widget.numero,
  );
  final List<Timer> _timers = [];
  bool _reduzido = false;
  bool _iniciado = false;
  bool _fechando = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciado) return;
    _iniciado = true;
    _reduzido = MediaQuery.disableAnimationsOf(context);
    _c.forward();
    final sons = SonsConquista.instancia;
    if (_reduzido) {
      _depois(150, () => sons.tocar(SomConquista.conquista, volume: 0.8));
    } else {
      _depois(
        TemposCelebracao.giro - 10,
        () => sons.tocar(SomConquista.giro, volume: 0.9),
      );
      _depois(TemposCelebracao.revelacao - 10, () {
        sons.tocar(SomConquista.conquista);
        HapticFeedback.mediumImpact();
      });
      _depois(
        TemposCelebracao.brilho,
        () => sons.tocar(SomConquista.brilho, volume: 0.8),
      );
    }
  }

  void _depois(int ms, VoidCallback acao) {
    _timers.add(Timer(Duration(milliseconds: ms), acao));
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    _c.dispose();
    _saida.dispose();
    super.dispose();
  }

  Future<void> _fechar() async {
    if (_fechando) return;
    _fechando = true;
    if (!_reduzido) await _saida.forward();
    if (mounted) widget.onFechar();
  }

  void _toqueNoFundo() {
    // Pelo relógio da animação (respeita a escala de tempo do sistema).
    final ms = _c.value * TemposCelebracao.total;
    if (ms < TemposCelebracao.fecharNoFundo) return;
    _fechar();
  }

  /// Progresso (0–1) de um trecho da linha do tempo, com curva.
  double _trecho(
    double ms,
    int inicio,
    int duracao, [
    Curve curva = Curves.linear,
  ]) {
    final t = ((ms - inicio) / duracao).clamp(0.0, 1.0);
    return curva.transform(t);
  }

  @override
  Widget build(BuildContext context) {
    final tela = MediaQuery.sizeOf(context);
    final menor = tela.shortestSide;
    final palco = tela.height < 560
        ? math.min(menor * 0.46, 220.0)
        : math.min(menor * 0.64, 320.0);
    final nome = widget.nome?.trim();
    final rotuloNivel = nome == null || nome.isEmpty
        ? 'Nível ${widget.numero}'
        : 'Nível ${widget.numero} · $nome';

    return Material(
      type: MaterialType.transparency,
      child: AnimatedBuilder(
        animation: Listenable.merge([_c, _saida]),
        builder: (context, _) {
          final ms = _c.value * TemposCelebracao.total;
          final saida = 1 - _saida.value;
          final overlay = _trecho(ms, 0, 260, Curves.easeOut) * saida;
          return Stack(
            fit: StackFit.expand,
            children: [
              GestureDetector(
                key: const Key('celebracao-fundo'),
                behavior: HitTestBehavior.opaque,
                onTap: _toqueNoFundo,
                child: Opacity(
                  opacity: overlay,
                  // Duas camadas, como na web: fundo escuro e brilho roxo
                  // radial por cima (um gradiente sozinho substituiria a cor).
                  child: const ColoredBox(
                    color: Color(0xD10D0626),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: Alignment(0, -0.16),
                          radius: 0.9,
                          colors: [Color(0x8C5B21B6), Color(0x005B21B6)],
                          stops: [0, 0.62],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Opacity(
                opacity: saida,
                child: SafeArea(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 24,
                      ),
                      child: Semantics(
                        scopesRoute: true,
                        namesRoute: true,
                        explicitChildNodes: true,
                        label: '$tituloCelebracao $rotuloNivel',
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _palco(ms, palco),
                            SizedBox(height: palco * 0.06),
                            ..._textos(ms, rotuloNivel),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _palco(double ms, double palco) {
    final asset = assetEmblemaNivel(widget.numero);
    final emblema = palco * 0.94;
    return ExcludeSemantics(
      child: SizedBox.square(
        key: const Key('celebracao-palco'),
        dimension: palco,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            if (!_reduzido) _raios(ms, palco),
            _halo(ms, palco),
            if (!_reduzido) _onda(ms, palco),
            _emblema(ms, emblema, asset),
            if (!_reduzido)
              Positioned.fill(
                child: CustomPaint(
                  painter: _ParticulasPainter(
                    particulas: _particulas,
                    ms: ms,
                    palco: palco,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _raios(double ms, double palco) {
    const inicio = 1600, duracao = 1750;
    final t = _trecho(ms, inicio, duracao, Curves.easeOut);
    if (ms < inicio || t >= 1) return const SizedBox.shrink();
    final opacidade = t < 0.25
        ? t / 0.25
        : t < 0.7
        ? 1 - 0.3 * (t - 0.25) / 0.45
        : 0.7 * (1 - (t - 0.7) / 0.3);
    final lado = palco * 1.84;
    return Positioned(
      left: (palco - lado) / 2,
      top: (palco - lado) / 2,
      width: lado,
      height: lado,
      child: Opacity(
        opacity: opacidade.clamp(0.0, 1.0),
        child: Transform.rotate(
          angle: t * 40 * math.pi / 180,
          child: Transform.scale(
            scale: 0.7 + 0.35 * t,
            child: const CustomPaint(painter: _RaiosPainter()),
          ),
        ),
      ),
    );
  }

  Widget _halo(double ms, double palco) {
    double escala, opacidade;
    if (_reduzido) {
      escala = 1;
      opacidade = 0.6 * _trecho(ms, 0, 300);
    } else if (ms < 1600) {
      final t = _trecho(ms, 150, 600, Curves.easeOut);
      escala = 0.6 + 0.4 * t;
      opacidade = 0.55 * t;
    } else if (ms < 2500) {
      final t = _trecho(ms, 1600, 900, const Cubic(0.2, 0.7, 0.2, 1));
      if (t < 0.3) {
        escala = 1 + 0.22 * (t / 0.3);
        opacidade = 0.55 + 0.45 * (t / 0.3);
      } else {
        final u = (t - 0.3) / 0.7;
        escala = 1.22 - 0.18 * u;
        opacidade = 1 - 0.3 * u;
      }
    } else {
      // "Respira" devagar até o fim da animação; depois fica parado.
      final fase = math.sin((ms - 2500) / 2400 * 2 * math.pi);
      escala = 1.01 - 0.03 * fase;
      opacidade = 0.625 - 0.075 * fase;
    }
    final lado = palco * 1.36;
    return Positioned(
      left: (palco - lado) / 2,
      top: (palco - lado) / 2,
      width: lado,
      height: lado,
      child: Opacity(
        opacity: opacidade.clamp(0.0, 1.0),
        child: Transform.scale(
          scale: escala,
          child: const DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  Color(0x8CFBBF24),
                  Color(0x61A78BFA),
                  Color(0x00A78BFA),
                ],
                stops: [0, 0.34, 0.66],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _onda(double ms, double palco) {
    const inicio = 1640, duracao = 760;
    if (ms < inicio || ms > inicio + duracao) return const SizedBox.shrink();
    final t = _trecho(ms, inicio, duracao, const Cubic(0.15, 0.7, 0.3, 1));
    final lado = palco * 0.84;
    return SizedBox.square(
      dimension: lado,
      child: Opacity(
        opacity: (0.95 * (1 - t)).clamp(0.0, 1.0),
        child: Transform.scale(
          scale: 0.7 + 1.05 * t,
          child: const CustomPaint(painter: _OndaPainter()),
        ),
      ),
    );
  }

  Widget _emblema(double ms, double lado, String? asset) {
    // Entrada: salto elástico (escala e altura), igual ao CSS.
    double escala = 1, dy = 0, opacidade = 1;
    if (_reduzido) {
      opacidade = _trecho(ms, 0, 300, Curves.easeOut);
    } else {
      final t = _trecho(ms, 80, 620, const Cubic(0.3, 0.7, 0.4, 1));
      const quadros = [
        (0.0, 0.16, 0.16),
        (0.42, 1.14, -0.07),
        (0.62, 0.93, 0.02),
        (0.80, 1.035, -0.01),
        (1.0, 1.0, 0.0),
      ];
      for (var i = 0; i < quadros.length - 1; i++) {
        final (t0, e0, y0) = quadros[i];
        final (t1, e1, y1) = quadros[i + 1];
        if (t <= t1) {
          final u = Curves.easeInOut.transform(
            ((t - t0) / (t1 - t0)).clamp(0, 1),
          );
          escala = e0 + (e1 - e0) * u;
          dy = y0 + (y1 - y0) * u;
          break;
        }
      }
      opacidade = (t / 0.42).clamp(0.0, 1.0);
    }

    // Giro: 360° em Y com perspectiva; verso escurecido e sem espelhar.
    var angulo = 0.0;
    var brilho = 1.0;
    if (!_reduzido) {
      final p = _trecho(ms, TemposCelebracao.giro, 1000);
      angulo = const Cubic(0.55, 0.05, 0.3, 1).transform(p) * 2 * math.pi;
      brilho = p < 0.22
          ? 1 + 0.45 * (p / 0.22)
          : p < 0.78
          ? 1.45 - 0.15 * ((p - 0.22) / 0.56)
          : 1.3 - 0.3 * ((p - 0.78) / 0.22);
    }
    final frente = math.cos(angulo) >= 0;
    final matriz = Matrix4.identity()
      ..setEntry(3, 2, 0.0011)
      ..rotateY(angulo)
      ..scaleByDouble(
        1 + 0.1 * math.sin(angulo / 2),
        1 + 0.1 * math.sin(angulo / 2),
        1,
        1,
      );

    Widget imagem(double b) => ColorFiltered(
      colorFilter: ColorFilter.matrix([
        b, 0, 0, 0, 0, //
        0, b, 0, 0, 0, //
        0, 0, b, 0, 0, //
        0, 0, 0, 1, 0,
      ]),
      child: asset == null
          ? _EmblemaGenerico(numero: widget.numero, lado: lado)
          : Image.asset(
              asset,
              width: lado,
              height: lado,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.none,
              gaplessPlayback: true,
              excludeFromSemantics: true,
            ),
    );

    Widget face;
    if (frente) {
      face = Stack(
        alignment: Alignment.center,
        children: [
          imagem(brilho),
          if (asset != null) _reflexo(ms, lado, asset),
        ],
      );
    } else {
      // O verso é desenhado girado 180°: com o giro do pai, fica legível.
      face = Transform(
        alignment: Alignment.center,
        transform: Matrix4.rotationY(math.pi),
        child: imagem(0.62),
      );
    }

    return Opacity(
      opacity: opacidade,
      child: Transform.translate(
        offset: Offset(0, dy * lado),
        child: Transform.scale(
          scale: escala,
          child: Transform(
            key: const Key('celebracao-emblema'),
            alignment: Alignment.center,
            transform: matriz,
            child: SizedBox.square(dimension: lado, child: face),
          ),
        ),
      ),
    );
  }

  /// Faixa de luz que atravessa o emblema, só sobre a arte.
  Widget _reflexo(double ms, double lado, String asset) {
    const inicio = 1500, duracao = 820;
    if (_reduzido || ms < inicio || ms > inicio + duracao) {
      return const SizedBox.shrink();
    }
    final t = _trecho(ms, inicio, duracao, Curves.easeInOut);
    final opacidade = t < 0.2
        ? t / 0.2
        : t > 0.8
        ? (1 - t) / 0.2
        : 1.0;
    final centro = 1.3 - 1.6 * t;
    return Opacity(
      opacity: opacidade.clamp(0.0, 1.0),
      // srcIn: a cor é a do gradiente e o alfa é o da arte (faixa só sobre o
      // emblema, transparente fora dela).
      child: ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (r) => LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: const [
            Color(0x00FFFFFF),
            Color(0xBFFFFFFF),
            Color(0x00FFFFFF),
          ],
          stops: [
            (centro - 0.12).clamp(0.0, 1.0),
            centro.clamp(0.0, 1.0),
            (centro + 0.12).clamp(0.0, 1.0),
          ],
        ).createShader(r),
        child: Image.asset(
          asset,
          width: lado,
          height: lado,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.none,
          excludeFromSemantics: true,
        ),
      ),
    );
  }

  List<Widget> _textos(double ms, String rotuloNivel) {
    double apar(int inicio, int duracao) => _reduzido
        ? _trecho(ms, 150, 300, Curves.easeOut)
        : _trecho(ms, inicio, duracao, const Cubic(0.2, 0.8, 0.2, 1));
    final tTitulo = apar(1700, 620);
    final tNivel = apar(1880, 500);
    final tDetalhe = apar(2000, 500);
    final tAcoes = apar(TemposCelebracao.acoes, 400);
    final tamanhoTitulo = (MediaQuery.sizeOf(context).width * 0.052).clamp(
      20.0,
      29.6,
    );

    Widget subir(double t, double distancia, Widget filho) => Opacity(
      opacity: t,
      child: Transform.translate(
        offset: Offset(0, distancia * (1 - t)),
        child: filho,
      ),
    );

    return [
      subir(
        tTitulo,
        14,
        Transform.scale(
          scale: 0.94 + 0.06 * tTitulo,
          child: ShaderMask(
            blendMode: BlendMode.srcIn,
            shaderCallback: (r) => const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFF7D6), Color(0xFFFCD34D), Color(0xFFF59E0B)],
              stops: [0.1, 0.55, 1],
            ).createShader(r),
            child: Text(
              tituloCelebracao,
              key: const Key('celebracao-titulo'),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Poppins',
                fontWeight: FontWeight.w800,
                fontSize: tamanhoTitulo,
                height: 1.15,
                letterSpacing: tamanhoTitulo * (0.32 - 0.26 * tTitulo),
                color: Colors.white,
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 10),
      subir(
        tNivel,
        10,
        Semantics(
          liveRegion: true,
          child: Text(
            rotuloNivel,
            key: const Key('celebracao-nivel'),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
      if (widget.niveisAvancados > 1) ...[
        const SizedBox(height: 4),
        subir(
          tDetalhe,
          10,
          Text(
            'Você avançou ${widget.niveisAvancados} níveis de uma vez.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Inter',
              color: Color(0xFFC4B5FD),
              fontSize: 14,
            ),
          ),
        ),
      ],
      if (widget.teste) ...[
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: const Color(0x734C1D95),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: const Color(0x80C4B5FD)),
          ),
          child: const Text(
            'Pré-visualização · sem XP real',
            style: TextStyle(
              fontFamily: 'Inter',
              color: Color(0xFFDDD6FE),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
      const SizedBox(height: 18),
      subir(
        tAcoes,
        10,
        IgnorePointer(
          ignoring: tAcoes < 0.05,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              FilledButton(
                key: const Key('celebracao-continuar'),
                onPressed: _fechar,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: AppColors.primary,
                  minimumSize: const Size(168, 48),
                  shape: const StadiumBorder(),
                  textStyle: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                child: const Text('Continuar'),
              ),
              const SizedBox(width: 10),
              ValueListenableBuilder<bool>(
                valueListenable: SonsConquista.silenciado,
                builder: (context, mudo, _) => IconButton(
                  key: const Key('celebracao-som'),
                  onPressed: () {
                    SonsConquista.silenciado.value = !mudo;
                    if (!mudo) SonsConquista.instancia.pararTodos();
                  },
                  tooltip: mudo ? 'Ativar sons' : 'Silenciar sons',
                  icon: Icon(
                    mudo ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                  ),
                  color: Colors.white,
                  style: IconButton.styleFrom(
                    minimumSize: const Size(48, 48),
                    side: const BorderSide(color: Color(0x47FFFFFF)),
                    backgroundColor: const Color(0x14FFFFFF),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ];
  }
}

/// Nível sem arte própria (níveis futuros): disco com o número.
class _EmblemaGenerico extends StatelessWidget {
  const _EmblemaGenerico({required this.numero, required this.lado});

  final int numero;
  final double lado;

  @override
  Widget build(BuildContext context) => Container(
    width: lado,
    height: lado,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      border: Border.all(color: AppAccents.star, width: 6),
      gradient: const RadialGradient(
        center: Alignment(-0.3, -0.4),
        colors: [Color(0xFF8B5CF6), AppColors.primary],
        stops: [0, 0.7],
      ),
    ),
    child: Text(
      '$numero',
      style: TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w800,
        fontSize: lado * 0.24,
      ),
    ),
  );
}

/// Anel da onda de choque: traço dourado com brilho só na borda.
class _OndaPainter extends CustomPainter {
  const _OndaPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final centro = size.center(Offset.zero);
    final raio = size.shortestSide / 2 - 1.5;
    canvas.drawCircle(
      centro,
      raio,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8
        ..color = const Color(0x99FBBF24)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawCircle(
      centro,
      raio,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = const Color(0xE6FDE68A),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _RaiosPainter extends CustomPainter {
  const _RaiosPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final centro = size.center(Offset.zero);
    final raio = size.shortestSide / 2;
    final paint = Paint()
      ..shader = const RadialGradient(
        colors: [Color(0x42FFECB3), Color(0x42FFECB3), Color(0x00FFECB3)],
        stops: [0, 0.18, 0.68],
      ).createShader(Rect.fromCircle(center: centro, radius: raio));
    const fatias = 16;
    const largura = 7 * math.pi / 180;
    for (var i = 0; i < fatias; i++) {
      final inicio = i * 2 * math.pi / fatias;
      final caminho = Path()
        ..moveTo(centro.dx, centro.dy)
        ..arcTo(
          Rect.fromCircle(center: centro, radius: raio),
          inicio,
          largura,
          false,
        )
        ..close();
      canvas.drawPath(caminho, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ParticulasPainter extends CustomPainter {
  _ParticulasPainter({
    required this.particulas,
    required this.ms,
    required this.palco,
  });

  final List<ParticulaCelebracao> particulas;
  final double ms;
  final double palco;

  static const _curva = Cubic(0.12, 0.75, 0.3, 1);
  static final _brilho = Paint()
    ..color = const Color(0xE6FDE68A)
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

  @override
  void paint(Canvas canvas, Size size) {
    final centro = size.center(Offset.zero);
    for (final p in particulas) {
      final inicio = TemposCelebracao.revelacao + p.atraso;
      final t = (ms - inicio) / p.duracao;
      if (t <= 0 || t >= 1) continue;
      late Offset pos;
      late double escala, giro, opacidade;
      if (p.tipo == TipoParticula.confete) {
        if (t < 0.45) {
          final u = _curva.transform(t / 0.45);
          pos = Offset(p.dx, p.dy) * u;
          giro = p.rot * 0.5 * u;
          escala = 0.4 + 0.6 * u;
        } else {
          final u = _curva.transform((t - 0.45) / 0.55);
          pos = Offset.lerp(
            Offset(p.dx, p.dy),
            Offset(p.dx * 1.1, p.dy + p.queda),
            u,
          )!;
          giro = p.rot * (0.5 + 0.5 * u);
          escala = 1 - 0.1 * u;
        }
        opacidade = t < 0.1 ? t / 0.1 : (t > 0.8 ? (1 - t) / 0.2 : 1);
      } else {
        final u = _curva.transform(t);
        pos = Offset(p.dx, p.dy) * u;
        giro = p.rot * u;
        escala = 0.2 + (p.escala - 0.2) * u;
        opacidade = t < 0.12 ? t / 0.12 : (t > 0.7 ? (1 - t) / 0.3 : 1);
      }
      canvas.save();
      canvas.translate(centro.dx + pos.dx * palco, centro.dy + pos.dy * palco);
      canvas.rotate(giro * math.pi / 180);
      canvas.scale(escala);
      final a = opacidade.clamp(0.0, 1.0);
      final lado = p.tamanho;
      switch (p.tipo) {
        case TipoParticula.estrela:
          final estrela = _estrela(lado);
          canvas.drawPath(
            estrela,
            Paint()
              ..color = _brilho.color.withValues(alpha: 0.9 * a)
              ..maskFilter = _brilho.maskFilter,
          );
          canvas.drawPath(estrela, Paint()..color = p.cor.withValues(alpha: a));
        case TipoParticula.faisca:
          final raio = lado / 2;
          canvas.drawCircle(
            Offset.zero,
            raio,
            Paint()
              ..shader =
                  RadialGradient(
                    colors: [
                      Colors.white.withValues(alpha: a),
                      Colors.white.withValues(alpha: a),
                      p.cor.withValues(alpha: a),
                      p.cor.withValues(alpha: 0),
                    ],
                    stops: const [0, 0.3, 0.55, 0.72],
                  ).createShader(
                    Rect.fromCircle(center: Offset.zero, radius: raio),
                  ),
          );
        case TipoParticula.confete:
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromCenter(
                center: Offset.zero,
                width: lado * 0.55,
                height: lado,
              ),
              const Radius.circular(2),
            ),
            Paint()..color = p.cor.withValues(alpha: a),
          );
      }
      canvas.restore();
    }
  }

  /// Estrela de quatro pontas (mesmo desenho do `clip-path` da web).
  static Path _estrela(double lado) {
    final m = lado / 2;
    Offset pt(double x, double y) => Offset(x * lado - m, y * lado - m);
    return Path()
      ..moveTo(pt(0.5, 0).dx, pt(0.5, 0).dy)
      ..lineTo(pt(0.61, 0.39).dx, pt(0.61, 0.39).dy)
      ..lineTo(pt(1, 0.5).dx, pt(1, 0.5).dy)
      ..lineTo(pt(0.61, 0.61).dx, pt(0.61, 0.61).dy)
      ..lineTo(pt(0.5, 1).dx, pt(0.5, 1).dy)
      ..lineTo(pt(0.39, 0.61).dx, pt(0.39, 0.61).dy)
      ..lineTo(pt(0, 0.5).dx, pt(0, 0.5).dy)
      ..lineTo(pt(0.39, 0.39).dx, pt(0.39, 0.39).dy)
      ..close();
  }

  @override
  bool shouldRepaint(_ParticulasPainter old) =>
      old.ms != ms || old.palco != palco;
}
