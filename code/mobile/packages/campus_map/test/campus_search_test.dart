import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late CampusSnapshot snapshot;
  late LocalCampusPlaceRepository repository;
  setUp(() {
    snapshot = CampusSnapshot.parse(
      File('assets/data/campus_footprints.geojson').readAsStringSync(),
    );
    repository = LocalCampusPlaceRepository(loadSnapshot: () async => snapshot);
  });

  test('vazio e espaços não carregam nem listam todo o campus', () async {
    final empty = LocalCampusPlaceRepository(
      loadSnapshot: () => throw StateError('não carregar'),
    );
    for (final query in ['', '   ', '\t\n']) {
      expect(await empty.search(query), isEmpty);
    }
  });

  test('case, espaços, acentos compostos e decompostos', () async {
    final expected = (await repository.search('ciências'))
        .map((p) => p.id)
        .toList();
    expect(expected, isNotEmpty);
    for (final query in [' CIENCIAS  ', 'CIÊNCIAS', 'cie\u0302ncias']) {
      expect((await repository.search(query)).map((p) => p.id), expected);
    }
    expect(normalizeCampusQuery('  PrÉdio   26\t'), 'predio 26');
  });

  test('código real exato, nome exato, prefixo e contains', () async {
    expect((await repository.search('26')).first.id, 'P26');
    expect((await repository.search('Prédio 2')).first.id, 'P02');
    expect((await repository.search('Biblioteca')).single.id, 'P26');
    expect((await repository.search('Alberto Antoniazzi')).single.id, 'P26');
    expect(await repository.search('sala inexistente xyz'), isEmpty);
    // P01 é ID, enquanto o código existente no snapshot é "1".
    expect(await repository.search('P01'), isEmpty);
  });

  test('limite centralizado, IDs únicos e ordenação determinística', () async {
    final first = await repository.search('prédio');
    expect(first, hasLength(LocalCampusPlaceRepository.resultLimit));
    expect(first.map((p) => p.id).toSet(), hasLength(first.length));
    expect(
      (await repository.search('PRÉDIO')).map((p) => p.id),
      first.map((p) => p.id),
    );
    final reverse = LocalCampusPlaceRepository(
      loadSnapshot: () async {
        final json = snapshot.toGeoJson();
        json['features'] = (json['features'] as List).reversed.toList();
        return CampusSnapshot.parse(jsonEncode(json));
      },
    );
    expect(
      (await reverse.search('prédio')).map((p) => p.id),
      first.map((p) => p.id),
    );
  });

  test(
    '77 lugares reais preservam identidade e centro; cinco anônimos omitidos',
    () async {
      var count = 0;
      for (final feature in snapshot.features) {
        final place = await repository.findById(feature.id);
        if (feature.name == null && feature.code == null) {
          expect(place, isNull);
          continue;
        }
        count++;
        expect(place!.id, feature.id);
        expect(place.name, feature.name);
        expect(place.code, feature.code);
        expect(place.type, feature.type);
        expect(place.center, feature.center);
        expect(place.center[0].abs(), lessThanOrEqualTo(180));
        expect(place.center[1].abs(), lessThanOrEqualTo(90));
        expect(() => place.center[0] = 0, throwsUnsupportedError);
      }
      expect(count, 77);
      expect(await repository.findById('inexistente'), isNull);
    },
  );

  test('ranking: código exato > nome exato > nome prefixo > código prefixo > contém', () async {
    final source = CampusSnapshot.parse(
      jsonEncode({
        'type': 'FeatureCollection',
        'features': [
          for (final (id, name, code) in [
            ('contains', 'Z teste', '9'),
            ('code-prefix', 'Z', 'teste2'),
            ('name-prefix', 'Teste adicional', '8'),
            ('name-exact', 'Teste', '7'),
            ('code-exact', 'Outro', 'teste'),
            ('code-only', null, '99'),
          ])
            {
              'type': 'Feature',
              'id': id,
              'properties': {
                'id': id,
                'name': name,
                'code': code,
                'center': [-43.99, -19.92],
              },
              'geometry': {
                'type': 'Polygon',
                'coordinates': [
                  [
                    [-44, -20],
                    [-43, -20],
                    [-43, -19],
                    [-44, -20],
                  ],
                ],
              },
            },
        ],
      }),
    );
    final ranking = LocalCampusPlaceRepository(
      loadSnapshot: () async => source,
    );
    expect((await ranking.search('teste')).map((p) => p.id), [
      'code-exact',
      'name-exact',
      'name-prefix',
      'code-prefix',
      'contains',
    ]);
    expect((await ranking.search('99')).single.displayName, '99');
  });

  test('índice compartilhado entre consultas e retry após falha', () async {
    var loads = 0;
    final cached = LocalCampusPlaceRepository(
      loadSnapshot: () async {
        loads++;
        if (loads == 1) throw StateError('fonte temporariamente indisponível');
        return snapshot;
      },
    );
    await expectLater(cached.search('biblioteca'), throwsStateError);
    await Future.wait([
      cached.search('biblioteca'),
      cached.search('26'),
      cached.findById('P26'),
    ]);
    expect(loads, 2);
  });

  test('modelo rejeita identidade e coordenadas inválidas', () {
    for (final center in [
      <double>[],
      [181.0, 0.0],
      [0.0, double.nan],
    ]) {
      expect(
        () => CampusPlace(id: 'a', name: 'A', center: center),
        throwsArgumentError,
      );
    }
    expect(
      () => CampusPlace(id: '', name: 'A', center: [0, 0]),
      throwsArgumentError,
    );
    expect(() => CampusPlace(id: 'a', center: [0, 0]), throwsArgumentError);
  });
}
