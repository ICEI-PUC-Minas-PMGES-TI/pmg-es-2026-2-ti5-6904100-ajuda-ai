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
}
