import 'package:device_preview/device_preview.dart';
import 'package:device_preview/presets.dart';
import 'package:flutter/material.dart';

import 'tela_login.dart';
import 'theme/colors.dart';

Future<void> main() async {
  DevicePreview.enable();
  await DevicePreview.maybeController?.applyPreset(DevicePresets.pixel10);

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
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary),
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Poppins',
      ),
      home: const LoginPage(),
    );
  }
}
