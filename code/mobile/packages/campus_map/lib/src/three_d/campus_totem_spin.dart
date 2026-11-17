import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Giro do topo do totem, copiado do PUCMaps (`MapRenderer._startTopSpin`):
/// a velocidade do arraste vira um giro que freia por atrito constante.
abstract final class CampusTotemSpin {
  /// Velocidade inicial (graus/s) por pixel/ms de arraste.
  static const speedPerVelocity = 500.0;

  /// Quanto a velocidade cai por segundo. Menor = freia mais devagar.
  static const deceleration = 200.0;

  /// Giro mínimo para contar como interação (toque parado não gira).
  static const minDegrees = 24.0;
  static const maxSpeed = 1200.0;
  static const maxSeconds = 4.5;

  /// Janela de amostras do arraste usada na velocidade de soltura.
  static const sampleWindow = Duration(milliseconds: 90);

  /// Câmera do foco no totem (PUCMaps `_focusTotem`).
  static const focusZoom = 21.25;
  static const focusPitch = 72.0;
  static const focusBearing = 18.1;

  /// Topo da tela reservado para o totem aparecer inteiro (PUCMaps usava
  /// 560 px num aparelho de ~915 px).
  static const focusTopFraction = 0.6;

  /// Graus e duração do giro para a velocidade de soltura [velocityPxPerMs];
  /// `null` quando o arraste foi curto ou lento demais.
  static ({double degrees, Duration duration, double energy})? fromVelocity(
    double velocityPxPerMs,
  ) {
    final speed = (velocityPxPerMs.abs() * speedPerVelocity)
        .clamp(0.0, maxSpeed)
        .toDouble();
    final seconds = (speed / deceleration).clamp(0.0, maxSeconds).toDouble();
    final degrees = velocityPxPerMs.sign * speed * seconds / 2;
    if (degrees.abs() < minDegrees) return null;
    return (
      degrees: degrees,
      duration: Duration(milliseconds: (seconds * 1000).round()),
      energy: (degrees.abs() / 900).clamp(0.45, 1.0).toDouble(),
    );
  }

  /// Ângulo no instante [t] (0..1) da animação: atrito constante.
  static double at(double from, double degrees, double t) {
    final eased = 1 - (1 - t) * (1 - t);
    return from + degrees * eased;
  }

  /// Velocidade (px/ms) entre a primeira e a última amostra do arraste.
  static double releaseVelocity(List<(Duration, double)> samples) {
    if (samples.length < 2) return 0;
    final first = samples.first;
    final last = samples.last;
    final dtMs = (last.$1 - first.$1).inMicroseconds / 1000;
    if (dtMs < 8) return 0;
    return (last.$2 - first.$2) / dtMs;
  }

  static List<CampusTotemSparkle> sparkles(double energy, math.Random random) {
    final count = (36 + energy * 34).round();
    const colors = <Color>[
      Color(0xFFFFE7A3),
      Color(0xFFFFD56A),
      Color(0xFFFFF8E8),
      Color(0xFFE8A317),
      Color(0xFF8EC5FF),
      Color(0xFFFF8AA8),
    ];
    return List.generate(count, (index) {
      return CampusTotemSparkle(
        angle: random.nextDouble() * math.pi * 2,
        distance: 0.1 + random.nextDouble() * 0.38 * energy,
        size: (index < 8 ? 12 : 4) + random.nextDouble() * 10 * energy,
        spin: (random.nextDouble() - 0.5) * 2.4,
        color: colors[index % colors.length],
        delay: random.nextDouble() * 0.22,
        rise: 0.05 + random.nextDouble() * 0.14,
        dx: (random.nextDouble() - 0.5) * 0.12,
        dy: (random.nextDouble() - 0.35) * 0.06,
        kind: random.nextInt(3),
      );
    });
  }
}

class CampusTotemSparkle {
  const CampusTotemSparkle({
    required this.angle,
    required this.distance,
    required this.size,
    required this.spin,
    required this.color,
    required this.delay,
    required this.rise,
    required this.dx,
    required this.dy,
    required this.kind,
  });

  final double angle;
  final double distance;
  final double size;
  final double spin;
  final Color color;
  final double delay;
  final double rise;
  final double dx;
  final double dy;
  final int kind;
}

/// Brilho durante o giro e explosão de faíscas da recompensa
/// (`_TotemRewardPainter` do PUCMaps). Desenhado sobre o mapa, ancorado onde
/// a câmera do foco põe o topo do totem.
class CampusTotemRewardPainter extends CustomPainter {
  const CampusTotemRewardPainter({
    required this.spinProgress,
    required this.rewardProgress,
    required this.energy,
    required this.sparkles,
  });

  /// 0..1 durante o giro; negativo fora dele.
  final double spinProgress;

  /// 0..1 durante a recompensa; negativo fora dela.
  final double rewardProgress;
  final double energy;
  final List<CampusTotemSparkle> sparkles;

  static const _colors = <Color>[
    Color(0xFFFFE7A3),
    Color(0xFFFFD56A),
    Color(0xFFFFF8E8),
    Color(0xFFE8A317),
    Color(0xFF8EC5FF),
    Color(0xFFFF8AA8),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final anchor = Offset(size.width * 0.5, size.height * 0.27);
    if (spinProgress >= 0) _paintSpinGlow(canvas, size, anchor);
    if (rewardProgress >= 0) _paintReward(canvas, size, anchor);
  }

  void _paintSpinGlow(Canvas canvas, Size size, Offset anchor) {
    final speed = (1 - spinProgress).clamp(0.0, 1.0);
    if (speed < 0.03) return;
    final glowRadius = size.shortestSide * (0.07 + 0.07 * speed * energy);
    canvas.drawCircle(
      anchor,
      glowRadius,
      Paint()
        ..shader = ui.Gradient.radial(anchor, glowRadius, [
          const Color(0xFFFFE7A3).withValues(alpha: 0.34 * speed),
          const Color(0xFFFFE7A3).withValues(alpha: 0),
        ]),
    );
    final paint = Paint()..style = PaintingStyle.fill;
    const slots = 18;
    for (var i = 0; i < slots; i++) {
      final cycle = (spinProgress * (5 + energy * 8) + i * 0.173) % 1.0;
      if (cycle > 0.86) continue;
      final life = math.sin(cycle / 0.86 * math.pi) * speed;
      if (life <= 0.04) continue;
      final angle = i * 2.399 + spinProgress * math.pi * (3 + energy * 5);
      final reach = size.shortestSide * (0.045 + cycle * 0.15 * energy);
      final center =
          anchor +
          Offset(
            math.cos(angle) * reach,
            math.sin(angle) * reach * 0.7 - cycle * size.height * 0.03,
          );
      final radius = (2.4 + (i % 3) * 1.6) * (0.65 + energy * 0.7);
      paint.color = _colors[i % _colors.length].withValues(alpha: life);
      if (i % 3 == 0) {
        _drawStar(canvas, center, radius, angle, paint);
      } else {
        canvas.drawCircle(center, radius * 0.42, paint);
      }
    }
  }

  void _paintReward(Canvas canvas, Size size, Offset anchor) {
    final progress = rewardProgress;
    final flash = (1 - (progress / 0.34)).clamp(0.0, 1.0);
    if (flash > 0) {
      final glowRadius = size.shortestSide * (0.22 + 0.16 * (1 - flash));
      canvas.drawCircle(
        anchor,
        glowRadius,
        Paint()
          ..shader = ui.Gradient.radial(anchor, glowRadius, [
            const Color(0xFFFFF4CC).withValues(alpha: 0.82 * flash),
            const Color(0xFFFFD56A).withValues(alpha: 0.28 * flash),
            const Color(0xFFFFE7A3).withValues(alpha: 0),
          ]),
      );
    }
    _drawRing(canvas, size, anchor, progress, 0, 0.46);
    _drawRing(canvas, size, anchor, progress, 0.12, 0.34);
    final paint = Paint()..style = PaintingStyle.fill;
    for (final sparkle in sparkles) {
      final span = 1 - sparkle.delay;
      final local = ((progress - sparkle.delay) / span).clamp(0.0, 1.0);
      if (local <= 0) continue;
      final travel = 1 - (1 - local) * (1 - local);
      final fadeIn = (local / 0.12).clamp(0.0, 1.0);
      final fadeOut = local < 0.42 ? 1.0 : (1 - (local - 0.42) / 0.58);
      final opacity = (fadeIn * fadeOut).clamp(0.0, 1.0);
      if (opacity <= 0) continue;
      final reach = sparkle.distance * size.shortestSide * travel;
      final center =
          anchor +
          Offset(
            sparkle.dx * size.width + math.cos(sparkle.angle) * reach,
            sparkle.dy * size.height +
                math.sin(sparkle.angle) * reach * 0.85 -
                sparkle.rise * size.height * travel,
          );
      final radius = sparkle.size * (0.75 + 0.25 * math.sin(local * math.pi));
      paint.color = sparkle.color.withValues(alpha: opacity);
      if (sparkle.kind == 0) {
        _drawStar(canvas, center, radius, sparkle.spin * local, paint);
      } else if (sparkle.kind == 1) {
        canvas.drawCircle(center, radius * 0.42, paint);
      } else {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: center,
              width: radius,
              height: radius * 1.6,
            ),
            Radius.circular(radius),
          ),
          paint,
        );
      }
    }
  }

  void _drawRing(
    Canvas canvas,
    Size size,
    Offset anchor,
    double progress,
    double delay,
    double maxRadius,
  ) {
    final local = ((progress - delay) / (0.72 - delay)).clamp(0.0, 1.0);
    if (local <= 0 || local >= 1) return;
    final radius = size.shortestSide * (0.04 + maxRadius * local);
    canvas.drawCircle(
      anchor,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.5 * (1 - local) + 1.2
        ..color = const Color(0xFFFFE7A3).withValues(alpha: (1 - local) * 0.9),
    );
  }

  void _drawStar(
    Canvas canvas,
    Offset center,
    double radius,
    double rotation,
    Paint paint,
  ) {
    final path = Path();
    const points = 4;
    for (var i = 0; i < points * 2; i++) {
      final arm = i.isEven ? radius : radius * 0.38;
      final angle = rotation + i * math.pi / points - math.pi / 2;
      final point = Offset(
        center.dx + math.cos(angle) * arm,
        center.dy + math.sin(angle) * arm,
      );
      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
    }
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(CampusTotemRewardPainter oldDelegate) =>
      oldDelegate.spinProgress != spinProgress ||
      oldDelegate.rewardProgress != rewardProgress ||
      oldDelegate.energy != energy ||
      oldDelegate.sparkles != sparkles;
}
