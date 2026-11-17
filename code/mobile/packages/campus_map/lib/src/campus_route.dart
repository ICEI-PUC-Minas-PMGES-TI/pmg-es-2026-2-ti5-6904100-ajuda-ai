import 'campus_location_service.dart';
import 'campus_place.dart';

/// Destino de uma rota: prédio pelo id estável (`P26`) ou uma coordenada
/// (área, sala, evento, restaurante fora de prédio). O serviço envia cada
/// forma como o backend espera (`destino: {id}` ou `{latitude, longitude}`).
sealed class CampusRouteTarget {
  const CampusRouteTarget();

  /// Prédio do campus pela chave estável (a mesma do snapshot e da API).
  factory CampusRouteTarget.place(String id) = CampusRoutePlace;

  /// Ponto WGS84; o servidor encaixa no caminho mais próximo.
  factory CampusRouteTarget.coordinate({
    required double longitude,
    required double latitude,
  }) = CampusRouteCoordinate;

  /// Lugar da busca. Prédio vai pelo id; área e sala (ids UUID, que o
  /// backend não aceita como prédio) vão pelo centro. Sem tipo informado
  /// (snapshot local), só uma chave de prédio vai pelo id.
  factory CampusRouteTarget.forPlace(CampusPlace place) {
    final byId = switch (place.kind) {
      CampusPlaceKind.building => true,
      CampusPlaceKind.area || CampusPlaceKind.room => false,
      null => CampusRoutePlace.isBuildingKey(place.id),
    };
    return byId
        ? CampusRoutePlace(place.id)
        : CampusRouteCoordinate(
            longitude: place.center[0],
            latitude: place.center[1],
          );
  }

  /// Identifica o destino em [CampusRoute.destinationId].
  String get key;
}

final class CampusRoutePlace extends CampusRouteTarget {
  CampusRoutePlace(this.id) {
    if (!isBuildingKey(id)) throw ArgumentError('Id de prédio inválido.');
  }

  /// Formato aceito pelo backend em `destino.id` (sem hífen: UUID não vale).
  static bool isBuildingKey(String id) => _key.hasMatch(id);
  static final _key = RegExp(r'^[A-Za-z0-9_]{1,64}$');

  final String id;

  @override
  String get key => id;

  @override
  bool operator ==(Object other) => other is CampusRoutePlace && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'CampusRoutePlace($id)';
}

final class CampusRouteCoordinate extends CampusRouteTarget {
  CampusRouteCoordinate({required this.longitude, required this.latitude}) {
    if (!longitude.isFinite ||
        !latitude.isFinite ||
        longitude.abs() > 180 ||
        latitude.abs() > 90) {
      throw ArgumentError('Coordenada de destino inválida.');
    }
  }

  final double longitude;
  final double latitude;

  @override
  String get key => '$latitude,$longitude';

  @override
  bool operator ==(Object other) =>
      other is CampusRouteCoordinate &&
      other.longitude == longitude &&
      other.latitude == latitude;

  @override
  int get hashCode => Object.hash(longitude, latitude);

  @override
  String toString() => 'CampusRouteCoordinate($longitude, $latitude)';
}

/// Rota a pé já calculada: linha GeoJSON `[longitude, latitude]` orientada da
/// origem (usuário) até a entrada do destino.
class CampusRoute {
  CampusRoute({
    required this.destinationId,
    required List<List<double>> coordinates,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.accessible,
  }) : coordinates = List.unmodifiable([
         for (final c in coordinates) List<double>.unmodifiable(c),
       ]) {
    if (destinationId.trim().isEmpty ||
        coordinates.length < 2 ||
        coordinates.any(
          (c) =>
              c.length != 2 ||
              c.any((v) => !v.isFinite) ||
              c[0].abs() > 180 ||
              c[1].abs() > 90,
        ) ||
        !distanceMeters.isFinite ||
        distanceMeters < 0 ||
        durationSeconds < 0) {
      throw ArgumentError('Rota inválida.');
    }
  }

  final String destinationId;
  final List<List<double>> coordinates;
  final double distanceMeters;
  final int durationSeconds;
  final bool accessible;
}

/// Por que não há rota para mostrar. A tela traduz em mensagem.
enum CampusRouteFailure {
  /// Serviço fora do ar, sem rede, tempo esgotado ou resposta inválida.
  unavailable,

  /// Origem longe demais dos caminhos do campus.
  outsideCampus,

  /// Origem já está no destino.
  samePlace,

  /// Não existe caminho (no modo acessível: sem caminho acessível).
  noPath,

  /// Destino desconhecido ou sem ligação com os caminhos.
  destinationUnavailable,

  /// Destino por coordenada longe demais dos caminhos do campus.
  destinationOutside,
}

class CampusRouteException implements Exception {
  const CampusRouteException(this.failure);
  final CampusRouteFailure failure;

  @override
  String toString() => 'CampusRouteException(${failure.name})';
}

/// Cálculo de rota fornecido pelo app (ex.: `POST /mapa/rotas`). O pacote
/// não faz HTTP e não tem rota local: sem serviço, não há rota.
///
/// A origem é a posição do usuário naquele instante: o serviço deve usá-la só
/// para calcular, sem gravar nem registrar em log.
abstract interface class CampusRouteService {
  /// Lança [CampusRouteException] quando não houver rota para mostrar.
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  });
}

/// Serviço que também traça rota entre dois locais escolhidos pelo usuário
/// ("Escolher ponto de partida" do PUCMaps). A origem segue as mesmas regras
/// do destino: prédio pelo id, área/sala pela coordenada.
abstract interface class CampusPlaceRouteService implements CampusRouteService {
  /// Lança [CampusRouteException] quando não houver rota para mostrar.
  Future<CampusRoute> routeBetween({
    required CampusRouteTarget origin,
    required CampusRouteTarget destination,
    required bool accessible,
  });
}
