import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/colors.dart';
import 'tela_configuracoes.dart';

class SuporteConfigPage extends StatelessWidget {
  const SuporteConfigPage({super.key});

  static const emailCoordenacao = 'renata@pucminas.edu.br';

  static const _faq = [
    (
      'Como funciona o apadrinhamento?',
      'Calouros (1º período) são acompanhados por alunos mais experientes. '
          'A coordenação analisa as candidaturas de padrinho e forma os grupos.',
    ),
    (
      'Quem pode ser padrinho?',
      'Alunos a partir do 2º período que cumpram os requisitos definidos '
          'pela coordenação para o semestre (mostrados na candidatura).',
    ),
    (
      'Quando vou saber quem é meu padrinho?',
      'Na etapa de formação dos grupos. Você recebe uma notificação e o '
          'padrinho aparece no seu perfil.',
    ),
    (
      'Posso editar minha candidatura?',
      'Sim, enquanto ela estiver aguardando análise. Use "Editar '
          'candidatura" na tela de status.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return EstruturaConfig(
      titulo: 'Suporte',
      subtitulo: 'Perguntas frequentes e contato com a coordenação.',
      children: [
        for (final (pergunta, resposta) in _faq)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppAccents.cardBorder),
            ),
            child: ExpansionTile(
              shape: const Border(),
              collapsedShape: const Border(),
              iconColor: AppColors.primary,
              title: Text(
                pergunta,
                style: const TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              expandedAlignment: Alignment.centerLeft,
              children: [
                Text(
                  resposta,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.lavender,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Fale com a coordenação',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Envie um e-mail para $emailCoordenacao com seu nome e '
                'e-mail institucional.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(
                    const ClipboardData(text: emailCoordenacao),
                  );
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context)
                    ..hideCurrentSnackBar()
                    ..showSnackBar(
                      const SnackBar(content: Text('E-mail copiado.')),
                    );
                },
                icon: const Icon(Icons.copy, size: 18),
                label: const Text('Copiar e-mail'),
                style: TextButton.styleFrom(foregroundColor: AppColors.primary),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
