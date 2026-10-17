import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';

import 'sessao_usuario.dart';
import 'tela_perfil.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';

class MapaPage extends StatelessWidget {
  const MapaPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: const SafeArea(
        child: CampusMapView(
          config: CampusMapConfig(
            mapboxAccessToken: String.fromEnvironment('MAPBOX_ACCESS_TOKEN'),
            styleUri: String.fromEnvironment('MAPBOX_STYLE_URI'),
          ),
        ),
      ),
      bottomNavigationBar: AppBottomNavigation(
        selected: AppDestination.mapa,
        destinations: SessaoUsuario.atual.destinos,
        onSelected: (destination) {
          if (destination == AppDestination.mapa) return;
          if (destination == AppDestination.perfil) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (_) => const ProfilePage()),
            );
            return;
          }
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              SnackBar(content: Text('${destination.name}: em breve!')),
            );
        },
      ),
    );
  }
}
