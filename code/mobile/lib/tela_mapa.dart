import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';

import 'services/mapa_api.dart';
import 'services/pucstops_api.dart';
import 'sessao_usuario.dart';
import 'tela_perfil.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';

class MapaPage extends StatefulWidget {
  const MapaPage({
    super.key,
    this.placeRepository,
    this.routeService,
    this.pucStopService,
  });

  /// Busca remota; padrão: API do Ajuda-aí (`API_BASE_URL`). Testes injetam.
  final CampusPlaceRepository? placeRepository;

  /// Rotas a pé; padrão: `POST /mapa/rotas` da mesma API. Testes injetam.
  final CampusRouteService? routeService;

  /// PucStops e coleta; padrão: `/mapa/pucstops` com o JWT da sessão.
  final CampusPucStopService? pucStopService;

  @override
  State<MapaPage> createState() => _MapaPageState();
}

class _MapaPageState extends State<MapaPage> {
  // Uma instância por tela: o mapa só recria a busca se a instância mudar.
  late final CampusPlaceRepository _placeRepository =
      widget.placeRepository ?? MapaApiPlaceRepository();
  late final CampusRouteService _routeService =
      widget.routeService ?? MapaApiRouteService();
  late final CampusPucStopService _pucStopService =
      widget.pucStopService ??
      MapaApiPucStopService(accessToken: () => SessaoUsuario.atual.accessToken);

  /// XP do app = total devolvido pelo servidor (nunca somado no cliente).
  /// O card do mapa já mostra "+XP · total". Som de recompensa: gancho aqui,
  /// sem asset nesta versão (ver docs/tecnico/mapa/pucstops.md).
  void _coletou(CampusPucStopClaim coleta) {
    SessaoUsuario.atual.xp.value = coleta.xpTotal;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: CampusMapView(
          config: const CampusMapConfig(
            mapboxAccessToken: String.fromEnvironment('MAPBOX_ACCESS_TOKEN'),
            styleUri: String.fromEnvironment('MAPBOX_STYLE_URI'),
            mapAssetsBaseUrl: String.fromEnvironment('MAP_ASSETS_BASE_URL'),
            features: CampusMapFeatures(
              enable3d: true,
              pucStops: true,
              // Painel técnico só em build de medição; nunca para usuário comum.
              diagnostics: bool.fromEnvironment('CAMPUS_MAP_DIAGNOSTICS'),
            ),
          ),
          // Remota primeiro; o snapshot local do pacote cobre a API fora do ar.
          remotePlaceRepository: _placeRepository,
          // Sem fallback local: com a API fora, a rota avisa e não desenha.
          routeService: _routeService,
          // Coleta manual no card; sem geofence em segundo plano.
          pucStopService: _pucStopService,
          onPucStopClaimed: _coletou,
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
