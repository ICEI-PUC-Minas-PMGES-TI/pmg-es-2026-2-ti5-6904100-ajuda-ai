import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'sessao_usuario.dart';
import 'tela_login.dart';
import 'theme/colors.dart';

void main() {
  runApp(const AjudaAiApp());
}

class AjudaAiApp extends StatelessWidget {
  const AjudaAiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ajuda-aí',
      debugShowCheckedModeBanner: false,
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.light,
        ).copyWith(primary: AppColors.primary, surface: Colors.white),
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Poppins',
      ),
      // "Aparência e acessibilidade": escala extra de texto no app inteiro.
      builder: (context, child) => ValueListenableBuilder<double>(
        valueListenable: SessaoUsuario.atual.escalaTexto,
        builder: (context, escala, _) {
          if (escala == 1.0) return child!;
          final dados = MediaQuery.of(context);
          return MediaQuery(
            data: dados.copyWith(
              textScaler: TextScaler.linear(dados.textScaler.scale(1) * escala),
            ),
            child: child!,
          );
        },
      ),
      home: const LoginPage(),
    );
  }
}
