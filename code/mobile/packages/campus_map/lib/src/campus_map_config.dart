import 'campus_map_defaults.dart';
import 'campus_map_features.dart';

/// Configuração fornecida pelo app. O mapa base não usa backend nem sessão.
class CampusMapConfig {
  const CampusMapConfig({
    required this.mapboxAccessToken,
    this.styleUri = CampusMapDefaults.styleUri,
    this.apiBaseUrl,
    this.accessTokenProvider,
    this.features = const CampusMapFeatures(),
  });

  final String mapboxAccessToken;
  final String styleUri;

  /// Reservados para uma futura fonte de dados autenticada do Ajuda-aí.
  final Uri? apiBaseUrl;
  final Future<String?> Function()? accessTokenProvider;
  final CampusMapFeatures features;

  String get effectiveStyleUri =>
      styleUri.trim().isEmpty ? CampusMapDefaults.styleUri : styleUri.trim();
}
