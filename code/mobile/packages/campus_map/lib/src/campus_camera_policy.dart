import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' hide Size;

import 'campus_snapshot.dart';
import 'campus_map_defaults.dart';

class CampusCameraPolicy {
  CampusCameraPolicy(CampusSnapshot snapshot)
    : extent = CampusBounds(
        west: math.min(snapshot.bounds.west, sourceExtent.west),
        south: math.min(snapshot.bounds.south, sourceExtent.south),
        east: math.max(snapshot.bounds.east, sourceExtent.east),
        north: math.max(snapshot.bounds.north, sourceExtent.north),
      ),
      initialCenter = _initialCenter(snapshot);

  /// bbox da versão PUCMaps 12 (`pucmaps-12.json`, origem.bbox): inclui
  /// portões/grafo ao norte dos footprints. União evita cortar as construções.
  static const sourceExtent = CampusBounds(
    west: -43.9961,
    south: -19.9265,
    east: -43.9885,
    north: -19.9176,
  );
  static const marginMeters = 120.0;
  static const maxZoom = 22.0;
  final CampusBounds extent;
  final List<double> initialCenter;

  static List<double> _initialCenter(CampusSnapshot snapshot) {
    final centers = snapshot.features
        .where((f) => !f.isArea && f.center != null)
        .map((f) => f.center!)
        .toList();
    if (centers.isEmpty) {
      return [snapshot.bounds.longitude, snapshot.bounds.latitude];
    }
    double median(int axis) {
      final values = centers.map((p) => p[axis]).toList()..sort();
      final middle = values.length ~/ 2;
      return values.length.isOdd
          ? values[middle]
          : (values[middle - 1] + values[middle]) / 2;
    }

    return List.unmodifiable([median(0), median(1)]);
  }

  CampusBounds get navigationBounds {
    const dy = marginMeters / 111195;
    final dx = dy / math.cos(extent.latitude * math.pi / 180);
    return CampusBounds(
      west: extent.west - dx,
      south: extent.south - dy,
      east: extent.east + dx,
      north: extent.north + dy,
    );
  }

  static MbxEdgeInsets overviewPadding(
    Size size, {
    double controlsHeight = 180,
  }) => MbxEdgeInsets(
    top: math.min(controlsHeight + 24, size.height * .45),
    bottom: math.min(76, size.height * .15),
    left: math.min(24, size.width * .08),
    right: math.min(24, size.width * .08),
  );

  /// Em landscape os cards ficam numa coluna, preservando mapa ao lado.
  static double? sideCardWidth(Size size) =>
      size.width >= 600 && size.width >= size.height * 1.5
      ? math.min(360, size.width * .42)
      : null;

  static MbxEdgeInsets routePadding(
    Size size, {
    required double bottom,
    bool sideCard = false,
    double controlsHeight = 180,
  }) {
    final cardWidth = sideCard ? sideCardWidth(size) : null;
    if (cardWidth != null) {
      return MbxEdgeInsets(
        top: math.min(controlsHeight + 24, size.height * .4),
        bottom: math.min(68, size.height * .2),
        left: cardWidth + 36,
        right: 48,
      );
    }
    final top = math.min(controlsHeight + 24, size.height * .45);
    final visible = math.min(160.0, size.height * .4);
    return MbxEdgeInsets(
      top: top,
      bottom: bottom.clamp(0.0, math.max(0.0, size.height - top - visible)),
      left: math.min(48.0, size.width * .12),
      right: math.min(48.0, size.width * .12),
    );
  }

  /// Fit Mercator em pixels lógicos (tile de 512 px). A faixa depende da
  /// viewport e da área realmente livre para o mapa, não de um zoom arbitrário.
  double minZoom(Size size, MbxEdgeInsets padding) {
    final width = math.max(1.0, size.width - padding.left - padding.right);
    final height = math.max(1.0, size.height - padding.top - padding.bottom);
    final dx = (extent.east - extent.west) / 360;
    final dy = (_mercatorY(extent.north) - _mercatorY(extent.south)).abs();
    return (math.log(math.min(width / (512 * dx), height / (512 * dy))) /
            math.ln2)
        .clamp(0.0, maxZoom);
  }

  static double _mercatorY(double latitude) {
    final sin = math.sin(latitude * math.pi / 180);
    return .5 - math.log((1 + sin) / (1 - sin)) / (4 * math.pi);
  }

  List<double> constrain(List<double> point) {
    final bounds = navigationBounds;
    return [
      point[0].clamp(bounds.west, bounds.east),
      point[1].clamp(bounds.south, bounds.north),
    ];
  }

  /// O SDK também exige que a viewport caiba nos bounds, elevando minZoom
  /// quando o bbox é estreito. Overscan é só de enquadramento; o centro
  /// continua limitado por [constrain], inclusive em landscape/com card.
  CoordinateBounds mapBounds(Size size, double minZoom) {
    final b = navigationBounds;
    final world = 512 * math.pow(2, minZoom);
    final dx = size.width / world * 360;
    final dy = size.height / world;
    double latitude(double y) =>
        (2 * math.atan(math.exp(math.pi * (1 - 2 * y))) - math.pi / 2) *
        180 /
        math.pi;
    return CoordinateBounds(
      southwest: Point(
        coordinates: Position(b.west - dx, latitude(_mercatorY(b.south) + dy)),
      ),
      northeast: Point(
        coordinates: Position(b.east + dx, latitude(_mercatorY(b.north) - dy)),
      ),
      infiniteBounds: false,
    );
  }

  List<Point> get corners => [
    for (final x in [extent.west, extent.east])
      for (final y in [extent.south, extent.north])
        Point(coordinates: Position(x, y)),
  ];
}

/// Uma abertura por instância de mapa. Resume, reload do style e resize
/// mantêm a exploração; uma nova tela (Perfil → Mapa) ganha nova abertura.
class CampusCameraOpening {
  bool _opened = false;
  CameraViewportState? _viewport;

  /// O SDK compara a identidade do viewport em didUpdateWidget. Recriá-lo
  /// em resize/rebuild dispara uma transição para a câmera provisória.
  CameraViewportState initialViewport({required bool enable3d}) =>
      _viewport ??= CameraViewportState(
        center: Point(
          coordinates: Position(
            CampusMapDefaults.longitude,
            CampusMapDefaults.latitude,
          ),
        ),
        zoom: CampusMapDefaults.zoom,
        pitch: enable3d ? CampusMapDefaults.pitch3d : CampusMapDefaults.pitch,
        bearing: CampusMapDefaults.bearing,
      );

  CameraOptions? takeCamera(
    CampusCameraPolicy policy,
    Size size, {
    required double minimumZoom,
    required bool enable3d,
    double controlsHeight = 180,
  }) {
    if (_opened || size.isEmpty) return null;
    _opened = true;
    return CameraOptions(
      center: Point(
        coordinates: Position(policy.initialCenter[0], policy.initialCenter[1]),
      ),
      zoom: math
          .max(CampusMapDefaults.zoom, minimumZoom + .75)
          .clamp(0, CampusCameraPolicy.maxZoom),
      pitch: enable3d ? CampusMapDefaults.pitch3d : CampusMapDefaults.pitch,
      bearing: CampusMapDefaults.bearing,
      padding: CampusCameraPolicy.overviewPadding(
        size,
        controlsHeight: controlsHeight,
      ),
    );
  }
}
