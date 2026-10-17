import 'dart:convert';

import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/services/mapa_api.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response json(Object corpo, [int status = 200]) => http.Response(
  jsonEncode(corpo),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const biblioteca = {
    'id': 'P26',
    'tipo': 'predio',
    'nome': 'Biblioteca Padre Alberto Antoniazzi - P. 26',
    'codigo': '26',
    'categoria': 'LIBRARY',
    'latitude': -19.9216,
    'longitude': -43.9915,
  };

  test(
    'busca: GET /mapa/busca com q e limite, contrato → CampusPlace',
    () async {
      late Uri pedido;
      final api = MapaApiPlaceRepository(
        baseUrl: 'http://api.test',
        client: MockClient((r) async {
          pedido = r.url;
          return json([biblioteca]);
        }),
      );
      final lugares = await api.search('Planetário puc');
      expect(pedido.path, '/mapa/busca');
      expect(pedido.queryParameters, {'q': 'Planetário puc', 'limit': '8'});
      expect(lugares, hasLength(1));
      final lugar = lugares.single;
      expect(lugar.id, 'P26');
      expect(lugar.code, '26');
      expect(lugar.type, 'LIBRARY');
      expect(lugar.center, [-43.9915, -19.9216]); // [lon, lat], como o snapshot
    },
  );

  test('busca vazia não faz requisição', () async {
    var chamadas = 0;
    final api = MapaApiPlaceRepository(
      client: MockClient((_) async {
        chamadas++;
        return json([]);
      }),
    );
    expect(await api.search('   '), isEmpty);
    expect(chamadas, 0);
  });

  test('itens fora do contrato são ignorados', () async {
    final api = MapaApiPlaceRepository(
      client: MockClient(
        (_) async => json([
          biblioteca,
          {'id': 'sem-centro', 'nome': 'X'},
          {'id': 'sem-nome', 'latitude': 0, 'longitude': 0},
          'texto',
        ]),
      ),
    );
    expect((await api.search('x')).map((p) => p.id), ['P26']);
  });

  test('erros viram exceção (o mapa então usa o local)', () async {
    final servidor = MapaApiPlaceRepository(
      client: MockClient((_) async => json({'message': 'erro'}, 503)),
    );
    await expectLater(servidor.search('x'), throwsA(isA<ApiException>()));
    final offline = MapaApiPlaceRepository(
      client: MockClient((_) async => throw http.ClientException('offline')),
    );
    await expectLater(
      offline.search('x'),
      throwsA(isA<ApiIndisponivelException>()),
    );
    final invalida = MapaApiPlaceRepository(
      client: MockClient((_) async => json({'nao': 'lista'})),
    );
    await expectLater(invalida.search('x'), throwsFormatException);
  });

  test('findById: prédio por id estável; 404 → null', () async {
    final pedidos = <String>[];
    final api = MapaApiPlaceRepository(
      client: MockClient((r) async {
        pedidos.add(r.url.path);
        return r.url.path.endsWith('/P26')
            ? json({...biblioteca, 'geometria': null})
            : json({'message': 'Prédio não encontrado.'}, 404);
      }),
    );
    expect((await api.findById('P26'))!.id, 'P26');
    expect(await api.findById('a b/c'), isNull);
    expect(pedidos.last, '/mapa/predios/a%20b%2Fc');
  });

  test(
    'API fora do ar: busca do mapa responde pelo snapshot, mesmas chaves',
    () async {
      final repo = FallbackCampusPlaceRepository(
        primary: MapaApiPlaceRepository(
          client: MockClient(
            (_) async => throw http.ClientException('offline'),
          ),
        ),
        fallback: LocalCampusPlaceRepository(),
      );
      final lugares = await repo.search('biblioteca');
      expect(lugares.first.id, 'P26');
      expect(repo.lastSource, 'local-fallback');
      expect((await repo.findById('P26'))!.id, 'P26');
    },
  );

  group('rotas', () {
    const origem = CampusUserLocation(
      latitude: -19.92255,
      longitude: -43.99165,
      accuracy: 8,
    );
    final rota = {
      'versao': 'pucmaps-12',
      'acessivel': true,
      'origem': {'tipo': 'coordenada', 'conexao': 'caminho'},
      'destino': {'tipo': 'predio', 'id': 'P26', 'conexao': 'entrada'},
      'distanciaMetros': 212.4,
      'tempoSegundos': 158,
      'nos': 9,
      'arestas': 8,
      'geometria': {
        'type': 'LineString',
        'coordinates': [
          [-43.99165, -19.92255],
          [-43.9917, -19.9224],
          [-43.9921, -19.9219],
        ],
      },
    };

    test('POST /mapa/rotas: origem no corpo, nunca na URL', () async {
      late http.Request pedido;
      final api = MapaApiRouteService(
        baseUrl: 'http://api.test',
        client: MockClient((r) async {
          pedido = r;
          return json(rota);
        }),
      );
      final r = await api.route(
        origin: origem,
        destinationId: 'P26',
        accessible: true,
      );
      expect(pedido.method, 'POST');
      expect(pedido.url.toString(), 'http://api.test/mapa/rotas');
      expect(pedido.url.query, isEmpty);
      expect(jsonDecode(pedido.body), {
        'origem': {'latitude': -19.92255, 'longitude': -43.99165},
        'destino': {'id': 'P26'},
        'acessivel': true,
      });
      expect(pedido.headers['content-type'], startsWith('application/json'));
      expect(r.destinationId, 'P26');
      expect(r.coordinates.first, [-43.99165, -19.92255]); // [lon, lat]
      expect(r.coordinates, hasLength(3));
      expect(r.distanceMeters, 212.4);
      expect(r.durationSeconds, 158);
      expect(r.accessible, isTrue);
    });

    Future<CampusRouteFailure> falha(MockClient client) async {
      try {
        await MapaApiRouteService(client: client)
            .route(origin: origem, destinationId: 'P26', accessible: false);
      } on CampusRouteException catch (e) {
        return e.failure;
      }
      fail('esperava CampusRouteException');
    }

    test('422 por motivo, 404 e erros → falhas do mapa', () async {
      for (final (motivo, esperado) in [
        ('origem-fora', CampusRouteFailure.outsideCampus),
        ('mesmo-local', CampusRouteFailure.samePlace),
        ('sem-caminho', CampusRouteFailure.noPath),
        ('predio-sem-conexao', CampusRouteFailure.destinationUnavailable),
        ('outro', CampusRouteFailure.unavailable),
      ]) {
        expect(
          await falha(
            MockClient(
              (_) async => json({'message': 'x', 'motivo': motivo}, 422),
            ),
          ),
          esperado,
          reason: motivo,
        );
      }
      expect(
        await falha(MockClient((_) async => json({'message': 'x'}, 404))),
        CampusRouteFailure.destinationUnavailable,
      );
      for (final status in [400, 500, 503]) {
        expect(
          await falha(MockClient((_) async => json({'message': 'x'}, status))),
          CampusRouteFailure.unavailable,
        );
      }
    });

    test('API fora do ar, lenta ou resposta inválida → unavailable', () async {
      expect(
        await falha(
          MockClient((_) async => throw http.ClientException('offline')),
        ),
        CampusRouteFailure.unavailable,
      );
      final lenta = MapaApiRouteService(
        timeout: const Duration(milliseconds: 10),
        client: MockClient((_) async {
          await Future<void>.delayed(const Duration(milliseconds: 200));
          return json(rota);
        }),
      );
      await expectLater(
        lenta.route(origin: origem, destinationId: 'P26', accessible: false),
        throwsA(
          isA<CampusRouteException>().having(
            (e) => e.failure,
            'failure',
            CampusRouteFailure.unavailable,
          ),
        ),
      );
      for (final corpo in <Object>[
        {'geometria': null},
        {
          ...rota,
          'geometria': {
            'type': 'Point',
            'coordinates': [0, 0],
          },
        },
        {
          ...rota,
          'geometria': {
            'type': 'LineString',
            'coordinates': [
              [0, 0],
            ],
          },
        },
        [1, 2],
      ]) {
        expect(
          await falha(MockClient((_) async => json(corpo))),
          CampusRouteFailure.unavailable,
        );
      }
      expect(
        await falha(MockClient((_) async => http.Response('<html>', 200))),
        CampusRouteFailure.unavailable,
      );
    });
  });
}
