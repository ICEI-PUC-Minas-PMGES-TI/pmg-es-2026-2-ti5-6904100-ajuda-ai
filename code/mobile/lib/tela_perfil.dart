import 'package:flutter/material.dart';

import 'tela_feed.dart';
import 'tela_home.dart';
import 'tela_login.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Image.asset('assets/images/logo.png', height: 34),
                  const SizedBox(width: 10),
                  Container(width: 1, height: 28, color: AppColors.muted),
                  const SizedBox(width: 10),
                  Image.asset('assets/images/puclogo.png', height: 34),
                  const Spacer(),
                  IconButton(
                    onPressed: () {},
                    tooltip: 'Configurações',
                    icon: const Icon(Icons.settings_outlined),
                    color: AppColors.ink,
                  ),
                ],
              ),
              const SizedBox(height: 20),
              const Text(
                'Perfil',
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Gerencie suas informações e preferências.',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 22),
              const _ProfileHeader(),
              const SizedBox(height: 16),
              const _AboutCard(),
              const SizedBox(height: 22),
              const Text(
                'Informações acadêmicas',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              const _AcademicCard(),
              const SizedBox(height: 22),
              const Text(
                'Preferências',
                style: TextStyle(
                  fontFamily: 'Inter',
                  color: AppColors.muted,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              const _PreferencesCard(),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton.icon(
                  onPressed: () => _logout(context),
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Sair da conta'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFFFEEF5),
                    foregroundColor: const Color(0xFFD21F63),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    textStyle: const TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const _ProfileNavigation(),
    );
  }

  void _logout(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              ClipOval(
                child: Image.asset(
                  'assets/images/pucjardim.png',
                  width: 92,
                  height: 92,
                  fit: BoxFit.cover,
                ),
              ),
              Positioned(
                right: -5,
                bottom: -3,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    color: Color(0xFFE8D8FF),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.edit_outlined,
                    color: AppColors.primary,
                    size: 18,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 16),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Camila Andrade',
                  style: TextStyle(
                    color: AppColors.ink,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SizedBox(height: 5),
                Text(
                  'Engenharia de Software',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 14,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  '6º período • Noite',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 14,
                  ),
                ),
                SizedBox(height: 8),
                _RoleBadge(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleBadge extends StatelessWidget {
  const _RoleBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xFFE8D8FF),
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Text(
        'Estudante',
        style: TextStyle(
          fontFamily: 'Inter',
          color: AppColors.primary,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _AboutCard extends StatelessWidget {
  const _AboutCard();

  @override
  Widget build(BuildContext context) {
    return _ProfileCard(
      icon: Icons.school_outlined,
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sobre mim',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Gosto de tecnologia, organização e ajudar outros estudantes a se sentirem mais em casa na PUC! 💜',
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _AcademicCard extends StatelessWidget {
  const _AcademicCard();

  @override
  Widget build(BuildContext context) {
    return _GroupedCard(
      children: const [
        _InfoRow(
          icon: Icons.person_outline_rounded,
          title: 'Curso',
          value: 'Engenharia de Software',
        ),
        _InfoRow(
          icon: Icons.calendar_month_outlined,
          title: 'Período',
          value: '6º período • Noite',
        ),
        _InfoRow(
          icon: Icons.mail_outline_rounded,
          title: 'E-mail institucional',
          value: 'camila.andrade@pucminas.edu.br',
        ),
      ],
    );
  }
}

class _PreferencesCard extends StatelessWidget {
  const _PreferencesCard();

  @override
  Widget build(BuildContext context) {
    return _GroupedCard(
      children: const [
        _PreferenceRow(
          icon: Icons.notifications_none_rounded,
          title: 'Notificações',
          subtitle: 'Receba avisos de novas mensagens',
          value: true,
        ),
        _PreferenceRow(
          icon: Icons.dark_mode_outlined,
          title: 'Modo escuro',
          subtitle: 'Use o app no modo escuro',
          value: false,
        ),
      ],
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.icon, required this.child});

  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.lavender,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: const Color(0xFFEDE3FF),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: AppColors.primary, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _GroupedCard extends StatelessWidget {
  const _GroupedCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE9E5F1)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          for (var index = 0; index < children.length; index++) ...[
            children[index],
            if (index < children.length - 1)
              const Divider(height: 1, indent: 62, endIndent: 16),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.title,
    required this.value,
  });

  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        children: [
          Icon(icon, color: AppColors.ink, size: 26),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.muted),
        ],
      ),
    );
  }
}

class _PreferenceRow extends StatelessWidget {
  const _PreferenceRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        children: [
          Icon(icon, color: AppColors.ink, size: 26),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    color: AppColors.muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: null,
            activeThumbColor: AppColors.primary,
          ),
        ],
      ),
    );
  }
}

class _ProfileNavigation extends StatelessWidget {
  const _ProfileNavigation();

  @override
  Widget build(BuildContext context) {
    return AppBottomNavigation(
      selected: AppDestination.perfil,
      onSelected: (destination) {
        switch (destination) {
          case AppDestination.inicio:
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const HomePage()),
            );
            break;
          case AppDestination.feed:
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const FeedPage()),
            );
            break;
          case AppDestination.mapa:
          case AppDestination.missoes:
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('${destination.name}: em breve!')),
            );
            break;
          case AppDestination.perfil:
            break;
        }
      },
    );
  }
}
