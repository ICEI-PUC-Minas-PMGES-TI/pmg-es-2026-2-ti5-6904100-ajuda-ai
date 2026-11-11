import '../campus_snapshot.dart';

/// Seção ambiental do manifesto 3D: GLBs pequenos repetidos em pontos
/// (vegetação ou props). Adaptado de `trees_pilot.geojson`, `cars.geojson` e
/// `campus_sports.json` do PUCMaps; os caminhos são relativos à versão.
class CampusEnvironmentSet {
  CampusEnvironmentSet._({
    required this.name,
    required this.models,
    required this.instances,
    required this.source,
  });

  /// Seções aceitas e os tipos de modelo de cada uma. Qualquer outro tipo
  /// (totem, debug, variante) recusa a seção inteira.
  static const kindsBySection = {
    'vegetation': {'tree'},
    'props': {'sports', 'vehicle'},
  };

  static final _idPattern = RegExp(r'^[a-z0-9][a-z0-9_-]{0,63}$');
  static final _hashPattern = RegExp(r'^[0-9a-f]{64}$');

  /// Nomes do PUCMaps que não são ambientação de produto: PucStop/totem e as
  /// variantes A/B do painel de diagnóstico.
  static final _forbidden = RegExp(
    r'(debug|totem|pucstop|torre|(^|/)(ss|nowin|ind)_)',
  );

  /// Distância máxima (graus) de uma instância até a área dos prédios.
  static const _campusMargin = 0.002;

  factory CampusEnvironmentSet.parse(
    String name,
    dynamic raw, {
    required CampusBounds campus,
  }) {
    final kinds = kindsBySection[name];
    if (kinds == null || raw is! Map<String, dynamic>) {
      throw FormatException('Seção ambiental inválida: $name.');
    }
    final pathPattern = RegExp('^models/$name/[a-z0-9_-]+\\.glb\$');

    final rawModels = raw['models'];
    if (rawModels is! List || rawModels.isEmpty) {
      throw FormatException('Modelos ausentes em $name.');
    }
    final models = <String, CampusEnvironmentModel>{};
    for (final item in rawModels) {
      if (item is! Map<String, dynamic>) {
        throw FormatException('Modelo inválido em $name.');
      }
      final id = item['id'];
      final kind = item['kind'];
      final path = item['path'];
      final bytes = item['bytes'];
      final sha256 = item['sha256'];
      if (id is! String ||
          !_idPattern.hasMatch(id) ||
          kind is! String ||
          !kinds.contains(kind) ||
          path is! String ||
          !pathPattern.hasMatch(path) ||
          _forbidden.hasMatch(id) ||
          _forbidden.hasMatch(path) ||
          bytes is! int ||
          bytes <= 0 ||
          sha256 is! String ||
          !_hashPattern.hasMatch(sha256)) {
        throw FormatException('Modelo inválido em $name.');
      }
      if (models.containsKey(id)) {
        throw FormatException('Modelo duplicado em $name.');
      }
      models[id] = CampusEnvironmentModel._(
        id: id,
        kind: kind,
        path: path,
        bytes: bytes,
        sha256: sha256,
      );
    }
    if ({for (final m in models.values) m.path}.length != models.length) {
      throw FormatException('Caminho repetido em $name.');
    }

    final rawInstances = raw['instances'];
    if (rawInstances is! List || rawInstances.isEmpty) {
      throw FormatException('Instâncias ausentes em $name.');
    }
    final instances = <CampusEnvironmentInstance>[];
    final instanceIds = <String>{};
    final used = <String>{};
    for (final item in rawInstances) {
      if (item is! Map<String, dynamic>) {
        throw FormatException('Instância inválida em $name.');
      }
      final id = item['id'];
      final model = item['model'];
      final position = item['position'];
      final scale = item['scale'];
      final rotation = item['rotation'];
      if (id is! String ||
          !_idPattern.hasMatch(id) ||
          !instanceIds.add(id) ||
          model is! String ||
          !models.containsKey(model) ||
          position is! List ||
          position.length != 2 ||
          position.any((v) => v is! num || !v.toDouble().isFinite) ||
          scale is! num ||
          !scale.toDouble().isFinite ||
          scale <= 0 ||
          scale > 10 ||
          rotation is! num ||
          !rotation.toDouble().isFinite) {
        throw FormatException('Instância inválida em $name.');
      }
      final lon = (position[0] as num).toDouble();
      final lat = (position[1] as num).toDouble();
      if (lon < campus.west - _campusMargin ||
          lon > campus.east + _campusMargin ||
          lat < campus.south - _campusMargin ||
          lat > campus.north + _campusMargin) {
        throw FormatException('Instância fora do campus em $name.');
      }
      used.add(model);
      instances.add(
        CampusEnvironmentInstance._(
          id: id,
          model: model,
          longitude: lon,
          latitude: lat,
          scale: scale.toDouble(),
          rotation: rotation.toDouble(),
        ),
      );
    }
    // Variante sem nenhuma instância seria download sem uso.
    if (used.length != models.length) {
      throw FormatException('Modelo sem uso em $name.');
    }

    final source = raw['source'];
    return CampusEnvironmentSet._(
      name: name,
      models: List.unmodifiable(models.values),
      instances: List.unmodifiable(instances),
      source: Map.unmodifiable(
        source is Map<String, dynamic> ? source : const <String, dynamic>{},
      ),
    );
  }

  /// `vegetation` ou `props`.
  final String name;
  final List<CampusEnvironmentModel> models;
  final List<CampusEnvironmentInstance> instances;
  final Map<String, dynamic> source;

  int get bytes => models.fold(0, (sum, model) => sum + model.bytes);

  /// Tipos com pelo menos uma instância, na ordem dos modelos.
  List<String> get kinds =>
      List.unmodifiable({for (final model in models) model.kind});

  CampusEnvironmentModel model(String id) =>
      models.firstWhere((model) => model.id == id);
}

class CampusEnvironmentModel {
  const CampusEnvironmentModel._({
    required this.id,
    required this.kind,
    required this.path,
    required this.bytes,
    required this.sha256,
  });

  final String id;
  final String kind;
  final String path;
  final int bytes;
  final String sha256;
}

/// Um ponto no chão: o GLB tem origem na base, eixo Y para cima, metros.
class CampusEnvironmentInstance {
  const CampusEnvironmentInstance._({
    required this.id,
    required this.model,
    required this.longitude,
    required this.latitude,
    required this.scale,
    required this.rotation,
  });

  final String id;
  final String model;
  final double longitude;
  final double latitude;

  /// Escala uniforme (`scale3` do PUCMaps com os três eixos iguais).
  final double scale;

  /// Giro em graus no eixo vertical (`rot3[2]` do PUCMaps).
  final double rotation;
}
