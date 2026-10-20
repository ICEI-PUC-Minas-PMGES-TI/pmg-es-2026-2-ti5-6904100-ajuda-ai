import 'campus_place.dart';

/// Agrupamentos do PUCMaps sobre tipos de prédio, nunca salas individuais.
enum CampusPlaceCategory {
  academic('Prédios acadêmicos', {'ACADEMIC', 'CLASSROOM', 'AUDITORIUM'}),
  lab('Laboratórios', {'LAB'}),
  library('Biblioteca', {'LIBRARY'}),
  sports('Esportes', {'SPORTS'});

  const CampusPlaceCategory(this.label, this.types);
  final String label;
  final Set<String> types;

  bool contains(CampusPlace place) =>
      place.kind != CampusPlaceKind.room &&
      place.kind != CampusPlaceKind.area &&
      types.contains(place.type?.trim().toUpperCase());
}

abstract interface class CampusPlaceCatalog {
  Future<List<CampusPlace>> inCategory(
    CampusPlaceCategory category, {
    String query = '',
  });
}
