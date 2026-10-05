import 'package:flutter/material.dart';

/// O mapa do campus é desenvolvido em outro repositório (app Mapa da PUC).
const textoAvisoMapa =
    'O mapa do campus fica no app Mapa da PUC (em desenvolvimento).';

void mostrarAvisoMapa(BuildContext context) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(const SnackBar(content: Text(textoAvisoMapa)));
}
