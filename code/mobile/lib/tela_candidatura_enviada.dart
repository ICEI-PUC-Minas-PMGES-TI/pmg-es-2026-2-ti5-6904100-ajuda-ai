import 'package:flutter/material.dart';

import 'tela_perfil.dart';
import 'tela_status_candidatura.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';

class CandidaturaEnviadaPage extends StatelessWidget {
  const CandidaturaEnviadaPage({super.key});

  void _irParaPerfil(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ProfilePage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              children: [
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final altura = constraints.maxHeight;
                      return SingleChildScrollView(
                        child: ConstrainedBox(
                          constraints: BoxConstraints(minHeight: altura),
                          child: IntrinsicHeight(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                              child: Column(
                                children: [
                                  const _Topo(),
                                  const Spacer(),
                                  Image.asset(
                                    'assets/images/perfilcheck.png',
                                    height: (altura * 0.22).clamp(130.0, 200.0),
                                    cacheWidth: 800,
                                    semanticLabel: 'Candidatura enviada',
                                  ),
                                  const SizedBox(height: 18),
                                  const _Mensagem(),
                                  const SizedBox(height: 28),
                                  const Spacer(flex: 2),
                                  const _ProximosPassos(),
                                  const Spacer(flex: 1),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                  child: Column(
                    children: [
                      BotaoCadastro(
                        texto: 'Ir para meu perfil',
                        onPressed: () => _irParaPerfil(context),
                      ),
                      const SizedBox(height: 6),
                      TextButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const StatusCandidaturaPage(),
                          ),
                        ),
                        icon: const Icon(Icons.timeline, size: 18),
                        label: const Text('Acompanhar status da candidatura'),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          textStyle: const TextStyle(
                            fontFamily: 'Inter',
                            fontWeight: FontWeight.w600,
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
      ),
    );
  }
}

class _Topo extends StatelessWidget {
  const _Topo();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Image.asset('assets/images/logo.png', height: 30),
        Container(
          width: 1,
          height: 26,
          margin: const EdgeInsets.symmetric(horizontal: 10),
          color: AppColors.muted.withValues(alpha: 0.35),
        ),
        Image.asset('assets/images/puclogo.png', height: 34),
      ],
    );
  }
}

class _Mensagem extends StatelessWidget {
  const _Mensagem();

  @override
  Widget build(BuildContext context) {
    return const Column(
      children: [
        Text(
          'Candidatura enviada!',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.ink,
            fontSize: 28,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
          ),
        ),
        SizedBox(height: 4),
        Text(
          'Agora é só aguardar a análise.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.primary,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        SizedBox(height: 14),
        Text(
          'Recebemos sua candidatura para participar do Ajuda Aí como '
          'padrinho. A coordenação irá analisar suas informações antes de '
          'confirmar sua participação no programa.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Inter',
            color: AppColors.muted,
            fontSize: 14,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}

class _ProximosPassos extends StatelessWidget {
  const _ProximosPassos();

  static const _itens = [
    (
      Icons.fact_check_outlined,
      'Análise da candidatura',
      'A coordenação irá revisar as informações enviadas.',
    ),
    (
      Icons.person_outline,
      'Acompanhe pelo perfil',
      'Você poderá acompanhar o status da sua candidatura pelo seu perfil.',
    ),
    (
      Icons.notifications_none_rounded,
      'Notificação',
      'Você será avisado quando houver uma atualização sobre sua candidatura.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppAccents.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'O que acontece agora?',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.ink,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < _itens.length; i++) ...[
            if (i > 0) ...[
              const SizedBox(height: 12),
              const Divider(height: 1, color: AppAccents.cardBorder),
              const SizedBox(height: 12),
            ],
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(_itens[i].$1, size: 20, color: AppColors.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _itens[i].$2,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.ink,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _itens[i].$3,
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          color: AppColors.muted,
                          fontSize: 12,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
