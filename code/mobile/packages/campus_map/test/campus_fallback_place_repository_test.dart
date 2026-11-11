import 'package:campus_map/campus_map.dart';
import 'package:flutter_test/flutter_test.dart';

CampusPlace lugar(String id, String name) =>
    CampusPlace(id: id, name: name, center: const [-43.99, -19.92]);

class _Fake implements CampusPlaceRepository {
  _Fake({this.results = const [], this.byId = const {}, this.fail = false});

  final List<CampusPlace> results;
  final Map<String, CampusPlace> byId;
  bool fail;
  int searches = 0;
  int finds = 0;

  @override
  Future<List<CampusPlace>> search(String query) async {
    searches++;
    if (fail) throw Exception('rede');
    return results;
  }

  @override
  Future<CampusPlace?> findById(String id) async {
    finds++;
    if (fail) throw Exception('rede');
    return byId[id];
  }
}

void main() {
  test('remota respondendo: usa a remota e não toca no local', () async {
    final remote = _Fake(results: [lugar('P26', 'Biblioteca')]);
    final local = _Fake(results: [lugar('X', 'Local')]);
    final repo = FallbackCampusPlaceRepository(
      primary: remote,
      fallback: local,
    );
    expect((await repo.search('bibli')).map((p) => p.id), ['P26']);
    expect(repo.lastSource, 'remote');
    expect(local.searches, 0);
  });

  test('remota falhando: responde pelo local, sem erro', () async {
    final repo = FallbackCampusPlaceRepository(
      primary: _Fake(fail: true),
      fallback: _Fake(results: [lugar('P26', 'Biblioteca')]),
    );
    expect((await repo.search('bibli')).map((p) => p.id), ['P26']);
    expect(repo.lastSource, 'local-fallback');
  });

  test('lista vazia da remota é resposta válida (sem fallback)', () async {
    final local = _Fake(results: [lugar('X', 'Local')]);
    final repo = FallbackCampusPlaceRepository(
      primary: _Fake(),
      fallback: local,
    );
    expect(await repo.search('nada'), isEmpty);
    expect(local.searches, 0);
  });

  test(
    'as duas falhando: o erro chega à UI (mensagem controlada lá)',
    () async {
      final repo = FallbackCampusPlaceRepository(
        primary: _Fake(fail: true),
        fallback: _Fake(fail: true),
      );
      await expectLater(repo.search('x'), throwsException);
    },
  );

  test('foco tenta hidratar na remota e preserva o resultado buscado se cair', () async {
    final remote = _Fake(results: [lugar('area-1', 'Jardim')]);
    final local = _Fake();
    final repo = FallbackCampusPlaceRepository(
      primary: remote,
      fallback: local,
    );
    await repo.search('jardim');
    remote.fail = true;
    expect((await repo.findById('area-1'))!.name, 'Jardim');
    expect(remote.finds, 1);
    expect(local.finds, 0);
  });

  test('foco sem busca anterior: remota, depois local', () async {
    final local = _Fake(byId: {'P26': lugar('P26', 'Biblioteca')});
    final repo = FallbackCampusPlaceRepository(
      primary: _Fake(fail: true),
      fallback: local,
    );
    expect((await repo.findById('P26'))!.id, 'P26');
    final remota = FallbackCampusPlaceRepository(
      primary: _Fake(byId: {'P26': lugar('P26', 'Remota')}),
      fallback: local,
    );
    expect((await remota.findById('P26'))!.name, 'Remota');
    expect(await remota.findById('P999'), isNull);
  });

  test('o mapa troca a busca local pela composta só quando há remota', () {
    const config = CampusMapConfig(mapboxAccessToken: '');
    final semRemota = const CampusMapView(config: config);
    expect(semRemota.remotePlaceRepository, isNull);
    final comRemota = CampusMapView(
      config: config,
      remotePlaceRepository: _Fake(),
    );
    expect(comRemota.remotePlaceRepository, isA<_Fake>());
  });
}
