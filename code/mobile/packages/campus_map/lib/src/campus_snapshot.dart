import 'dart:convert';
import 'dart:math' as math;

/// Snapshot poligonal WGS84. As propriedades originais permanecem disponíveis.
class CampusSnapshot {
  CampusSnapshot._(this.features, this.bounds, this.metadata);

  factory CampusSnapshot.parse(String source) {
    final json = jsonDecode(source);
    if (json is! Map<String, dynamic> ||
        json['type'] != 'FeatureCollection' ||
        json['features'] is! List ||
        (json['features'] as List).isEmpty) {
      throw const FormatException('Snapshot do campus inválido.');
    }
    final features = <CampusFeature>[];
    final ids = <String>{};
    var west = 180.0;
    var south = 90.0;
    var east = -180.0;
    var north = -90.0;
    for (final raw in json['features'] as List) {
      final feature = CampusFeature._parse(raw);
      if (!ids.add(feature.id)) {
        throw const FormatException('Identificador duplicado no campus.');
      }
      for (final polygon in feature.polygons) {
        for (final ring in polygon) {
          for (final point in ring) {
            west = math.min(west, point[0]);
            south = math.min(south, point[1]);
            east = math.max(east, point[0]);
            north = math.max(north, point[1]);
          }
        }
      }
      features.add(feature);
    }
    return CampusSnapshot._(
      List.unmodifiable(features),
      CampusBounds(west: west, south: south, east: east, north: north),
      Map.unmodifiable((json['metadata'] as Map<String, dynamic>?) ?? const {}),
    );
  }

  final List<CampusFeature> features;
  final CampusBounds bounds;
  final Map<String, dynamic> metadata;

  int get buildingCount => features.where((feature) => !feature.isArea).length;
  int get areaCount => features.where((feature) => feature.isArea).length;

  Map<String, dynamic> toGeoJson() => {
    'type': 'FeatureCollection',
    'features': features.map((feature) => feature.toGeoJson()).toList(),
  };
}

class CampusFeature {
  CampusFeature._(this.id, this.properties, this.geometryType, this.polygons);

  factory CampusFeature._parse(dynamic raw) {
    if (raw is! Map<String, dynamic> ||
        raw['type'] != 'Feature' ||
        raw['properties'] is! Map<String, dynamic> ||
        raw['geometry'] is! Map<String, dynamic>) {
      throw const FormatException('Feature do campus inválida.');
    }
    final properties = raw['properties'] as Map<String, dynamic>;
    final id = raw['id'];
    if (id is! String ||
        id.isEmpty ||
        properties['id'] != id ||
        !properties.containsKey('name') ||
        (properties['name'] != null && properties['name'] is! String)) {
      throw const FormatException('Identidade da feature inválida.');
    }
    final geometry = raw['geometry'] as Map<String, dynamic>;
    final type = geometry['type'];
    final coordinates = geometry['coordinates'];
    if ((type != 'Polygon' && type != 'MultiPolygon') || coordinates is! List) {
      throw const FormatException('Geometria poligonal esperada.');
    }
    final rawPolygons = type == 'Polygon' ? [coordinates] : coordinates;
    final polygons = <List<List<List<double>>>>[];
    if (rawPolygons.isEmpty) {
      throw const FormatException('Polígono vazio.');
    }
    for (final polygon in rawPolygons) {
      if (polygon is! List || polygon.isEmpty) {
        throw const FormatException('Polígono vazio.');
      }
      final rings = <List<List<double>>>[];
      for (final ring in polygon) {
        if (ring is! List || ring.length < 4) {
          throw const FormatException('Anel inválido.');
        }
        final points = ring.map(_coordinate).toList();
        if (points.first[0] != points.last[0] ||
            points.first[1] != points.last[1]) {
          throw const FormatException('Anel não fechado.');
        }
        rings.add(List.unmodifiable(points));
      }
      polygons.add(List.unmodifiable(rings));
    }
    final center = properties['center'];
    if (center != null) _coordinate(center);
    return CampusFeature._(
      id,
      Map.unmodifiable({
        ...properties,
        if (center != null) 'center': _coordinate(center),
      }),
      type as String,
      List.unmodifiable(polygons),
    );
  }

  final String id;
  final Map<String, dynamic> properties;
  final String geometryType;
  final List<List<List<List<double>>>> polygons;

  String? get name => properties['name'] as String?;
  String? get code => properties['code'] as String?;
  String? get type => properties['type'] as String?;
  bool get isArea =>
      properties['isArea'] == true ||
      const {'PARK', 'PARKING_LOT', 'CONSTRUCTION'}.contains(type);
  List<double>? get center => properties['center'] as List<double>?;

  Map<String, dynamic> toGeoJson() => {
    'type': 'Feature',
    'id': id,
    'geometry': {
      'type': geometryType,
      'coordinates': geometryType == 'Polygon' ? polygons.single : polygons,
    },
    'properties': properties,
  };

  static List<double> _coordinate(dynamic raw) {
    if (raw is! List || raw.length != 2 || raw[0] is! num || raw[1] is! num) {
      throw const FormatException('Coordenada WGS84 inválida.');
    }
    final longitude = (raw[0] as num).toDouble();
    final latitude = (raw[1] as num).toDouble();
    if (!longitude.isFinite ||
        !latitude.isFinite ||
        longitude.abs() > 180 ||
        latitude.abs() > 90) {
      throw const FormatException('Coordenada fora de WGS84.');
    }
    return List.unmodifiable([longitude, latitude]);
  }
}

class CampusBounds {
  const CampusBounds({
    required this.west,
    required this.south,
    required this.east,
    required this.north,
  });

  final double west;
  final double south;
  final double east;
  final double north;

  double get longitude => (west + east) / 2;
  double get latitude => (south + north) / 2;
}
