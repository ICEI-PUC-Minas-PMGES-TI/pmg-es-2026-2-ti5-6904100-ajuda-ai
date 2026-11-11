import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

void main() {
  test('feature flags são desligadas por padrão', () {
    const features = CampusMapFeatures();
    expect(features.enable3d, isFalse);
    expect(features.routes, isFalse);
    expect(features.pucStops, isFalse);
    expect(features.events, isFalse);
    expect(features.canteens, isFalse);
    expect(features.diagnostics, isFalse);
  });

  test('config preserva os valores fornecidos pelo app', () async {
    final apiBaseUrl = Uri.parse('https://example.invalid');
    Future<String?> provider() async => null;
    const features = CampusMapFeatures(diagnostics: true);
    final config = CampusMapConfig(
      mapboxAccessToken: '',
      styleUri: 'mapbox://styles/mapbox/streets-v12',
      apiBaseUrl: apiBaseUrl,
      accessTokenProvider: provider,
      features: features,
    );

    expect(config.mapboxAccessToken, isEmpty);
    expect(config.styleUri, 'mapbox://styles/mapbox/streets-v12');
    expect(config.effectiveStyleUri, config.styleUri);
    expect(config.apiBaseUrl, apiBaseUrl);
    expect(config.accessTokenProvider, same(provider));
    expect(await config.accessTokenProvider!(), isNull);
    expect(config.features, same(features));
  });

  test('mapa base tem backend e sessão ausentes e fallback oficial', () {
    const config = CampusMapConfig(mapboxAccessToken: '');
    expect(config.apiBaseUrl, isNull);
    expect(config.accessTokenProvider, isNull);
    expect(config.styleUri, MapboxStyles.STANDARD);
    for (final style in ['', '   ']) {
      expect(
        CampusMapConfig(
          mapboxAccessToken: '',
          styleUri: style,
        ).effectiveStyleUri,
        MapboxStyles.STANDARD,
      );
    }
  });

  for (final token in ['', '   ']) {
    testWidgets('token ausente não monta renderer nativo (${token.length})', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CampusMapView(
              config: CampusMapConfig(mapboxAccessToken: token),
            ),
          ),
        ),
      );

      expect(find.textContaining('Mapa indisponível'), findsOneWidget);
      expect(find.textContaining('MAPBOX_ACCESS_TOKEN'), findsOneWidget);
      expect(find.byType(MapWidget), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('configuração inválida é rejeitada sem expor seu valor', (
    tester,
  ) async {
    const invalidValue = 'configuracao-invalida';
    await tester.pumpWidget(
      const MaterialApp(
        home: CampusMapView(
          config: CampusMapConfig(mapboxAccessToken: invalidValue),
        ),
      ),
    );
    expect(find.textContaining('token público'), findsOneWidget);
    expect(find.textContaining(invalidValue), findsNothing);
    expect(find.byType(MapWidget), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
