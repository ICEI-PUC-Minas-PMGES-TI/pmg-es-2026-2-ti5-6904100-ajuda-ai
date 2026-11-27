import 'dart:math' as math;

import 'package:flutter/material.dart';

class ConfeteCelebracao extends StatefulWidget {
  const ConfeteCelebracao({super.key, this.explodir = false});

  final bool explodir;

  @override
  State<ConfeteCelebracao> createState() => _ConfeteCelebracaoState();
}

class _ConfeteCelebracaoState extends State<ConfeteCelebracao>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animacao = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: widget.explodir ? 1700 : 2400),
  )..forward();

  @override
  void dispose() {
    _animacao.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) {
      return const SizedBox.shrink();
    }
    return IgnorePointer(
      child: CustomPaint(
        painter: _PintorConfete(_animacao, explodir: widget.explodir),
      ),
    );
  }
}

class _Pedaco {
  const _Pedaco(
    this.x,
    this.atraso,
    this.velocidade,
    this.oscilacao,
    this.giro,
    this.largura,
    this.cor,
  );

  final double x;
  final double atraso;
  final double velocidade;
  final double oscilacao;
  final double giro;
  final double largura;
  final Color cor;
}

class _PintorConfete extends CustomPainter {
  _PintorConfete(this.animacao, {required this.explodir})
    : super(repaint: animacao);

  final Animation<double> animacao;
  final bool explodir;

  static final List<_Pedaco> _pedacos = (() {
    final sorteio = math.Random(42);
    const cores = [
      Color(0xFFFBBF24),
      Color(0xFF6F35B9),
      Color(0xFFB99BFF),
      Color(0xFFE897B7),
      Color(0xFFFFFFFF),
    ];
    return List.generate(72, (i) {
      return _Pedaco(
        sorteio.nextDouble(),
        sorteio.nextDouble() * 0.28,
        0.72 + sorteio.nextDouble() * 0.38,
        8 + sorteio.nextDouble() * 18,
        sorteio.nextDouble() * math.pi * 2,
        3 + sorteio.nextDouble() * 4,
        cores[i % cores.length],
      );
    });
  })();

  @override
  void paint(Canvas canvas, Size size) {
    final tempo = animacao.value;
    final tinta = Paint();
    for (final pedaco in _pedacos) {
      if (explodir) {
        final angulo = pedaco.x * math.pi * 2;
        final passo = ((tempo - pedaco.atraso * 0.25) / 0.85).clamp(0.0, 1.0);
        if (passo == 0 || passo == 1) continue;
        final distancia =
            (size.shortestSide * 0.62) *
            pedaco.velocidade *
            (1 - (1 - passo) * (1 - passo));
        final centro = Offset(size.width / 2, size.height * 0.47);
        final x = centro.dx + math.cos(angulo) * distancia;
        final y =
            centro.dy +
            math.sin(angulo) * distancia +
            passo * passo * size.height * 0.12;
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(pedaco.giro + passo * math.pi * 3);
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset.zero,
              width: pedaco.largura,
              height: pedaco.largura * 1.7,
            ),
            const Radius.circular(1),
          ),
          tinta..color = pedaco.cor.withValues(alpha: 1 - passo),
        );
        canvas.restore();
        continue;
      }
      final passo = ((tempo - pedaco.atraso) / (1 - pedaco.atraso)).clamp(
        0.0,
        1.0,
      );
      if (passo == 0 || passo == 1) continue;
      final x =
          size.width * pedaco.x +
          math.sin(passo * math.pi * 3 + pedaco.giro) * pedaco.oscilacao;
      final y = -16 + passo * size.height * pedaco.velocidade;
      final opacidade = ((1 - passo) * 3).clamp(0.0, 1.0);
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(pedaco.giro + passo * math.pi * 3);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset.zero,
            width: pedaco.largura,
            height: pedaco.largura * 1.7,
          ),
          const Radius.circular(1),
        ),
        tinta..color = pedaco.cor.withValues(alpha: opacidade),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _PintorConfete oldDelegate) => false;
}
