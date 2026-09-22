import 'package:flutter/material.dart';

import 'tela_home.dart';
import 'theme/colors.dart';
import 'widgets/campus_photo.dart';
import 'widgets/login_success_transition.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  bool _showTransition = false;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    late final Widget loginScreen;
    loginScreen = Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          const _BackgroundShapes(),
          const Positioned(left: 0, right: 0, bottom: 0, child: CampusPhoto()),
          SafeArea(
            child: _LoginContent(
              bottomInset: bottomInset,
              onMicrosoftPressed: () {
                // TODO: iniciar a transição após autenticação real da Microsoft.
                if (_showTransition) return;
                _showTransition = true;
                Navigator.of(context).pushReplacement(
                  PageRouteBuilder<void>(
                    pageBuilder: (context, animation, secondaryAnimation) =>
                        LoginSuccessTransition(
                          background: loginScreen,
                          destination: const HomePage(),
                        ),
                    transitionDuration: Duration.zero,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
    return loginScreen;
  }
}

class _BackgroundShapes extends StatelessWidget {
  const _BackgroundShapes();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(top: -118, left: -95, child: _blob(250)),
          Positioned(top: -95, right: -130, child: _blob(240)),
          Positioned(bottom: -170, left: -90, child: _blob(340)),
        ],
      ),
    );
  }

  Widget _blob(double size) => Container(
    width: size,
    height: size,
    decoration: const BoxDecoration(
      color: AppColors.lavender,
      shape: BoxShape.circle,
    ),
  );
}

class _LoginContent extends StatelessWidget {
  const _LoginContent({
    required this.onMicrosoftPressed,
    required this.bottomInset,
  });

  final VoidCallback onMicrosoftPressed;
  final double bottomInset;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;

    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight;
        final topGap = (height * 0.060).clamp(20.0, 46.0);
        final afterLockup = (height * 0.069).clamp(28.0, 56.0);
        final aroundHero = (height * 0.015).clamp(8.0, 16.0);
        final afterButton = (height * 0.027).clamp(12.0, 24.0);

        return Padding(
          padding: EdgeInsets.symmetric(
            horizontal: (width * 0.063).clamp(20.0, 28.0),
          ),
          child: Column(
            children: [
              SizedBox(height: topGap),
              const _BrandLockup(),
              SizedBox(height: afterLockup),
              const _Welcome(),
              SizedBox(height: aroundHero),
              const Expanded(child: _HeroImage()),
              SizedBox(height: aroundHero),
              _MicrosoftButton(onPressed: onMicrosoftPressed),
              SizedBox(height: afterButton),
              SizedBox(
                height: (CampusPhoto.heightFor(context) * 0.98 - bottomInset)
                    .clamp(0.0, double.infinity),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _BrandLockup extends StatelessWidget {
  const _BrandLockup();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Image.asset('assets/images/logo.png', height: 44),
        Container(
          width: 1,
          height: 36,
          margin: const EdgeInsets.symmetric(horizontal: 16),
          color: AppColors.muted.withValues(alpha: 0.35),
        ),
        Image.asset('assets/images/puclogo.png', height: 50),
      ],
    );
  }
}

class _Welcome extends StatelessWidget {
  const _Welcome();

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;

    return Column(
      children: [
        Text(
          'Bem-vindo!',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.ink,
            fontSize: (width * 0.095).clamp(28.0, 44.0),
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            height: 1.1,
          ),
        ),
        const SizedBox(height: 12),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: const Text(
            'Entre com sua credencial @pucminas.edu.br\n'
            'para acessar o Ajuda-aí.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Inter',
              color: AppColors.muted,
              fontSize: 14,
              fontWeight: FontWeight.w400,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = constraints.biggest.shortestSide.clamp(0.0, 210.0);

        return Center(
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: side,
                height: side,
                decoration: BoxDecoration(
                  color: AppColors.lavender.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(side),
                ),
              ),
              Image.asset(
                'assets/images/imghero.png',
                height: side * 0.98,
                fit: BoxFit.contain,
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MicrosoftButton extends StatelessWidget {
  const _MicrosoftButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final height = (width * 0.14).clamp(50.0, 62.0);
    final radius = (width * 0.04).clamp(14.0, 18.0);

    return SizedBox(
      width: double.infinity,
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.32),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            padding: EdgeInsets.symmetric(
              horizontal: (width * 0.05).clamp(18.0, 22.0),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
          ),
          child: Row(
            children: [
              Image.asset(
                'assets/images/microsoft.png',
                height: (width * 0.067).clamp(24.0, 29.0),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Entrar com a Microsoft',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: (width * 0.04).clamp(14.0, 18.0),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(
                Icons.arrow_forward,
                size: (width * 0.055).clamp(19.0, 24.0),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
