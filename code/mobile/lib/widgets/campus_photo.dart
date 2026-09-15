import 'package:flutter/material.dart';

import '../theme/colors.dart';

class CampusPhoto extends StatelessWidget {
  const CampusPhoto({super.key});

  static double heightFor(BuildContext context) =>
      (MediaQuery.sizeOf(context).height * 0.27).clamp(130.0, 260.0);

  @override
  Widget build(BuildContext context) {
    final height = heightFor(context);

    return IgnorePointer(
      child: ClipRRect(
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(height * 0.08),
          bottomRight: Radius.circular(height * 0.08),
        ),
        child: SizedBox(
          height: height,
          child: Stack(
            fit: StackFit.expand,
            children: [
              ClipPath(
                clipper: const _WaveClipper(photoEdge: false),
                child: const ColoredBox(color: AppColors.lavender),
              ),
              ClipPath(
                clipper: const _WaveClipper(photoEdge: true),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Transform.scale(
                      scale: 1.07,
                      alignment: Alignment.centerRight,
                      child: Image.asset(
                        'assets/images/pucjardim.png',
                        fit: BoxFit.cover,
                        alignment: Alignment.center,
                      ),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                          colors: [
                            Color(0xA05B2D90),
                            Color(0x705B2D90),
                            Color(0x545B2D90),
                          ],
                          stops: [0.0, 0.45, 1.0],
                        ),
                      ),
                    ),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [Color(0x332E1358), Color(0x002E1358)],
                          stops: [0.0, 0.40],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WaveClipper extends CustomClipper<Path> {
  const _WaveClipper({required this.photoEdge});

  final bool photoEdge;

  @override
  Path getClip(Size size) {
    final w = size.width;
    final h = size.height;
    final path = Path();
    if (photoEdge) {
      path
        ..moveTo(0, h * 0.106)
        ..cubicTo(w * 0.10, h * 0.03, w * 0.22, h * 0.025, w * 0.48, h * 0.20)
        ..cubicTo(w * 0.66, h * 0.32, w * 0.76, h * 0.37, w, h * 0.117);
    } else {
      path
        ..moveTo(0, h * 0.04)
        ..cubicTo(w * 0.12, h * -0.015, w * 0.23, h * -0.02, w * 0.48, h * 0.17)
        ..cubicTo(w * 0.63, h * 0.26, w * 0.75, h * 0.29, w, h * 0.045);
    }

    return path
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
  }

  @override
  bool shouldReclip(_WaveClipper old) => old.photoEdge != photoEdge;
}
