import 'package:flutter/material.dart';

import '../tela_feed.dart';
import '../tela_home.dart';
import '../tela_mapa.dart';
import '../tela_perfil.dart';
import 'app_bottom_navigation.dart';

void navegarDestino(
  BuildContext context,
  AppDestination destination, {
  required AppDestination atual,
}) {
  if (destination == atual) return;

  final Widget? pagina = switch (destination) {
    AppDestination.inicio => const HomePage(),
    AppDestination.feed => const FeedPage(),
    AppDestination.perfil => const ProfilePage(),
    AppDestination.mapa => const MapaPage(),
    AppDestination.missoes => null,
  };

  if (pagina == null) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text('${destination.name}: em breve!')),
      );
    return;
  }

  Navigator.of(context).pushReplacement(
    MaterialPageRoute(builder: (_) => pagina),
  );
}
