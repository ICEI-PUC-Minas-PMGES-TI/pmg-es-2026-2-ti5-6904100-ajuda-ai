import 'package:flutter/material.dart';

import '../sessao_usuario.dart';
import '../theme/colors.dart';
import 'tela_configuracoes.dart';

/// Tamanho do texto aplicado no app inteiro (via `MediaQuery.textScaler`
/// em `main.dart`).
class AparenciaConfigPage extends StatelessWidget {
  const AparenciaConfigPage({super.key});

  static const opcoes = <(double, String)>[
    (1.0, 'Padrão'),
    (1.15, 'Grande'),
    (1.3, 'Muito grande'),
  ];

  @override
  Widget build(BuildContext context) {
    final escala = SessaoUsuario.atual.escalaTexto;
    return EstruturaConfig(
      titulo: 'Aparência e Acessibilidade',
      subtitulo: 'Ajuste o tamanho do texto para ler com mais conforto.',
      children: [
        const Text(
          'Tamanho do texto',
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.ink,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        ValueListenableBuilder<double>(
          valueListenable: escala,
          builder: (context, valor, _) => Column(
            children: [
              for (final (fator, rotulo) in opcoes)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: valor == fator
                          ? AppColors.primary
                          : AppAccents.cardBorder,
                    ),
                  ),
                  child: ListTile(
                    leading: Icon(
                      valor == fator
                          ? Icons.radio_button_checked
                          : Icons.radio_button_unchecked,
                      color: AppColors.primary,
                    ),
                    title: Text(
                      rotulo,
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        color: AppColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    onTap: () => escala.value = fator,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.lavender,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Text(
            'Prévia: assim ficam os textos do Ajuda-aí com o tamanho escolhido.',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.ink,
              fontSize: 14,
              height: 1.4,
            ),
          ),
        ),
        const NotaConfig(
          'A escolha soma-se ao tamanho de fonte definido no sistema.',
        ),
      ],
    );
  }
}
