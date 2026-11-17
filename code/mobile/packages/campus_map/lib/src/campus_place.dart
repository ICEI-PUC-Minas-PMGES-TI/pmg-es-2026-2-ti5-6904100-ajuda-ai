/// Tipo de lugar da busca (`tipo` de `GET /mapa/busca`). Decide como traçar
/// rota: prédio pelo id; área e sala pela coordenada (ver
/// `CampusRouteTarget.forPlace`).
enum CampusPlaceKind { building, area, room }

/// Identidade e âncora de um lugar; não copia a geometria do footprint.
class CampusPlace {
  CampusPlace({
    required this.id,
    required List<double> center,
    this.name,
    this.code,
    this.type,
    this.apiId,
    this.kind,
    this.heightMeters,
    this.description = '',
    this.images = const [],
  }) : center = List.unmodifiable(center) {
    if (id.trim().isEmpty ||
        (name?.trim().isNotEmpty != true && code?.trim().isNotEmpty != true) ||
        center.length != 2 ||
        center.any((v) => !v.isFinite) ||
        center[0].abs() > 180 ||
        center[1].abs() > 90) {
      throw ArgumentError('Identidade ou centro do lugar inválido.');
    }
  }

  final String id;
  final String? name;
  final String? code;
  final String? type;
  final String? apiId;

  /// `null` quando a fonte não informa (snapshot local: só prédios).
  final CampusPlaceKind? kind;

  /// Altura aproximada do prédio, quando informada pelo mapa/API.
  final double? heightMeters;

  /// Conteúdo editorial persistido pelo ID estável do prédio.
  final String description;
  final List<CampusPlaceImage> images;

  /// WGS84, `[longitude, latitude]`, igual ao snapshot.
  final List<double> center;

  String get displayName => name?.trim().isNotEmpty == true ? name! : code!;
}

class CampusPlaceImage {
  const CampusPlaceImage({
    required this.id,
    required this.url,
    required this.originalUrl,
  });

  final String id;
  final Uri url;
  final Uri originalUrl;
}
