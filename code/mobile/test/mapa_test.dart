import 'package:ajuda_ai/services/mapa_api.dart';
import 'package:ajuda_ai/services/pucstops_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_mapa.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('MapaPage integra mapa anônimo e preserva navegação inferior', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: MapaPage()));

    final map = tester.widget<CampusMapView>(find.byType(CampusMapView));
    expect(map.config.mapboxAccessToken, isEmpty);
    expect(map.config.effectiveStyleUri, CampusMapDefaults.styleUri);
    expect(map.config.apiBaseUrl, isNull);
    expect(map.config.accessTokenProvider, isNull);
    // 3D ligado; a base pública vem só de MAP_ASSETS_BASE_URL (vazia no teste).
    expect(map.config.features.enable3d, isTrue);
    expect(map.config.mapAssetsBaseUrl, isEmpty);
    // Busca remota pela API do app, com o snapshot local como fallback.
    expect(map.remotePlaceRepository, isA<MapaApiPlaceRepository>());
    // Rotas pela mesma API, sem rota local.
    expect(map.routeService, isA<MapaApiRouteService>());
    // PucStops ligados, pela API, com coleta manual no card.
    expect(map.config.features.pucStops, isTrue);
    expect(map.pucStopService, isA<MapaApiPucStopService>());
    expect(map.onPucStopClaimed, isNotNull);
    expect(find.textContaining('Mapa indisponível'), findsOneWidget);
    expect(find.text('Mapa em breve'), findsNothing);
    final navigation = tester.widget<AppBottomNavigation>(
      find.byType(AppBottomNavigation),
    );
    expect(navigation.selected, AppDestination.mapa);
    expect(navigation.destinations, SessaoUsuario.atual.destinos);
    expect(tester.takeException(), isNull);
  });
}
