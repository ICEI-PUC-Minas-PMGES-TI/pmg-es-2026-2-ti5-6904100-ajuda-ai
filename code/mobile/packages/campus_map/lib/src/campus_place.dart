/// Identidade e âncora de um lugar; não copia a geometria do footprint.
class CampusPlace {
  CampusPlace({
    required this.id,
    required List<double> center,
    this.name,
    this.code,
    this.type,
    this.apiId,
  }) : center = List.unmodifiable(center) {
    if (id.trim().isEmpty ||
        (name?.trim().isNotEmpty != true && code?.trim().isNotEmpty != true) ||
        center.length != 2 ||
        center.any((v) => !v.isFinite) ||
        center[0].abs() > 180 ||
        center[1].abs() > 90) {
      throw ArgumentError('Identidade ou centro do lugar inválido.');
    }
  }

  final String id;
  final String? name;
  final String? code;
  final String? type;
  final String? apiId;

  /// WGS84, `[longitude, latitude]`, igual ao snapshot.
  final List<double> center;

  String get displayName => name?.trim().isNotEmpty == true ? name! : code!;
}
