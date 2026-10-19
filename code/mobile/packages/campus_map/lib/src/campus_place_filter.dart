import 'campus_place.dart';
import 'campus_place_category.dart';

/// Uma categoria estrutural por vez; nenhum efeito sobre a câmera ou a busca.
class CampusPlaceFilter {
  const CampusPlaceFilter({
    this.category,
    this.places = const [],
    this.loading = false,
  });

  final CampusPlaceCategory? category;
  final List<CampusPlace> places;
  final bool loading;
}
