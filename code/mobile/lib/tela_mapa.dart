import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import 'services/campus_conteudo_api.dart';
import 'services/mapa_api.dart';
import 'services/mapa_locais_salvos.dart';
import 'services/mapa_local_admin_api.dart';
import 'services/pucstops_api.dart';
import 'services/feed_image_save.dart';
import 'services/api_config.dart';
import 'coordenacao/formulario_local_mapa.dart';
import 'sessao_usuario.dart';
import 'theme/colors.dart';
import 'widgets/app_bottom_navigation.dart';
import 'widgets/navegacao_app.dart';

class MapaPage extends StatefulWidget {
  const MapaPage({
    super.key,
    this.placeRepository,
    this.routeService,
    this.pucStopService,
    this.contentService,
    this.savedPlacesStore,
    this.openExternalUrl,
    this.coordenadorAccessToken,
    this.coordenadorBaseUrl = apiBaseUrl,
  });

  /// Busca remota; padrão: API do Ajuda-aí (`API_BASE_URL`). Testes injetam.
  final CampusPlaceRepository? placeRepository;

  /// Rotas a pé; padrão: `POST /mapa/rotas` da mesma API. Testes injetam.
  final CampusRouteService? routeService;

  /// PucStops e coleta; padrão: `/mapa/pucstops` com o JWT da sessão.
  final CampusPucStopService? pucStopService;

  /// Eventos, restaurantes e cardápios; padrão: `/mapa/eventos` e
  /// `/mapa/restaurantes` da mesma API (públicos). Testes injetam.
  final CampusContentService? contentService;

  /// "Salvar local"; padrão: arquivo no aparelho, um por conta. Testes injetam.
  final CampusSavedPlacesStore? savedPlacesStore;

  /// Abre o cardápio em PDF fora do app; padrão: `url_launcher`.
  final Future<bool> Function(Uri url)? openExternalUrl;
  final String? coordenadorAccessToken;
  final String coordenadorBaseUrl;

  @override
  State<MapaPage> createState() => _MapaPageState();
}

class _MapaPageState extends State<MapaPage> {
  // Uma instância por tela: o mapa só recria a busca se a instância mudar.
  late final CampusPlaceRepository _placeRepository =
      widget.placeRepository ??
      MapaApiPlaceRepository(baseUrl: widget.coordenadorBaseUrl);
  late final CampusRouteService _routeService =
      widget.routeService ??
      MapaApiRouteService(baseUrl: widget.coordenadorBaseUrl);
  late final CampusPucStopService _pucStopService =
      widget.pucStopService ??
      MapaApiPucStopService(
        accessToken: () => SessaoUsuario.atual.accessToken,
        baseUrl: widget.coordenadorBaseUrl,
      );
  late final CampusContentService _contentService =
      widget.contentService ??
      MapaApiCampusContentService(baseUrl: widget.coordenadorBaseUrl);
  late final CampusSavedPlacesStore _savedPlaces =
      widget.savedPlacesStore ??
      ArquivoLocaisSalvos(
        conta: () =>
            SessaoUsuario.atual.identidade?.email ??
            SessaoUsuario.atual.dados?.email,
      );

  /// Portarias e alimentação vêm da mesma API da busca (`/mapa/predios`).
  CampusPointOfInterestCatalog? get _pontosPermanentes =>
      switch (_placeRepository) {
        final CampusPointOfInterestCatalog catalogo => catalogo,
        _ => null,
      };

  /// PDF no visualizador do aparelho (navegador/leitor). Falha → `false`: o
  /// mapa mostra o link para copiar.
  static Future<bool> _abrirExterno(Uri url) async {
    try {
      return await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  /// XP do app = total devolvido pelo servidor (nunca somado no cliente).
  void _coletou(CampusPucStopClaim coleta) {
    SessaoUsuario.atual.xp.value = coleta.xpTotal;
  }

  Future<void> _baixarImagem(Uri url) async {
    final client = http.Client();
    try {
      await salvarImagemDoFeed(url.toString(), client: client);
    } finally {
      client.close();
    }
  }

  Future<bool> _editarLocal(CampusPlace local) async {
    final token = widget.coordenadorAccessToken;
    if (token == null || !mounted) return false;
    return await Navigator.of(context).push<bool>(
          MaterialPageRoute(
            builder: (_) => FormularioLocalMapa(
              local: local,
              api: MapaLocalAdminApi(
                accessToken: token,
                baseUrl: widget.coordenadorBaseUrl,
              ),
            ),
          ),
        ) ??
        false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      // Como no PUCMaps, o mapa vai até o topo da tela; a busca e os chips
      // respeitam a área segura dentro dos controles do mapa.
      body: MediaQuery.removePadding(
        context: context,
        // Rodapé já reservado pela navegação inferior do app.
        removeBottom: widget.coordenadorAccessToken == null,
        child: CampusMapView(
          config: const CampusMapConfig(
            mapboxAccessToken: String.fromEnvironment('MAPBOX_ACCESS_TOKEN'),
            styleUri: String.fromEnvironment('MAPBOX_STYLE_URI'),
            mapAssetsBaseUrl: String.fromEnvironment('MAP_ASSETS_BASE_URL'),
            features: CampusMapFeatures(
              enable3d: true,
              pucStops: true,
              events: true,
              canteens: true,
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
          contentService: _contentService,
          pointOfInterestCatalog: _pontosPermanentes,
          savedPlacesStore: _savedPlaces,
          openExternalUrl: widget.openExternalUrl ?? _abrirExterno,
          canEditPlaces: widget.coordenadorAccessToken != null,
          onEditPlace: widget.coordenadorAccessToken == null
              ? null
              : _editarLocal,
          onDownloadPlaceImage: _baixarImagem,
        ),
      ),
      bottomNavigationBar: widget.coordenadorAccessToken != null
          ? null
          : AppBottomNavigation(
              selected: AppDestination.mapa,
              destinations: SessaoUsuario.atual.destinos,
              onSelected: (destination) => navegarDestino(
                context,
                destination,
                atual: AppDestination.mapa,
              ),
            ),
    );
  }
}
