import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../campus_snapshot.dart';
import 'campus_environment.dart';

enum CampusModelLod { lod0, lod1 }

/// Manifesto dos GLBs do campus. Adaptado de `campus_chunks.json` (PUCMaps):
/// mantém só o que o renderer usa. Os caminhos são relativos à versão.
///
/// `vegetation` e `props` são opcionais e isolados: uma seção ausente ou
/// inválida vira `null` e os prédios continuam.
class CampusModelManifest {
  CampusModelManifest._({
    required this.version,
    required this.orientation,
    required this.scale,
    required this.lod1,
    required this.lod0,
    required this.buildings,
    required this.source,
    this.vegetation,
    this.props,
  });

  static const schemaVersion = 1;
  static final _versionPattern = RegExp(r'^[a-z0-9][a-z0-9.-]{0,63}$');
  static final _colorPattern = RegExp(r'^#[0-9a-f]{6}$');
  static final _hashPattern = RegExp(r'^[0-9a-f]{64}$');

  factory CampusModelManifest.parse(String text) {
    final json = jsonDecode(text);
    if (json is! Map<String, dynamic> ||
        json['schemaVersion'] != schemaVersion) {
      throw const FormatException('Manifesto 3D inválido.');
    }
    final version = json['version'];
    if (version is! String || !_versionPattern.hasMatch(version)) {
      throw const FormatException('Versão do manifesto 3D inválida.');
    }
    final placement = json['placement'];
    if (placement is! Map<String, dynamic> || placement['units'] != 'meters') {
      throw const FormatException('Convenção de posicionamento inválida.');
    }
    final orientation = _vector(placement['orientation']);
    final scale = _vector(placement['scale']);
    if (scale.any((value) => value <= 0)) {
      throw const FormatException('Escala inválida.');
    }

    final lod1 = _models(json['lod1'], CampusModelLod.lod1);
    final lod0 = _models(json['lod0'], CampusModelLod.lod0);
    final ids = <String>{};
    for (final model in [...lod1, ...lod0]) {
      if (!ids.add(model.id)) {
        throw const FormatException('Modelo 3D duplicado.');
      }
    }

    final rawBuildings = json['buildings'];
    if (rawBuildings is! List || rawBuildings.isEmpty) {
      throw const FormatException('Prédios ausentes no manifesto 3D.');
    }
    final buildings = <CampusModelBuilding>[];
    final buildingIds = <String>{};
    for (final raw in rawBuildings) {
      if (raw is! Map<String, dynamic>) {
        throw const FormatException('Prédio inválido no manifesto 3D.');
      }
      final building = CampusModelBuilding._(
        id: _string(raw['id']),
        lod0: _string(raw['lod0']),
        lod1: _string(raw['lod1']),
        wallColor: _string(raw['wallColor']),
      );
      if (!_colorPattern.hasMatch(building.wallColor) ||
          !buildingIds.add(building.id)) {
        throw const FormatException('Prédio inválido no manifesto 3D.');
      }
      buildings.add(building);
    }

    // Cada prédio pertence a exatamente um modelo de cada LOD e o vínculo
    // declarado no prédio precisa bater com a lista do modelo.
    for (final (models, lodOf) in [
      (lod0, (CampusModelBuilding b) => b.lod0),
      (lod1, (CampusModelBuilding b) => b.lod1),
    ]) {
      final owner = <String, String>{};
      for (final model in models) {
        for (final id in model.buildingIds) {
          if (!buildingIds.contains(id) || owner.containsKey(id)) {
            throw const FormatException('Vínculo prédio/modelo inválido.');
          }
          owner[id] = model.id;
        }
      }
      for (final building in buildings) {
        if (owner[building.id] != lodOf(building)) {
          throw const FormatException('Vínculo prédio/modelo inválido.');
        }
      }
    }
    final lod1Ids = {for (final model in lod1) model.id};
    if (lod0.any((model) => !lod1Ids.contains(model.lod1Group))) {
      throw const FormatException('Chunk LOD0 sem grupo LOD1.');
    }

    final campus = _union([for (final model in lod1) model.bounds]);
    final source = json['source'];
    return CampusModelManifest._(
      version: version,
      orientation: orientation,
      scale: scale,
      lod1: List.unmodifiable(lod1),
      lod0: List.unmodifiable(lod0),
      buildings: List.unmodifiable(buildings),
      source: Map.unmodifiable(
        source is Map<String, dynamic> ? source : const <String, dynamic>{},
      ),
      vegetation: _environment(json, 'vegetation', campus),
      props: _environment(json, 'props', campus),
    );
  }

  final String version;
  final List<double> orientation;
  final List<double> scale;
  final List<CampusModel> lod1;
  final List<CampusModel> lod0;
  final List<CampusModelBuilding> buildings;
  final Map<String, dynamic> source;
  final CampusEnvironmentSet? vegetation;
  final CampusEnvironmentSet? props;

  List<String> get buildingIds => [for (final b in buildings) b.id];

  static CampusEnvironmentSet? _environment(
    Map<String, dynamic> json,
    String name,
    CampusBounds campus,
  ) {
    if (!json.containsKey(name)) return null;
    try {
      return CampusEnvironmentSet.parse(name, json[name], campus: campus);
    } on FormatException catch (error) {
      if (kDebugMode || kProfileMode) {
        debugPrint('[campus3d] $name desativado: ${error.message}');
      }
      return null;
    }
  }

  static CampusBounds _union(List<CampusBounds> all) => CampusBounds(
    west: all.map((b) => b.west).reduce((a, b) => a < b ? a : b),
    south: all.map((b) => b.south).reduce((a, b) => a < b ? a : b),
    east: all.map((b) => b.east).reduce((a, b) => a > b ? a : b),
    north: all.map((b) => b.north).reduce((a, b) => a > b ? a : b),
  );

  static List<CampusModel> _models(dynamic raw, CampusModelLod lod) {
    if (raw is! List || raw.isEmpty) {
      throw const FormatException('Lista de modelos 3D ausente.');
    }
    return [for (final item in raw) CampusModel._parse(item, lod)];
  }

  static List<double> _vector(dynamic raw) {
    if (raw is! List ||
        raw.length != 3 ||
        raw.any((value) => value is! num || !value.toDouble().isFinite)) {
      throw const FormatException('Vetor de posicionamento inválido.');
    }
    return List.unmodifiable([for (final v in raw) (v as num).toDouble()]);
  }

  static String _string(dynamic raw) {
    if (raw is! String || raw.isEmpty) {
      throw const FormatException('Campo textual ausente no manifesto 3D.');
    }
    return raw;
  }
}

/// Um GLB do campus: um chunk LOD0 ou um grupo LOD1 com vários prédios.
class CampusModel {
  CampusModel._({
    required this.id,
    required this.lod,
    required this.path,
    required this.anchor,
    required this.bounds,
    required this.buildingIds,
    required this.bytes,
    required this.sha256,
    this.lod1Group,
  });

  /// Somente `models/<lod>/<arquivo>.glb`: sem esquema, host, `..` ou `/` inicial.
  static final _pathPattern = RegExp(r'^models/(lod[01])/[a-z0-9_-]+\.glb$');

  factory CampusModel._parse(dynamic raw, CampusModelLod lod) {
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('Modelo 3D inválido.');
    }
    final id = CampusModelManifest._string(raw['id']);
    final path = CampusModelManifest._string(raw['path']);
    final match = _pathPattern.firstMatch(path);
    if (match == null || match.group(1) != lod.name) {
      throw const FormatException('Caminho relativo de modelo 3D inválido.');
    }
    final anchor = raw['anchor'];
    final bbox = raw['bbox'];
    final buildings = raw['buildings'];
    final bytes = raw['bytes'];
    final sha256 = raw['sha256'];
    if (anchor is! List ||
        anchor.length != 2 ||
        bbox is! List ||
        bbox.length != 4 ||
        buildings is! List ||
        buildings.isEmpty ||
        buildings.any((id) => id is! String || id.isEmpty) ||
        bytes is! int ||
        bytes <= 0 ||
        sha256 is! String ||
        !CampusModelManifest._hashPattern.hasMatch(sha256)) {
      throw const FormatException('Modelo 3D inválido.');
    }
    final values = [...anchor, ...bbox];
    if (values.any((value) => value is! num || !value.toDouble().isFinite)) {
      throw const FormatException('Coordenada de modelo 3D inválida.');
    }
    final lon = (anchor[0] as num).toDouble();
    final lat = (anchor[1] as num).toDouble();
    final bounds = CampusBounds(
      west: (bbox[0] as num).toDouble(),
      south: (bbox[1] as num).toDouble(),
      east: (bbox[2] as num).toDouble(),
      north: (bbox[3] as num).toDouble(),
    );
    if (lon.abs() > 180 ||
        lat.abs() > 90 ||
        bounds.west > bounds.east ||
        bounds.south > bounds.north) {
      throw const FormatException('Coordenada de modelo 3D inválida.');
    }
    final group = raw['lod1'];
    if (lod == CampusModelLod.lod0 && (group is! String || group.isEmpty)) {
      throw const FormatException('Chunk LOD0 sem grupo LOD1.');
    }
    return CampusModel._(
      id: id,
      lod: lod,
      path: path,
      anchor: List.unmodifiable([lon, lat]),
      bounds: bounds,
      buildingIds: List.unmodifiable(buildings.cast<String>()),
      bytes: bytes,
      sha256: sha256,
      lod1Group: group as String?,
    );
  }

  final String id;
  final CampusModelLod lod;
  final String path;

  /// `[longitude, latitude]` da origem do GLB (convenção do pipeline).
  final List<double> anchor;
  final CampusBounds bounds;
  final List<String> buildingIds;
  final int bytes;
  final String sha256;
  final String? lod1Group;
}

class CampusModelBuilding {
  const CampusModelBuilding._({
    required this.id,
    required this.lod0,
    required this.lod1,
    required this.wallColor,
  });

  /// Mesmo `id` da feature em `campus_footprints.geojson`.
  final String id;
  final String lod0;
  final String lod1;

  /// Cor de parede do GLB, usada só na extrusão (LOD2/pendente).
  final String wallColor;
}

abstract interface class CampusModelManifestSource {
  Future<CampusModelManifest> load();
}

/// Manifesto versionado no package; os GLBs vêm da URL pública.
class LocalCampusModelManifestSource implements CampusModelManifestSource {
  const LocalCampusModelManifestSource({this.bundle});

  static const assetPath = 'packages/campus_map/assets/data/campus_models.json';

  final AssetBundle? bundle;

  @override
  Future<CampusModelManifest> load() async => CampusModelManifest.parse(
    await (bundle ?? rootBundle).loadString(assetPath),
  );
}
