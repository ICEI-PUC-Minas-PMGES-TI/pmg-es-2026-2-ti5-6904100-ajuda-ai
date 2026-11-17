import 'campus_data_source.dart';
import 'campus_place.dart';
import 'campus_place_category.dart';
import 'campus_snapshot.dart';

abstract interface class CampusPlaceRepository {
  Future<List<CampusPlace>> search(String query);
  Future<CampusPlace?> findById(String id);
}

/// Normalização pequena para nomes latinos do campus, incluindo Unicode
/// decomposto. Pontuação e números continuam significativos (P01 != P1).
String normalizeCampusQuery(String text) {
  const groups = {
    'a': 'áàâãäå',
    'e': 'éèêë',
    'i': 'íìîï',
    'o': 'óòôõö',
    'u': 'úùûü',
    'c': 'ç',
    'n': 'ñ',
    'y': 'ýÿ',
  };
  var value = text.toLowerCase();
  for (final entry in groups.entries) {
    value = value.replaceAll(RegExp('[${entry.value}]'), entry.key);
  }
  return value
      .replaceAll(RegExp(r'[\u0300-\u036f]'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

/// Índice por tela, criado uma vez a partir da mesma fonte usada no renderer.
/// Uma futura implementação HTTP só precisa cumprir CampusPlaceRepository.
class LocalCampusPlaceRepository
    implements CampusPlaceRepository, CampusPlaceCatalog {
  LocalCampusPlaceRepository({
    CampusDataSource dataSource = const LocalCampusDataSource(),
    Future<CampusSnapshot> Function()? loadSnapshot,
  }) : _loadSnapshot = loadSnapshot ?? dataSource.load;

  static const resultLimit = 8;
  final Future<CampusSnapshot> Function() _loadSnapshot;
  Future<List<_IndexedPlace>>? _index;

  Future<List<_IndexedPlace>> _places() => _index ??= _loadIndex();

  Future<List<_IndexedPlace>> _loadIndex() async {
    try {
      final snapshot = await _loadSnapshot();
      return [
        for (final feature in snapshot.features)
          if (feature.toPlace() case final place?) _IndexedPlace(place),
      ];
    } catch (_) {
      _index = null; // Permite tentar novamente após falha da fonte.
      rethrow;
    }
  }

  @override
  Future<CampusPlace?> findById(String id) async {
    for (final item in await _places()) {
      if (item.place.id == id) return item.place;
    }
    return null;
  }

  @override
  Future<List<CampusPlace>> search(String query) async {
    final normalized = normalizeCampusQuery(query);
    if (normalized.isEmpty) return const [];
    final matches = <(int, _IndexedPlace)>[];
    for (final item in await _places()) {
      final rank = item.rank(normalized);
      if (rank != null) matches.add((rank, item));
    }
    matches.sort((a, b) {
      var order = a.$1.compareTo(b.$1);
      if (order == 0) order = a.$2.name.compareTo(b.$2.name);
      if (order == 0) order = a.$2.code.compareTo(b.$2.code);
      if (order == 0) order = a.$2.place.id.compareTo(b.$2.place.id);
      return order;
    });
    return List.unmodifiable(matches.take(resultLimit).map((m) => m.$2.place));
  }

  /// Catálogo completo; o limite de sugestões textuais não corta a categoria.
  @override
  Future<List<CampusPlace>> inCategory(
    CampusPlaceCategory category, {
    String query = '',
  }) async {
    final normalized = normalizeCampusQuery(query);
    final places = <String, CampusPlace>{};
    for (final item in await _places()) {
      if (category.contains(item.place) &&
          (normalized.isEmpty || item.rank(normalized) != null)) {
        places[item.place.id] = item.place;
      }
    }
    final results = places.values.toList()
      ..sort((a, b) {
        final aNumber = int.tryParse(a.code ?? '');
        final bNumber = int.tryParse(b.code ?? '');
        if (aNumber == null && bNumber != null) return 1;
        if (aNumber != null && bNumber == null) return -1;
        if (aNumber != null && bNumber != null && aNumber != bNumber) {
          return aNumber.compareTo(bNumber);
        }
        final code = (a.code ?? '').compareTo(b.code ?? '');
        if (code != 0) return code;
        final name = normalizeCampusQuery(a.displayName)
            .compareTo(normalizeCampusQuery(b.displayName));
        return name != 0 ? name : a.id.compareTo(b.id);
      });
    return List.unmodifiable(results);
  }
}

class _IndexedPlace {
  _IndexedPlace(this.place)
    : name = normalizeCampusQuery(place.name ?? ''),
      code = normalizeCampusQuery(place.code ?? '');

  final CampusPlace place;
  final String name;
  final String code;

  int? rank(String query) {
    if (code == query) return 0;
    if (name == query) return 1;
    if (name.startsWith(query)) return 2;
    if (code.startsWith(query)) return 3;
    if (name.contains(query)) return 4;
    return null;
  }
}
