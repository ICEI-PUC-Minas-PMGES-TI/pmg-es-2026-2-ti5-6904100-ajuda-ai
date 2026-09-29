import 'package:flutter/material.dart';

import '../theme/colors.dart';

class CabecalhoLogos extends StatelessWidget {
  const CabecalhoLogos({super.key, this.acao});

  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Tooltip(
          message: 'Voltar',
          child: InkResponse(
            onTap: () => Navigator.of(context).maybePop(),
            radius: 20,
            child: const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Icon(
                Icons.arrow_back_ios_new,
                size: 18,
                color: AppColors.primary,
              ),
            ),
          ),
        ),
        Image.asset('assets/images/logo.png', height: 28),
        Container(
          width: 1,
          height: 24,
          margin: const EdgeInsets.symmetric(horizontal: 10),
          color: AppColors.muted.withValues(alpha: 0.35),
        ),
        Image.asset('assets/images/puclogo.png', height: 32),
        const Spacer(),
        ?acao,
      ],
    );
  }
}
