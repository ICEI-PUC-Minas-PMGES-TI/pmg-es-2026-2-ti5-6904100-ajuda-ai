import 'package:flutter/material.dart';

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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.light,
        ).copyWith(primary: AppColors.primary, surface: Colors.white),
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Poppins',
      ),
      home: const LoginPage(),
    );
  }
}
