/// Recursos opcionais do mapa. Implementados: [enable3d], [vegetation],
/// [props], [pucStops], [events], [canteens] e [diagnostics]; [routes] é
/// contrato futuro e não ativa nada (a rota depende só do serviço).
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

  /// PucStops (pontos 2D sempre; totem 3D com [enable3d] e manifesto). Exige
  /// um `CampusPucStopService` na view.
  final bool pucStops;

  /// Eventos ativos da coordenação (pontos 2D, lista e card). Exige um
  /// `CampusContentService` na view.
  final bool events;

  /// Restaurantes e cardápio do dia ("Onde comer"). Exige um
  /// `CampusContentService` na view.
  final bool canteens;

  /// Painel técnico de medição (FPS do mapa, draw calls, memória, downloads,
  /// tempos). Só para validação; nunca ligar para usuário comum.
  final bool diagnostics;
}
