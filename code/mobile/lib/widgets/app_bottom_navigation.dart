import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/colors.dart';
import 'navegacao_app.dart' show AppShell;

enum AppDestination { mapa, missoes, inicio, feed, perfil }

/// Barra de navegação inferior com um único indicador que viaja entre as abas.
///
/// O indicador é uma cápsula: a borda da frente anda na frente da de trás, então
/// ela se alonga no meio do caminho e volta a ser um círculo ao chegar. Um
/// rastro fino em gradiente acompanha o movimento no topo da barra. Ícones e
/// rótulos reagem à proximidade do indicador, sem estado próprio, então uma troca
/// no meio de outra continua do ponto onde o indicador estava.
class AppBottomNavigation extends StatefulWidget {
  const AppBottomNavigation({
    super.key,
    required this.selected,
    required this.onSelected,
    this.destinations,
    this.daCasca = false,
  });

  final AppDestination selected;
  final ValueChanged<AppDestination> onSelected;
  final List<AppDestination>? destinations;

  /// Só a casca (`AppShell`) desenha a barra; as páginas dentro dela omitem a sua.
  final bool daCasca;

  @override
  State<AppBottomNavigation> createState() => _AppBottomNavigationState();
}

class _AppBottomNavigationState extends State<AppBottomNavigation>
    with SingleTickerProviderStateMixin {
  static const _duracao = Duration(milliseconds: 380);

  late final AnimationController _controle = AnimationController(
    vsync: this,
    duration: _duracao,
    value: 1,
  );

  // Curvas das duas bordas da cápsula e do rastro (a de trás atrasa).
  static final _frente = CurvedAnimationCurve(
    const Interval(0.0, 0.85, curve: Curves.easeInOutCubic),
  );
  static final _tras = CurvedAnimationCurve(
    const Interval(0.12, 1.0, curve: Curves.easeInOutCubic),
  );
  static final _rastro = CurvedAnimationCurve(
    const Interval(0.3, 1.0, curve: Curves.easeInOutCubic),
  );
  static const _desvanecer = Interval(0.65, 1.0, curve: Curves.easeOut);

  late double _de;
  late double _para;
  bool _semMovimento = false;

  List<AppDestination> get _itens =>
      widget.destinations ?? AppDestination.values;

  double get _indiceSelecionado {
    final i = _itens.indexOf(widget.selected);
    return (i < 0 ? 0 : i).toDouble();
  }

  @override
  void initState() {
    super.initState();
    _de = _para = _indiceSelecionado;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _semMovimento = MediaQuery.disableAnimationsOf(context);
  }

  @override
  void didUpdateWidget(covariant AppBottomNavigation antigo) {
    super.didUpdateWidget(antigo);
    final novo = _indiceSelecionado;
    if (novo == _para) return;
    // Continua de onde o indicador está agora, mesmo no meio de outra troca.
    _de = _centroAtual();
    _para = novo;
    if (_semMovimento) {
      _de = _para;
      _controle.value = 1;
    } else {
      _controle.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controle.dispose();
    super.dispose();
  }

  double _posFrente(double t) => _de + (_para - _de) * _frente.transform(t);
  double _posTras(double t) => _de + (_para - _de) * _tras.transform(t);
  double _posRastro(double t) => _de + (_para - _de) * _rastro.transform(t);
  double _centroAtual() {
    final t = _controle.value;
    return (_posFrente(t) + _posTras(t)) / 2;
  }

  /// Aba com o dedo em cima agora; só ela mostra feedback de pressão.
  AppDestination? _pressionada;

  void _tocar(AppDestination destino) {
    if (destino != widget.selected) HapticFeedback.selectionClick();
    widget.onSelected(destino);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.daCasca && AppShell.dentro(context)) {
      return const SizedBox.shrink();
    }
    final itens = _itens;
    // Destinos mudaram (permissões): reposiciona sem animar.
    if (_para >= itens.length || _de >= itens.length) {
      _de = _para = _indiceSelecionado;
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        // The reference has a 320 px wide screen and a 36 px home button.
        final scale = (constraints.maxWidth / 320).clamp(1.0, 1.25).toDouble();
        final bottomInset = MediaQuery.paddingOf(context).bottom;

        return Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(
              top: Radius.circular(24 * scale),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0F1B1340),
                blurRadius: 12,
                offset: Offset(0, -3),
              ),
            ],
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              3 * scale,
              0,
              3 * scale,
              bottomInset > 0 ? bottomInset : 12 * scale,
            ),
            child: SizedBox(
              height: 52 * scale,
              child: LayoutBuilder(
                builder: (context, interno) {
                  final larguraItem = interno.maxWidth / itens.length;
                  return AnimatedBuilder(
                    animation: _controle,
                    builder: (context, _) => _barra(itens, scale, larguraItem),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _barra(List<AppDestination> itens, double scale, double largura) {
    final t = _controle.value;
    final frente = _posFrente(t);
    final tras = _posTras(t);
    final raio = 18 * scale;
    double centro(double indice) => (indice + 0.5) * largura;

    // Alongamento limitado: em saltos longos (Mapa para Perfil) a cápsula não
    // vira uma faixa.
    final folga = largura * 1.1;
    var cFrente = centro(frente);
    var cTras = centro(tras);
    if ((cFrente - cTras).abs() > folga) {
      cTras = cFrente + (cTras < cFrente ? -folga : folga);
    }
    final esquerda = math.min(cFrente, cTras) - raio;
    final direita = math.max(cFrente, cTras) + raio;
    final meio = (frente + tras) / 2;

    // Rastro: do ponto mais atrasado até a frente, visível só durante a troca.
    final indoParaDireita = _para >= _de;
    var cRastro = centro(_posRastro(t));
    final maxRastro = largura * 2.2;
    if ((cFrente - cRastro).abs() > maxRastro) {
      cRastro = cFrente + (cRastro < cFrente ? -maxRastro : maxRastro);
    }
    final opacidade = t >= 1 ? 0.0 : 1 - _desvanecer.transform(t);
    final rastroEsq = math.min(cFrente, cRastro);
    final rastroDir = math.max(cFrente, cRastro);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        if (opacidade > 0.01 && rastroDir - rastroEsq > 2)
          Positioned(
            left: rastroEsq,
            width: rastroDir - rastroEsq,
            top: 0,
            height: 3 * scale,
            child: IgnorePointer(
              child: Opacity(
                opacity: opacidade,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(3),
                    gradient: LinearGradient(
                      begin: indoParaDireita
                          ? Alignment.centerLeft
                          : Alignment.centerRight,
                      end: indoParaDireita
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      colors: const [
                        Color(0x00420594),
                        Color(0xFF420594),
                        Color(0xFF8B5CF6),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        Positioned(
          left: esquerda,
          width: direita - esquerda,
          top: -7 * scale,
          height: 36 * scale,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(raio),
                color: AppColors.primary,
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x38420594),
                    blurRadius: 7,
                    offset: Offset(0, 3),
                  ),
                ],
              ),
            ),
          ),
        ),
        for (var i = 0; i < itens.length; i++)
          Positioned(
            left: i * largura,
            width: largura,
            top: 0,
            bottom: 0,
            child: _item(
              itens[i],
              scale,
              // 1 com o indicador sobre o item, 0 a um item de distância.
              ativacao: Curves.easeOut.transform(
                (1 - (meio - i).abs()).clamp(0.0, 1.0),
              ),
            ),
          ),
      ],
    );
  }

  Widget _item(
    AppDestination destination,
    double scale, {
    required double ativacao,
  }) {
    final isSelected = destination == widget.selected;
    final corIcone = Color.lerp(
      AppAccents.navigationMuted,
      Colors.white,
      ativacao,
    )!;
    final corRotulo = Color.lerp(
      AppAccents.navigationMuted,
      AppColors.primary,
      ativacao,
    )!;
    final label = switch (destination) {
      AppDestination.mapa => 'Mapa',
      AppDestination.missoes => 'Missões',
      AppDestination.inicio => 'Início',
      AppDestination.feed => 'Feed',
      AppDestination.perfil => 'Perfil',
    };

    final pressionada = _pressionada == destination;
    return Semantics(
      button: true,
      selected: isSelected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        key: ValueKey('aba-${destination.name}'),
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => setState(() => _pressionada = destination),
        onTapCancel: () {
          if (_pressionada == destination) setState(() => _pressionada = null);
        },
        onTapUp: (_) {
          if (_pressionada == destination) setState(() => _pressionada = null);
        },
        onTap: () => _tocar(destination),
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 90),
          opacity: pressionada ? 0.55 : 1,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              // O ícone sobe para dentro do indicador e cresce um pouco.
              Positioned(
                top: (10 - 9 * ativacao) * scale,
                child: Transform.scale(
                  scale: 1 + 0.1 * ativacao,
                  child: _icon(destination, corIcone, 20 * scale),
                ),
              ),
              Positioned(
                top: 33 * scale,
                child: Text(
                  label,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 10 * scale,
                    height: 1.2,
                    fontWeight: FontWeight.lerp(
                      FontWeight.w500,
                      FontWeight.w700,
                      ativacao,
                    ),
                    color: corRotulo,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _icon(AppDestination destination, Color color, double size) {
    if (destination == AppDestination.missoes) {
      return SizedBox.square(
        dimension: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(Icons.hexagon_outlined, color: color, size: size),
            Icon(Icons.star_border_rounded, color: color, size: size * 0.48),
          ],
        ),
      );
    }
    return Icon(
      switch (destination) {
        AppDestination.mapa => Icons.map_rounded,
        AppDestination.inicio => Icons.home_outlined,
        AppDestination.feed => Icons.feed_outlined,
        AppDestination.perfil => Icons.person_outline_rounded,
        AppDestination.missoes => Icons.hexagon_outlined,
      },
      color: color,
      size: size,
    );
  }
}

/// Adapta um [Curve] para uso direto como `transform(t)`.
class CurvedAnimationCurve {
  const CurvedAnimationCurve(this.curva);
  final Curve curva;
  double transform(double t) => curva.transform(t.clamp(0.0, 1.0));
}
