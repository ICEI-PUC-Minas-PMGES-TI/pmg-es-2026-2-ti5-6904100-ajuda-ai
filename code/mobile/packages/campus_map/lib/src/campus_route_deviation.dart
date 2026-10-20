import 'dart:math' as math;

import 'campus_location_service.dart';
import 'campus_route.dart';

const _earthRadius = 6371008.8;
const _radians = math.pi / 180;

/// Projeção equiretangular centrada na leitura atual. No campus (poucos km),
/// a distorção é muito menor que a incerteza do GPS. Mede SEGMENTOS com a
/// projeção limitada a [0, 1], incluindo pontas e segmentos degenerados.
double campusDistanceToRoute(CampusUserLocation point, CampusRoute route) {
  final scaleX = _earthRadius * _radians * math.cos(point.latitude * _radians);
  const scaleY = _earthRadius * _radians;
  var minimumSquared = double.infinity;
  for (var i = 1; i < route.coordinates.length; i++) {
    final a = route.coordinates[i - 1];
    final b = route.coordinates[i];
    final ax = (a[0] - point.longitude) * scaleX;
    final ay = (a[1] - point.latitude) * scaleY;
    final dx = (b[0] - a[0]) * scaleX;
    final dy = (b[1] - a[1]) * scaleY;
    final lengthSquared = dx * dx + dy * dy;
    final t = lengthSquared == 0
        ? 0.0
        : (-(ax * dx + ay * dy) / lengthSquared).clamp(0.0, 1.0);
    final x = ax + t * dx;
    final y = ay + t * dy;
    minimumSquared = math.min(minimumSquared, x * x + y * y);
  }
  return math.sqrt(minimumSquared);
}

/// Mesma projeção local, usada apenas para rejeitar oscilação sem movimento.
double campusLocationDisplacement(CampusUserLocation a, CampusUserLocation b) {
  final x =
      (b.longitude - a.longitude) *
      _radians *
      _earthRadius *
      math.cos((a.latitude + b.latitude) / 2 * _radians);
  final y = (b.latitude - a.latitude) * _radians * _earthRadius;
  return math.sqrt(x * x + y * y);
}
