/// Seção `pucstops` do manifesto: só o GLB do totem e como posicioná-lo.
/// As posições dos PucStops NÃO ficam aqui (vêm da API, que também decide a
/// coleta); assim não há duas fontes de verdade para o mesmo ponto.
///
/// Adaptado de `map_renderer.dart` do PUCMaps: altura 12 m, modelo com
/// 16,39 unidades de altura e giro de 180° (cálice de frente).
class CampusPucStopModel {
  CampusPucStopModel._({
    required this.id,
    required this.path,
    required this.bytes,
    required this.sha256,
    required this.heightMeters,
    required this.modelHeightUnits,
    required this.orientation,
  });

  static final _idPattern = RegExp(r'^[a-z0-9][a-z0-9_-]{0,63}$');
  static final _pathPattern = RegExp(r'^models/pucstops/[a-z0-9_-]+\.glb$');
  static final _hashPattern = RegExp(r'^[0-9a-f]{64}$');
  static final _debug = RegExp(r'(debug|(^|/)(ss|nowin|ind)_)');

  factory CampusPucStopModel.parse(dynamic raw) {
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('Seção pucstops inválida.');
    }
    final models = raw['models'];
    if (models is! List || models.length != 1) {
      throw const FormatException('A seção pucstops tem um único totem.');
    }
    final model = models.single;
    final placement = raw['placement'];
    if (model is! Map<String, dynamic> || placement is! Map<String, dynamic>) {
      throw const FormatException('Totem inválido.');
    }
    final id = model['id'];
    final kind = model['kind'];
    final path = model['path'];
    final bytes = model['bytes'];
    final sha256 = model['sha256'];
    final height = placement['heightMeters'];
    final units = placement['modelHeightUnits'];
    final orientation = placement['orientation'];
    if (id is! String ||
        !_idPattern.hasMatch(id) ||
        kind != 'totem' ||
        path is! String ||
        !_pathPattern.hasMatch(path) ||
        _debug.hasMatch(path) ||
        bytes is! int ||
        bytes <= 0 ||
        sha256 is! String ||
        !_hashPattern.hasMatch(sha256) ||
        height is! num ||
        !(height > 0 && height <= 50) ||
        units is! num ||
        !(units > 0 && units.toDouble().isFinite) ||
        orientation is! List ||
        orientation.length != 3 ||
        orientation.any((v) => v is! num || !v.toDouble().isFinite)) {
      throw const FormatException('Totem inválido.');
    }
    return CampusPucStopModel._(
      id: id,
      path: path,
      bytes: bytes,
      sha256: sha256,
      heightMeters: height.toDouble(),
      modelHeightUnits: units.toDouble(),
      orientation: List.unmodifiable([
        for (final v in orientation) (v as num).toDouble(),
      ]),
    );
  }

  final String id;
  final String path;
  final int bytes;
  final String sha256;
  final double heightMeters;
  final double modelHeightUnits;

  /// Graus `[x, y, z]` (`model-rotation`).
  final List<double> orientation;

  /// Escala uniforme para o totem ficar com [heightMeters] de altura.
  double get scale => heightMeters / modelHeightUnits;
}
