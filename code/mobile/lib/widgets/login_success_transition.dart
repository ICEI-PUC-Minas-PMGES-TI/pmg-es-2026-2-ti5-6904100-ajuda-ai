import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/colors.dart';

class LoginSuccessTransition extends StatefulWidget {
  const LoginSuccessTransition({
    super.key,
    required this.background,
    required this.destination,
    this.onComplete,
  });

  final Widget background;
  final Widget destination;
  final VoidCallback? onComplete;

  @override
  State<LoginSuccessTransition> createState() => _LoginSuccessTransitionState();
}

class _LoginSuccessTransitionState extends State<LoginSuccessTransition>
    with SingleTickerProviderStateMixin {
  static const int _revealMs = 100;
  static const int _rotationMs = 1200;
  static const int _pauseMs = 100;
  static const int _zoomStartMs = _revealMs + _rotationMs + _pauseMs;
  static const int _purpleStartMs = _zoomStartMs + 250;
  static const int _homeStartMs = _zoomStartMs + 350;
  static const int _crossfadeMs = 450;
  static const int _totalMs = _homeStartMs + _crossfadeMs;
  static const double _perspective = 0.0015;
  static const double _zoomOverscan = 2;
  static const double _homeTranslateY = 8;
  static const double _homeInitialScale = 1.015;

  late final AnimationController _controller =
      AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: _totalMs),
      )..addStatusListener((status) {
        if (status == AnimationStatus.completed) widget.onComplete?.call();
      });
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      if (MediaQuery.disableAnimationsOf(context)) {
        _controller.duration = const Duration(milliseconds: 200);
      }
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  double _progress(int start, int end, Curve curve) => Interval(
    start / _totalMs,
    end / _totalMs,
    curve: curve,
  ).transform(_controller.value);

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final size = MediaQuery.sizeOf(context);
    final width = math.min(200.0, size.width * 0.48);
    final zoom =
        math.max(size.width / width, size.height / (width * 900 / 660)) *
        _zoomOverscan;

    // Static children: neither the Home nor the SVG rebuild on animation ticks.
    final home = RepaintBoundary(child: widget.destination);
    final login = RepaintBoundary(
      child: ImageFiltered(
        imageFilter: ui.ImageFilter.blur(sigmaX: 4, sigmaY: 4),
        child: RepaintBoundary(child: widget.background),
      ),
    );

    return ClipRect(
      child: AnimatedBuilder(
        animation: _controller,
        child: RepaintBoundary(
          child: SvgPicture.asset(
            'assets/images/puc-login.svg',
            width: width,
            excludeFromSemantics: true,
          ),
        ),
        builder: (context, crest) {
          final t = _controller.value;
          final complete = _controller.isCompleted;
          final reveal = _progress(0, _revealMs, Curves.easeOut);
          final turn = _progress(
            _revealMs,
            _revealMs + _rotationMs,
            Curves.easeInOutCubic,
          );
          final grow = _progress(_zoomStartMs, _totalMs, Curves.easeInOutCubic);
          final homeProgress = reducedMotion
              ? Curves.easeOutCubic.transform(t)
              : _progress(_homeStartMs, _totalMs, Curves.easeOutCubic);
          final purple = reducedMotion
              ? 0.0
              : _progress(_purpleStartMs, _homeStartMs, Curves.easeInOut) *
                    (1 - homeProgress);
          final angle = reducedMotion ? 0.0 : turn * 2 * math.pi;
          final showFront = angle <= math.pi / 2 || angle >= 3 * math.pi / 2;

          return PopScope(
            canPop: complete,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Always opaque: no default Scaffold/blank frame during blending.
                const ColoredBox(color: AppAccents.headerBottom),
                IgnorePointer(
                  ignoring: !complete,
                  child: ExcludeSemantics(
                    excluding: !complete,
                    child: Opacity(
                      key: const ValueKey('home-fade'),
                      opacity: homeProgress,
                      child: Transform.translate(
                        offset: Offset(
                          0,
                          reducedMotion
                              ? 0
                              : _homeTranslateY * (1 - homeProgress),
                        ),
                        child: Transform.scale(
                          scale: reducedMotion
                              ? 1
                              : 1 +
                                    (_homeInitialScale - 1) *
                                        (1 - homeProgress),
                          child: home,
                        ),
                      ),
                    ),
                  ),
                ),
                if (!complete) ...[
                  ExcludeSemantics(
                    child: IgnorePointer(
                      child: Opacity(opacity: 1 - homeProgress, child: login),
                    ),
                  ),
                  IgnorePointer(
                    child: Semantics(
                      label: 'Abrindo a tela inicial.',
                      liveRegion: true,
                      child: Center(
                        child: Opacity(
                          key: const ValueKey('crest-fade'),
                          opacity: reveal * (1 - homeProgress),
                          child: Transform.scale(
                            key: const ValueKey('crest-zoom'),
                            scale: reducedMotion ? 1 : 1 + (zoom - 1) * grow,
                            child: Transform(
                              key: const ValueKey('crest-turn'),
                              alignment: Alignment.center,
                              transform: Matrix4.identity()
                                ..setEntry(3, 2, _perspective)
                                ..rotateY(angle),
                              child: Transform(
                                key: const ValueKey('crest-back'),
                                alignment: Alignment.center,
                                transform: Matrix4.identity()
                                  ..rotateY(showFront ? 0 : math.pi),
                                child: crest,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  IgnorePointer(
                    child: Opacity(
                      key: const ValueKey('purple-fade'),
                      opacity: purple,
                      child: const ColoredBox(color: AppAccents.headerBottom),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
