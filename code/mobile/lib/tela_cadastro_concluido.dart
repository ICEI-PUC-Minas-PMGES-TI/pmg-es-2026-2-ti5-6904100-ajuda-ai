import 'package:flutter/material.dart';

import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';
import 'theme/colors.dart';
import 'widgets/campos_cadastro.dart';
import 'widgets/painel_notificacoes.dart';

class CadastroConcluidoPage extends StatelessWidget {
  const CadastroConcluidoPage({super.key});

  void _irParaPerfil(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => const AppShell(inicial: AppDestination.perfil),
      ),
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
                                  _Topo(
                                    onNotificacoes: () =>
                                        mostrarNotificacoes(context),
                                  ),
                                  const Spacer(),
                                  Image.asset(
                                    'assets/images/perfilcheck.png',
                                    height: (altura * 0.25).clamp(150.0, 240.0),
                                    cacheWidth: 800,
                                    semanticLabel: 'Cadastro enviado',
                                  ),
                                  const SizedBox(height: 20),
                                  const _Mensagem(),
                                  const SizedBox(height: 20),
                                  const Spacer(),
                                  const _Etapa(
                                    icone: Icons.schedule,
                                    corFundo: AppAccents.tileLilas,
                                    corIcone: AppColors.primary,
                                    titulo: 'O que acontece agora?',
                                    descricao:
                                        'A coordenação analisa seu cadastro. Após '
                                        'a aprovação, você entra na formação dos '
                                        'grupos.',
                                  ),
                                  const _Etapa(
                                    icone: Icons.person_outline,
                                    corFundo: AppAccents.tileLilas,
                                    corIcone: AppColors.primary,
                                    titulo: 'Acompanhe pelo perfil',
                                    descricao:
                                        'Você poderá consultar o andamento do seu '
                                        'cadastro na área de perfil.',
                                  ),
                                  const _Etapa(
                                    icone: Icons.auto_awesome_outlined,
                                    corFundo: AppAccents.tileLaranja,
                                    corIcone: AppAccents.iconeLaranja,
                                    titulo: 'Fique de olho nas notificações!',
                                    descricao:
                                        'Avisaremos por aqui quando seu padrinho '
                                        'estiver disponível.',
                                  ),
                                  const Spacer(),
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
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: BotaoCadastro(
                    texto: 'Ir para meu perfil',
                    onPressed: () => _irParaPerfil(context),
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
  const _Topo({required this.onNotificacoes});

  final VoidCallback onNotificacoes;

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
        const Spacer(),
        IconButton(
          onPressed: onNotificacoes,
          icon: const Icon(Icons.notifications_none_rounded),
          color: AppColors.primary,
          tooltip: 'Notificações',
        ),
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
          'Cadastro enviado!',
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
          'Agora ele aguarda a aprovação da coordenação.',
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
          'Suas informações foram enviadas com sucesso. Depois que a '
          'coordenação aprovar seu cadastro, ela vai usar seus dados para '
          'encontrar um padrinho compatível com você.',
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

class _Etapa extends StatelessWidget {
  const _Etapa({
    required this.icone,
    required this.corFundo,
    required this.corIcone,
    required this.titulo,
    required this.descricao,
  });

  final IconData icone;
  final Color corFundo;
  final Color corIcone;
  final String titulo;
  final String descricao;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: corFundo.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: corFundo,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icone, color: corIcone, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.ink,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  descricao,
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
    );
  }
}
