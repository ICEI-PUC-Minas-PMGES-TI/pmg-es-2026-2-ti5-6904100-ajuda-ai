import 'campus_place.dart';

/// Onde o app guarda os locais salvos ("Salvar local" do PUCMaps, que gravava
/// no aparelho). O pacote não escolhe a persistência: sem store, o card não
/// oferece salvar.
abstract interface class CampusSavedPlacesStore {
  /// Lista gravada; vazia quando nunca houve gravação.
  Future<List<CampusPlace>> load();

  /// Substitui a lista inteira (ordem preservada).
  Future<void> save(List<CampusPlace> places);
}

/// Formato gravado de um local salvo: só identidade e âncora (sem descrição
/// nem imagens, que vêm da API ao abrir o card).
abstract final class CampusSavedPlaceCodec {
  static const _kinds = {
    'building': CampusPlaceKind.building,
    'area': CampusPlaceKind.area,
    'room': CampusPlaceKind.room,
  };

  static Map<String, Object?> toJson(CampusPlace place) => {
    'id': place.id,
    'name': place.name,
    'code': place.code,
    'type': place.type,
    'kind': place.kind?.name,
    'center': place.center,
  };

  /// Item corrompido ou de outra versão é ignorado (`null`).
  static CampusPlace? fromJson(Object? json) {
    if (json is! Map) return null;
    final id = json['id'];
    final center = json['center'];
    if (id is! String || center is! List || center.length != 2) return null;
    if (center.any((v) => v is! num)) return null;
    try {
      return CampusPlace(
        id: id,
        name: json['name'] as String?,
        code: json['code'] as String?,
        type: json['type'] as String?,
        kind: _kinds[json['kind']],
        center: [for (final v in center) (v as num).toDouble()],
      );
    } on Object {
      return null;
    }
  }

  static List<Map<String, Object?>> encode(List<CampusPlace> places) => [
    for (final place in places) toJson(place),
  ];

  static List<CampusPlace> decode(Object? json) => [
    if (json is List)
      for (final item in json) ?fromJson(item),
  ];
}

/// Store em memória (testes e telas sem persistência configurada).
class MemoryCampusSavedPlacesStore implements CampusSavedPlacesStore {
  MemoryCampusSavedPlacesStore([List<CampusPlace> initial = const []])
    : _places = List.of(initial);

  List<CampusPlace> _places;

  @override
  Future<List<CampusPlace>> load() async => List.unmodifiable(_places);

  @override
  Future<void> save(List<CampusPlace> places) async {
    _places = List.of(places);
  }
}
