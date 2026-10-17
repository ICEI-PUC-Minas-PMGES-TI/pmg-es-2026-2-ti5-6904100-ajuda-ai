import 'campus_location_service.dart';

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
    required String destinationId,
    required bool accessible,
  });
}
