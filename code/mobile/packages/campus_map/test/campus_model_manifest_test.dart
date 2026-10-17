import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late String source;
  late CampusModelManifest manifest;
  late CampusSnapshot snapshot;

  setUpAll(() {
    source = File('assets/data/campus_models.json').readAsStringSync();
    manifest = CampusModelManifest.parse(source);
    snapshot = CampusSnapshot.parse(
      File('assets/data/campus_footprints.geojson').readAsStringSync(),
    );
  });

  Map<String, dynamic> mutable() => jsonDecode(source) as Map<String, dynamic>;
  void rejects(void Function(Map<String, dynamic> json) change) {
    final json = mutable();
    change(json);
    expect(
      () => CampusModelManifest.parse(jsonEncode(json)),
      throwsFormatException,
    );
  }

  test('manifesto versionado tem os 16 GLBs de prédios e 82 prédios', () {
    // r2 = mesmos prédios da r1 publicada + vegetação/props (versão imutável).
    expect(manifest.version, '2026-09-30-r2');
    expect(manifest.lod0, hasLength(12));
    expect(manifest.lod1, hasLength(4));
    expect(manifest.buildings, hasLength(82));
    expect(
      manifest.lod0.fold<int>(0, (sum, model) => sum + model.bytes),
      3970300,
    );
    expect(
      manifest.lod1.fold<int>(0, (sum, model) => sum + model.bytes),
      1134592,
    );
    expect(manifest.orientation, [0, 0, 0]);
    expect(manifest.scale, [1, 1, 1]);
    expect(manifest.source['osmTimestamp'], '2026-09-30T17:10:14Z');
  });

  test('ids únicos e caminhos relativos dentro da pasta do LOD', () {
    final models = [...manifest.lod0, ...manifest.lod1];
    expect(models.map((m) => m.id).toSet(), hasLength(models.length));
    for (final model in models) {
      expect(model.path, startsWith('models/${model.lod.name}/'));
      expect(model.path, endsWith('.glb'));
      expect(model.path, isNot(contains('..')));
      expect(Uri.parse(model.path).hasScheme, isFalse);
      expect(model.sha256, matches(RegExp(r'^[0-9a-f]{64}$')));
    }
  });

  test('nenhum asset de debug, PucStop ou override de material', () {
    final text = source.toLowerCase();
    for (final banned in [
      'debug',
      'nowin',
      'ss_g',
      'ind_p',
      'totem',
      'pucstop',
      'materialoverride',
      'window_emissive',
    ]) {
      expect(text, isNot(contains(banned)), reason: banned);
    }
  });

  test('ambiente fica fora das listas de prédios', () {
    for (final model in [...manifest.lod0, ...manifest.lod1]) {
      expect(model.path, isNot(matches(RegExp('tree_|car_|sports'))));
    }
  });

  test('todo prédio 3D tem footprint 2D com o mesmo id estável', () {
    final footprints = {for (final f in snapshot.features) f.id};
    expect(manifest.buildingIds.toSet(), footprints);
    for (final model in [...manifest.lod0, ...manifest.lod1]) {
      expect(footprints.containsAll(model.buildingIds), isTrue);
    }
  });

  test('cada prédio pertence a um chunk LOD0 e a um grupo LOD1', () {
    for (final building in manifest.buildings) {
      final chunk = manifest.lod0.singleWhere((m) => m.id == building.lod0);
      final group = manifest.lod1.singleWhere((m) => m.id == building.lod1);
      expect(chunk.buildingIds, contains(building.id));
      expect(group.buildingIds, contains(building.id));
      expect(chunk.lod1Group, group.id);
    }
  });

  test('rejeita manifestos inválidos', () {
    rejects((json) => json['schemaVersion'] = 2);
    rejects((json) => json.remove('version'));
    rejects((json) => json['version'] = 'current/../x');
    rejects((json) => (json['placement'] as Map)['units'] = 'cm');
    rejects((json) => (json['placement'] as Map)['scale'] = [0, 1, 1]);
    rejects(
      (json) => ((json['lod0'] as List).first as Map)['path'] =
          'https://example.invalid/models/lod0/c00.glb',
    );
    rejects(
      (json) =>
          ((json['lod0'] as List).first as Map)['path'] = '../lod0/c00.glb',
    );
    rejects(
      (json) =>
          ((json['lod0'] as List).first as Map)['path'] = 'models/lod1/c00.glb',
    );
    rejects(
      (json) => ((json['lod1'] as List).first as Map)['id'] =
          ((json['lod0'] as List).first as Map)['id'],
    );
    rejects(
      (json) =>
          ((json['buildings'] as List).first as Map)['wallColor'] = 'blue',
    );
    rejects((json) {
      final first = (json['lod0'] as List).first as Map;
      final last = (json['lod0'] as List).last as Map;
      (last['buildings'] as List).add((first['buildings'] as List).first);
    });
  });

  test('fonte local lê o asset do package pelo bundle', () async {
    final bundle = _MapBundle({
      LocalCampusModelManifestSource.assetPath: source,
    });
    final loaded = await LocalCampusModelManifestSource(bundle: bundle).load();
    expect(loaded.version, manifest.version);
  });
}

class _MapBundle extends CachingAssetBundle {
  _MapBundle(this.assets);

  final Map<String, String> assets;

  @override
  Future<ByteData> load(String key) async {
    final value = assets[key];
    if (value == null) throw StateError('asset ausente: $key');
    return ByteData.sublistView(utf8.encode(value));
  }
}
