import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

abstract final class CampusMapDefaults {
  static const styleUri = MapboxStyles.STANDARD;

  // Centro do bbox dos 82 footprints reais do snapshot PUCMaps.
  // É um enquadramento das construções, não o limite administrativo do campus.
  static const latitude = -19.92252415;
  static const longitude = -43.9927295;
  static const zoom = 15.2;
  static const pitch = 0.0;
  static const bearing = 0.0;
  static const placeZoom = 18.0;
  static const userZoom = 17.5;
  static const userPitch3d = 35.0;
  static const cameraDurationMs = 900;

  /// Inclinação inicial só com 3D ligado. O PUCMaps usava 65°; aqui é menor
  /// para manter a leitura do campus inteiro na abertura.
  static const pitch3d = 45.0;
}
