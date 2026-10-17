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
