/// Recursos opcionais do mapa. Só [enable3d] tem implementação nesta fase;
/// as demais flags são contrato futuro e não ativam nada.
class CampusMapFeatures {
  const CampusMapFeatures({
    this.enable3d = false,
    this.routes = false,
    this.pucStops = false,
    this.events = false,
    this.canteens = false,
    this.diagnostics = false,
  });

  /// Prédios 3D (extrusão + GLBs remotos). Exige `mapAssetsBaseUrl`.
  final bool enable3d;
  final bool routes;
  final bool pucStops;
  final bool events;
  final bool canteens;
  final bool diagnostics;
}
