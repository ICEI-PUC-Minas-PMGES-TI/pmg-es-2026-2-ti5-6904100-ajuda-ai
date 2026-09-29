import 'package:flutter/material.dart';

import '../theme/colors.dart';

class IndicadorPasso extends StatelessWidget {
  const IndicadorPasso({super.key, required this.passo, required this.total});

  final int passo;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 1; i <= total; i++) ...[
              if (i > 1) const SizedBox(width: 4),
              Container(
                width: 26,
                height: 5,
                decoration: BoxDecoration(
                  color: i <= passo ? AppColors.primary : AppAccents.cardBorder,
                  borderRadius: BorderRadius.circular(5),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Passo $passo de $total',
          style: const TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}
