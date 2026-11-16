import 'dart:math' as math;

import 'campus_location_service.dart';

/// Ponto do campus que concede XP uma vez, coletado perto dele. Cadastrado
/// pela coordenação: posição, raio e XP vêm do servidor, que também decide a
/// coleta (geofence no backend). Nada fica fixo no app nem no manifesto.
class CampusPucStop {
  CampusPucStop({
    required this.id,
    required this.name,
    required this.longitude,
    required this.latitude,
    required this.radiusMeters,
    required this.xp,
  }) {
    if (!_idPattern.hasMatch(id) ||
        name.trim().isEmpty ||
        !longitude.isFinite ||
        !latitude.isFinite ||
        longitude.abs() > 180 ||
        latitude.abs() > 90 ||
        !radiusMeters.isFinite ||
        radiusMeters <= 0 ||
        xp <= 0) {
      throw ArgumentError('PucStop inválido.');
    }
  }

  /// Id estável gerado pelo Ajuda-aí (UUID); nome nunca é chave.
  static final _idPattern = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  );

  final String id;
  final String name;
  final double longitude;
  final double latitude;
  final double radiusMeters;
  final int xp;

  /// Distância geodésica aproximada (haversine) só para a interface. Quem
  /// decide se a coleta vale é o servidor.
  double distanceFrom(CampusUserLocation location) {
    const earthRadius = 6371008.8;
    double rad(double degrees) => degrees * math.pi / 180;
    final dLat = rad(latitude - location.latitude);
    final dLon = rad(longitude - location.longitude);
    final a =
        math.pow(math.sin(dLat / 2), 2) +
        math.cos(rad(location.latitude)) *
            math.cos(rad(latitude)) *
            math.pow(math.sin(dLon / 2), 2);
    return 2 * earthRadius * math.asin(math.min(1, math.sqrt(a)));
  }
}

/// Coleta aceita pelo servidor.
class CampusPucStopClaim {
  const CampusPucStopClaim({
    required this.pucStopId,
    required this.xpGained,
    required this.xpTotal,
    required this.distanceMeters,
    int? coinsGained,
    this.capReached = false,
    this.levelUp = false,
    this.levelNumber,
    this.levelName,
  }) : coinsGained = coinsGained ?? xpGained;

  final String pucStopId;

  /// XP efetivamente creditado (0 quando o teto do semestre já estava cheio).
  final int xpGained;

  /// Saldo depois da coleta (moedas, no servidor atual).
  final int xpTotal;
  final double distanceMeters;

  /// Moedas efetivamente creditadas.
  final int coinsGained;

  /// O teto de XP de totens do semestre cortou a recompensa.
  final bool capReached;

  /// A coleta fez o usuário subir de nível.
  final bool levelUp;
  final int? levelNumber;
  final String? levelName;
}

/// Por que a coleta não aconteceu. A tela traduz em mensagem/estado.
enum CampusPucStopFailure {
  /// Já coletado por este usuário (coleta única, sem cooldown).
  alreadyCollected,

  /// O servidor mediu a posição fora do raio.
  outOfRange,

  /// GPS com incerteza grande demais para decidir.
  imprecise,

  /// PucStop inexistente ou desativado.
  unavailable,

  /// Sem sessão: coletar exige login.
  unauthenticated,

  /// Rede/servidor fora do ar, tempo esgotado ou resposta inválida.
  offline,
}

class CampusPucStopException implements Exception {
  const CampusPucStopException(this.failure, {this.distanceMeters});
  final CampusPucStopFailure failure;

  /// Distância medida pelo servidor, quando ele informa (fora do alcance).
  final double? distanceMeters;

  @override
  String toString() => 'CampusPucStopException(${failure.name})';
}

/// PucStops e coleta fornecidos pelo app (ex.: `/mapa/pucstops`). O pacote
/// não faz HTTP nem guarda sessão.
///
/// A posição da coleta é a do usuário naquele instante: o serviço deve usá-la
/// só para a validação no servidor, sem gravar nem registrar em log.
abstract interface class CampusPucStopService {
  /// PucStops ativos (leitura pública).
  Future<List<CampusPucStop>> list();

  /// Ids já coletados pelo usuário; vazio sem sessão.
  Future<Set<String>> collected();

  /// `false` sem sessão: o card explica que coletar exige login.
  bool get canClaim;

  /// Lança [CampusPucStopException] quando a coleta não acontece.
  Future<CampusPucStopClaim> claim(
    String pucStopId,
    CampusUserLocation location,
  );
}
