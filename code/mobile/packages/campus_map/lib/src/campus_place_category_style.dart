import 'package:flutter/material.dart';

import 'campus_place_category.dart';

/// Paleta e ícones do registro de categorias do PUCMaps original.
extension CampusPlaceCategoryStyle on CampusPlaceCategory {
  Color get markerColor => switch (this) {
    CampusPlaceCategory.academic => Colors.lightBlueAccent,
    CampusPlaceCategory.lab => Colors.teal,
    CampusPlaceCategory.library => Colors.indigo,
    CampusPlaceCategory.sports => Colors.green,
  };

  IconData get icon => switch (this) {
    CampusPlaceCategory.academic => Icons.school_outlined,
    CampusPlaceCategory.lab => Icons.biotech_outlined,
    CampusPlaceCategory.library => Icons.book_outlined,
    CampusPlaceCategory.sports => Icons.sports_soccer_outlined,
  };

  static const selectedChipColor = Color(0xFF0D47A1);
}
