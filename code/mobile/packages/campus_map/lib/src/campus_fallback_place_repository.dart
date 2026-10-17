import 'package:flutter/foundation.dart';

import 'campus_place.dart';
import 'campus_place_repository.dart';

/// Busca com fonte preferida e reserva: normalmente a API do app (remota) com
/// o snapshot local do pacote como fallback. Não conhece HTTP nem URL; o app
/// injeta a implementação remota.
///
/// - `search`: usa a fonte preferida; se ela falhar (rede, servidor, resposta
///   inválida), responde pela reserva sem expor o erro. Lista vazia da fonte
///   preferida é resposta válida, não falha.
/// - `findById`: primeiro os lugares já devolvidos por uma busca (o foco não
///   depende de uma segunda ida à rede), depois a preferida e a reserva.
class FallbackCampusPlaceRepository implements CampusPlaceRepository {
  FallbackCampusPlaceRepository({
    required this.primary,
    required this.fallback,
  });

  final CampusPlaceRepository primary;
  final CampusPlaceRepository fallback;

  /// Lugares da última busca respondida, por id.
  final Map<String, CampusPlace> _recent = {};

  /// Origem da última resposta de busca (`remote` ou `local-fallback`).
  String? get lastSource => _lastSource;
  String? _lastSource;

  @override
  Future<List<CampusPlace>> search(String query) async {
    List<CampusPlace> results;
    String source;
    try {
      results = await primary.search(query);
      source = 'remote';
    } catch (_) {
      results = await fallback.search(query);
      source = 'local-fallback';
    }
    _remember(results);
    if (source != _lastSource && (kDebugMode || kProfileMode)) {
      // Só na troca de origem: sem spam e sem registrar o texto buscado.
      debugPrint('[campus_map] map search source=$source');
    }
    _lastSource = source;
    return results;
  }

  void _remember(List<CampusPlace> results) {
    _recent
      ..clear()
      ..addEntries(results.map((place) => MapEntry(place.id, place)));
  }

  @override
  Future<CampusPlace?> findById(String id) async {
    if (_recent[id] case final place?) return place;
    try {
      final place = await primary.findById(id);
      if (place != null) return place;
    } catch (_) {
      // Fonte preferida indisponível: tenta a reserva.
    }
    return fallback.findById(id);
  }
}
