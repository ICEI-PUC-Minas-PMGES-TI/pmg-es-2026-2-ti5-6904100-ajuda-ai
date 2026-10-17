/// Recursos opcionais do mapa. Implementados: [enable3d], [vegetation],
/// [props] e [diagnostics]; as demais flags são contrato futuro e não ativam
/// nada.
class CampusMapFeatures {
  const CampusMapFeatures({
    this.enable3d = false,
    this.vegetation = true,
    this.props = true,
    this.routes = false,
    this.pucStops = false,
    this.events = false,
    this.canteens = false,
    this.diagnostics = false,
  });

  /// Prédios 3D (extrusão + GLBs remotos). Exige `mapAssetsBaseUrl`.
  final bool enable3d;

  /// Árvores do manifesto. Só vale com [enable3d]; desligar serve para
  /// rollback ou medição sem tocar nos prédios.
  final bool vegetation;

  /// Área esportiva e carros do manifesto. Só vale com [enable3d].
  final bool props;

  final bool routes;
  final bool pucStops;
  final bool events;
  final bool canteens;

  /// Painel técnico de medição (FPS do mapa, draw calls, memória, downloads,
  /// tempos). Só para validação; nunca ligar para usuário comum.
  final bool diagnostics;
}
