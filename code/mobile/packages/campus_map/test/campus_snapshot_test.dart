import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final file = File('assets/data/campus_footprints.geojson');
  late String source;

  setUpAll(() => source = file.readAsStringSync());

  test('asset real contém 82 polígonos e propriedades de origem', () {
    expect(file.existsSync(), isTrue);
    final snapshot = CampusSnapshot.parse(source);
    expect(snapshot.features, hasLength(82));
    expect(snapshot.buildingCount, 82);
    expect(snapshot.areaCount, 0);
    expect(snapshot.metadata['provider'], 'OpenStreetMap');
    expect(snapshot.metadata['license'], 'ODbL 1.0');
    final library = snapshot.features.singleWhere((f) => f.id == 'P26');
    expect(library.name, 'Biblioteca Padre Alberto Antoniazzi - P. 26');
    expect(library.code, '26');
    for (final feature in snapshot.features) {
      expect(feature.geometryType, 'Polygon');
      expect(
        feature.properties.keys,
        containsAll([
          'id',
          'name',
          'code',
          'height',
          'minHeight',
          'osmId',
          'apiId',
          'center',
        ]),
      );
      expect(feature.center, hasLength(2));
      expect(feature.polygons.single, isNotEmpty);
    }
    expect(snapshot.features.where((f) => f.name == null), hasLength(5));
    expect(
      snapshot.features.where((f) => f.properties['apiId'] != null),
      hasLength(74),
    );
  });

  test('bbox WGS84 real preserva a extensão das construções', () {
    final bounds = CampusSnapshot.parse(source).bounds;
    expect(bounds.west, -43.9959851);
    expect(bounds.south, -19.9265038);
    expect(bounds.east, -43.9894739);
    expect(bounds.north, -19.9185445);
    expect(bounds.latitude, closeTo(-19.92252415, 1e-10));
    expect(bounds.longitude, closeTo(-43.9927295, 1e-10));
  });

  test('serialização preserva exatamente as coordenadas e propriedades', () {
    final json = jsonDecode(source) as Map<String, dynamic>;
    expect(
      CampusSnapshot.parse(source).toGeoJson()['features'],
      json['features'],
    );
  });

  test('dados carregados são imutáveis', () {
    final snapshot = CampusSnapshot.parse(source);
    expect(() => snapshot.features.clear(), throwsUnsupportedError);
    expect(
      () => snapshot.features.first.properties['name'] = 'alterado',
      throwsUnsupportedError,
    );
    expect(
      () => snapshot.features.first.polygons.first.first.first[0] = 0,
      throwsUnsupportedError,
    );
  });

  test(
    'parser rejeita dados vazios, duplicados, coordenadas e anéis inválidos',
    () {
      expect(() => CampusSnapshot.parse('{}'), throwsFormatException);
      expect(
        () =>
            CampusSnapshot.parse('{"type":"FeatureCollection","features":[]}'),
        throwsFormatException,
      );
      for (final mutation in <void Function(Map<String, dynamic>)>[
        (json) => (json['features'] as List).add(json['features'][0]),
        (json) => json['features'][0]['geometry']['coordinates'][0][0][0] = 181,
        (json) =>
            json['features'][0]['geometry']['coordinates'][0].removeLast(),
        (json) => json['features'][0]['properties'].remove('id'),
        (json) => json['features'][0]['properties'].remove('name'),
      ]) {
        final json = jsonDecode(source) as Map<String, dynamic>;
        mutation(json);
        expect(
          () => CampusSnapshot.parse(jsonEncode(json)),
          throwsFormatException,
        );
      }
    },
  );

  test('áreas PARK/PARKING_LOT/CONSTRUCTION são reconhecidas sem volumes', () {
    for (final type in ['PARK', 'PARKING_LOT', 'CONSTRUCTION']) {
      final json = jsonDecode(source) as Map<String, dynamic>;
      json['features'][0]['properties']['type'] = type;
      expect(CampusSnapshot.parse(jsonEncode(json)).areaCount, 1);
    }
  });

  test('data source local lê bundle sem backend', () async {
    final bundle = _SnapshotBundle(source);
    final snapshot = await LocalCampusDataSource(bundle: bundle).load();
    expect(bundle.loadedKey, LocalCampusDataSource.assetPath);
    expect(snapshot.features, hasLength(82));
  });

  testWidgets('sem token não solicita sequer os dados locais', (tester) async {
    final dataSource = _CountingSource();
    await tester.pumpWidget(
      MaterialApp(
        home: CampusMapView(
          config: const CampusMapConfig(mapboxAccessToken: ''),
          dataSource: dataSource,
        ),
      ),
    );
    expect(dataSource.calls, 0);
    expect(find.textContaining('Mapa indisponível'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _SnapshotBundle extends CachingAssetBundle {
  _SnapshotBundle(this.source);
  final String source;
  String? loadedKey;

  @override
  Future<ByteData> load(String key) async {
    loadedKey = key;
    return ByteData.sublistView(Uint8List.fromList(utf8.encode(source)));
  }
}

class _CountingSource implements CampusDataSource {
  int calls = 0;

  @override
  Future<CampusSnapshot> load() {
    calls++;
    throw StateError('Não deve carregar sem token.');
  }
}
