/// Contrato para integrações futuras. As flags ainda não ativam recursos.
class CampusMapFeatures {
  const CampusMapFeatures({
    this.enable3d = false,
    this.routes = false,
    this.pucStops = false,
    this.events = false,
    this.canteens = false,
    this.diagnostics = false,
  });

  final bool enable3d;
  final bool routes;
  final bool pucStops;
  final bool events;
  final bool canteens;
  final bool diagnostics;
}
