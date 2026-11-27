import 'package:flutter/material.dart';

import '../theme/colors.dart';

class AvatarUsuario extends StatelessWidget {
  const AvatarUsuario({
    super.key,
    required this.iniciais,
    this.fotoUrl,
    this.tamanho = 44,
    this.cor = AppColors.primary,
  });

  final String iniciais;
  final String? fotoUrl;
  final double tamanho;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final fallback = Center(
      child: Text(
        iniciais,
        style: TextStyle(
          color: cor,
          fontSize: tamanho * 0.34,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
    return Container(
      width: tamanho,
      height: tamanho,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: cor.withValues(alpha: 0.13),
        border: Border.all(color: cor.withValues(alpha: 0.3), width: 1.5),
      ),
      child: fotoUrl == null || fotoUrl!.isEmpty
          ? fallback
          : Image.network(
              fotoUrl!,
              width: tamanho,
              height: tamanho,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => fallback,
            ),
    );
  }
}
