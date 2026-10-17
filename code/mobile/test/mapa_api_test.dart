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
}
