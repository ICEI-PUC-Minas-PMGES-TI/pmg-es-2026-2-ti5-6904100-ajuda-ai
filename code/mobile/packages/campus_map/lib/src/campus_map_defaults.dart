import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

abstract final class CampusMapDefaults {
  static const styleUri = MapboxStyles.STANDARD;

  // Câmera aproximada do campus Coração Eucarístico, não geometria de prédio.
  // Referência pública: commons.wikimedia.org/wiki/File:Entradapucminas.jpg.
  // Refinar o enquadramento quando o renderer do PUCMaps for portado.
  static const latitude = -19.924266;
  static const longitude = -43.991491;
  static const zoom = 15.5;
  static const pitch = 0.0;
  static const bearing = 0.0;
}
