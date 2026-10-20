import 'package:campus_map/src/three_d/campus_asset_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const version = '2026-09-30-r1';
  const expected =
      'https://assets.example.invalid/map-assets/campus/versions/'
      '2026-09-30-r1/models/lod0/c00.glb';

  test('monta base + versão + caminho relativo, com ou sem barra final', () {
    for (final base in [
      'https://assets.example.invalid/map-assets',
      'https://assets.example.invalid/map-assets/',
      '  https://assets.example.invalid/map-assets/  ',
    ]) {
      final resolver = CampusAssetResolver.tryCreate(base, version)!;
      expect(resolver.resolve('models/lod0/c00.glb').toString(), expected);
      expect(
        resolver.versionRoot.toString(),
        'https://assets.example.invalid/map-assets/campus/versions/$version/',
      );
    }
  });

  test('base na raiz do host também funciona', () {
    final resolver = CampusAssetResolver.tryCreate(
      'https://cdn.example.invalid',
      version,
    )!;
    expect(
      resolver.resolve('manifests/campus-models.json').toString(),
      'https://cdn.example.invalid/campus/versions/$version/'
      'manifests/campus-models.json',
    );
  });

  test('configuração ausente ou insegura desativa o 3D', () {
    for (final base in [
      '',
      '   ',
      'map-assets',
      'http://assets.example.invalid/map-assets',
      'file:///sdcard/map-assets',
      'https://assets.example.invalid/map-assets?sv=1&sig=abc',
      'https://assets.example.invalid/map-assets#x',
      'https://user:pass@assets.example.invalid/map-assets',
    ]) {
      expect(
        CampusAssetResolver.tryCreate(base, version),
        isNull,
        reason: base,
      );
    }
    expect(
      CampusAssetResolver.tryCreate('https://a.example.invalid', ''),
      isNull,
    );
    expect(
      CampusAssetResolver.tryCreate('https://a.example.invalid', 'a/b'),
      isNull,
    );
  });

  test('não aceita caminho absoluto, com esquema ou fora da versão', () {
    final resolver = CampusAssetResolver.tryCreate(
      'https://assets.example.invalid/map-assets',
      version,
    )!;
    for (final path in [
      '',
      '/models/lod0/c00.glb',
      '../2026-01-01-r1/models/lod0/c00.glb',
      'models/../../x.glb',
      'models//c00.glb',
      r'models\lod0\c00.glb',
      'https://other.example.invalid/c00.glb',
    ]) {
      expect(() => resolver.resolve(path), throwsArgumentError, reason: path);
    }
  });
}
