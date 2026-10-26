import 'dart:convert';

import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/services/campus_conteudo_api.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response json(Object? corpo, [int status = 200]) => http.Response(
  jsonEncode(corpo),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

// Contratos públicos do backend (EventoDto, RestauranteDto, LocalDto).
const _feira = {
  'id': '1a2b3c4d-1111-4a5b-8c6d-000000000001',
  'titulo': 'Feira de Profissões',
  'descricao': 'Estandes dos cursos no hall.',
  'inicio': '2026-10-18T13:00:00.000Z',
  'fim': '2026-10-18T17:00:00.000Z',
  'situacao': 'acontecendo',
  'local': {
    'tipo': 'predio',
    'id': 'P26',
    'nome': 'Biblioteca',
    'latitude': -19.92077335,
    'longitude': -43.9931464,
    'rota': {'id': 'P26'},
  },
};
const _show = {
  'id': '1a2b3c4d-1111-4a5b-8c6d-000000000002',
  'titulo': 'Show na praça',
  'descricao': '',
  'inicio': '2026-10-21T22:00:00.000Z',
  'fim': '2026-10-22T01:00:00.000Z',
  'situacao': 'em-breve',
  'local': {
    'tipo': 'ponto',
    'id': null,
    'nome': null,
    'latitude': -19.9229,
    'longitude': -43.9925,
    'rota': {'latitude': -19.9229, 'longitude': -43.9925},
  },
};
const _cantina = {
  'id': '2b3c4d5e-2222-4a5b-8c6d-000000000001',
  'nome': 'Cantina do ICEI',
  'descricao': 'Lanches e almoço.',
  'local': {
    'tipo': 'area',
    'id': '5b1c9e2a-3d4f-4a6b-8c7d-9e0f1a2b3c4d',
    'nome': 'Praça de alimentação',
    'latitude': -19.9237,
    'longitude': -43.9919,
    'rota': {'latitude': -19.9237, 'longitude': -43.9919},
  },
  'horarios': [
    {'dia': 1, 'abre': '07:00', 'fecha': '22:00'},
    {'dia': 6, 'abre': '08:00', 'fecha': '14:00'},
  ],
  'abertoAgora': true,
  'cardapioHoje': true,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MapaApiCampusContentService servico(
    Future<http.Response> Function(http.Request) responder, {
    Duration timeout = const Duration(seconds: 8),
  }) => MapaApiCampusContentService(
    baseUrl: 'http://api.test',
    timeout: timeout,
    client: MockClient(responder),
  );

  group('eventos', () {
    test('GET /mapa/eventos público, sem token → CampusEvent', () async {
      late http.Request pedido;
      final eventos = await servico((r) async {
        pedido = r;
        return json([_feira, _show]);
      }).events();
      expect(pedido.method, 'GET');
      expect(pedido.url.toString(), 'http://api.test/mapa/eventos');
      expect(pedido.headers['authorization'], isNull);
      expect(eventos, hasLength(2));
      final feira = eventos.first;
      expect(feira.id, _feira['id']);
      expect(feira.title, 'Feira de Profissões');
      expect(feira.start, DateTime.utc(2026, 10, 18, 13));
      expect(feira.end, DateTime.utc(2026, 10, 18, 17));
      expect(feira.status, CampusEventStatus.ongoing);
      expect(feira.location!.kind, CampusContentLocationKind.building);
      expect(feira.location!.center, [-43.9931464, -19.92077335]);
      expect(feira.location!.routeTarget, CampusRouteTarget.place('P26'));
      final show = eventos.last;
      expect(show.description, isNull); // Vazio vira nulo.
      expect(show.status, CampusEventStatus.upcoming);
      expect(show.location!.kind, CampusContentLocationKind.point);
      expect(
        show.location!.routeTarget,
        CampusRouteTarget.coordinate(longitude: -43.9925, latitude: -19.9229),
      );
    });

    test('nenhum evento: lista vazia, não é erro', () async {
      expect(await servico((_) async => json([])).events(), isEmpty);
    });

    test('itens fora do contrato são ignorados', () async {
      final eventos = await servico(
        (_) async => json([
          _feira,
          {..._feira, 'id': 'evento-1'},
          {..._feira, 'titulo': ' '},
          {..._feira, 'inicio': 'amanhã'},
          {..._feira, 'fim': '2026-10-18T12:00:00.000Z'}, // Antes do início.
          {..._feira, 'situacao': 'adiado'},
          'texto',
          null,
        ]),
      ).events();
      expect(eventos.map((e) => e.id), [_feira['id']]);
    });

    test('local sem posição: item fica, sem marcador e sem rota', () async {
      final eventos = await servico(
        (_) async => json([
          {
            ..._feira,
            'local': {
              'tipo': 'predio',
              'id': 'P99',
              'nome': 'Prédio removido',
              'latitude': null,
              'longitude': null,
              'rota': null,
            },
          },
          {..._show, 'local': null},
          {
            ..._show,
            'id': '1a2b3c4d-1111-4a5b-8c6d-000000000003',
            'local': {'tipo': 'desconhecido'},
          },
        ]),
      ).events();
      expect(eventos, hasLength(3));
      expect(eventos[0].location!.name, 'Prédio removido');
      expect(eventos[0].location!.hasPosition, isFalse);
      expect(eventos[0].location!.routeTarget, isNull);
      expect(eventos[1].location, isNull);
      expect(eventos[2].location, isNull);
    });
  });

  group('restaurantes', () {
    test(
      'GET /mapa/restaurantes → horários, aberto e cardápio de hoje',
      () async {
        late Uri pedido;
        final lista = await servico((r) async {
          pedido = r.url;
          return json([
            _cantina,
            {
              'id': '2b3c4d5e-2222-4a5b-8c6d-000000000002',
              'nome': 'Quiosque',
              'descricao': null,
              'local': null,
              'horarios': [],
              'abertoAgora': false,
              'cardapioHoje': false,
            },
          ]);
        }).restaurants();
        expect(pedido.toString(), 'http://api.test/mapa/restaurantes');
        final cantina = lista.first;
        expect(cantina.name, 'Cantina do ICEI');
        expect(cantina.openNow, isTrue);
        expect(cantina.menuToday, isTrue);
        expect(cantina.hours.map((h) => (h.day, h.opens, h.closes)), [
          (1, '07:00', '22:00'),
          (6, '08:00', '14:00'),
        ]);
        expect(cantina.location!.kind, CampusContentLocationKind.area);
        expect(cantina.location!.routeTarget, isA<CampusRouteCoordinate>());
        expect(lista.last.location, isNull);
        expect(lista.last.openNow, isFalse);
      },
    );

    test('item inválido some; faixa inválida some sozinha', () async {
      final lista = await servico(
        (_) async => json([
          {
            ..._cantina,
            'horarios': [
              {'dia': 1, 'abre': '07:00', 'fecha': '22:00'},
              {'dia': 9, 'abre': '07:00', 'fecha': '22:00'},
              {'dia': 2, 'abre': '22:00', 'fecha': '07:00'},
              'x',
            ],
          },
          {..._cantina, 'id': 'R1'},
          {..._cantina, 'nome': null},
          {..._cantina, 'abertoAgora': 'sim'},
        ]),
      ).restaurants();
      expect(lista, hasLength(1));
      expect(lista.single.hours, hasLength(1));
    });
  });

  group('cardápio', () {
    const id = '2b3c4d5e-2222-4a5b-8c6d-000000000001';
    const imagem = {
      'id': '9f8e7d6c-3333-4a5b-8c6d-000000000001',
      'url': 'https://ajudaai.blob.core.windows.net/cardapios/cantina.png',
      'tipoConteudo': 'image/png',
      'tamanhoBytes': 183204,
      'validoDe': '2026-10-12',
      'validoAte': '2026-10-18',
      'criadoEm': '2026-10-12T10:00:00.000Z',
    };

    test(
      'GET /mapa/restaurantes/:id/cardapio sem data (hoje no campus)',
      () async {
        late Uri pedido;
        final menu = await servico((r) async {
          pedido = r.url;
          return json({'data': '2026-10-18', 'cardapio': imagem});
        }).menu(id);
        expect(pedido.path, '/mapa/restaurantes/$id/cardapio');
        expect(pedido.queryParameters, isEmpty);
        expect(menu!.isImage, isTrue);
        expect(menu.url.toString(), imagem['url']);
        expect(menu.validFrom, DateTime(2026, 10, 12));
        expect(menu.validTo, DateTime(2026, 10, 18));
        expect(menu.sizeBytes, 183204);
      },
    );

    test('PDF', () async {
      final menu = await servico(
        (_) async => json({
          'data': '2026-10-18',
          'cardapio': {
            ...imagem,
            'url': 'https://cdn.test/c.pdf',
            'tipoConteudo': 'application/pdf',
          },
        }),
      ).menu(id);
      expect(menu!.isPdf, isTrue);
    });

    test('sem cardápio publicado: null', () async {
      expect(
        await servico(
          (_) async => json({'data': '2026-10-18', 'cardapio': null}),
        ).menu(id),
        isNull,
      );
    });

    Future<CampusContentFailure> falha(
      Future<http.Response> Function(http.Request) responder, {
      Duration timeout = const Duration(seconds: 8),
    }) async {
      try {
        await servico(responder, timeout: timeout).menu(id);
      } on CampusContentException catch (e) {
        return e.failure;
      }
      fail('esperava CampusContentException');
    }

    test('404 (restaurante inativo) → notFound; resto → offline', () async {
      expect(
        await falha((_) async => json({'message': 'x'}, 404)),
        CampusContentFailure.notFound,
      );
      for (final status in [400, 500, 503]) {
        expect(
          await falha((_) async => json({'message': 'x'}, status)),
          CampusContentFailure.offline,
        );
      }
      expect(
        await falha((_) async => throw http.ClientException('offline')),
        CampusContentFailure.offline,
      );
      expect(
        await falha((_) async {
          await Future<void>.delayed(const Duration(milliseconds: 200));
          return json({'cardapio': null});
        }, timeout: const Duration(milliseconds: 10)),
        CampusContentFailure.offline,
      );
      for (final corpo in <Object?>[
        [1, 2],
        {'data': '2026-10-18'},
        {
          'cardapio': {...imagem, 'tipoConteudo': 'text/html'},
        },
        {
          'cardapio': {...imagem, 'url': 'javascript:alert(1)'},
        },
        {
          'cardapio': {...imagem, 'validoDe': '2026-13-40'},
        },
      ]) {
        expect(
          await falha((_) async => json(corpo)),
          CampusContentFailure.offline,
          reason: '$corpo',
        );
      }
    });
  });

  test(
    'listas: erros viram exceção (a lista mostra "Tentar novamente")',
    () async {
      await expectLater(
        servico((_) async => throw http.ClientException('offline')).events(),
        throwsA(isA<ApiIndisponivelException>()),
      );
      await expectLater(
        servico((_) async => json({'message': 'x'}, 500)).restaurants(),
        throwsA(isA<ApiException>()),
      );
      await expectLater(
        servico((_) async => json({'nao': 'lista'})).events(),
        throwsFormatException,
      );
      await expectLater(
        servico((_) async {
          await Future<void>.delayed(const Duration(milliseconds: 200));
          return json([]);
        }, timeout: const Duration(milliseconds: 10)).events(),
        throwsA(isA<ApiIndisponivelException>()),
      );
    },
  );

  group('mapa com a API', () {
    late bool online;
    late List<String> pedidos;
    late CampusMapController controller;

    setUp(() {
      online = false;
      pedidos = [];
      controller = CampusMapController(
        placeRepository: LocalCampusPlaceRepository(),
        locationService: _Location(),
        contentService: servico((r) async {
          pedidos.add(r.url.path);
          if (!online) throw http.ClientException('offline');
          return switch (r.url.path) {
            '/mapa/eventos' => json([_feira]),
            '/mapa/restaurantes' => json([]),
            _ => json({'message': 'x'}, 404),
          };
        }),
      );
    });
    tearDown(() => controller.dispose());

    testWidgets('offline: erro e "Tentar novamente" carrega da API', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: CampusMapControls(controller: controller)),
        ),
      );
      await tester.tap(find.text('Eventos'));
      await tester.pumpAndSettle();
      expect(
        find.text('Não foi possível carregar os eventos. Verifique a conexão.'),
        findsOneWidget,
      );
      online = true;
      await tester.tap(find.text('Tentar novamente'));
      await tester.pumpAndSettle();
      expect(find.text('Feira de Profissões'), findsOneWidget);
      expect(find.text('Acontecendo agora'), findsOneWidget);
      expect(pedidos.where((p) => p == '/mapa/eventos'), hasLength(2));
      // Restaurantes: lista vazia é estado próprio, não erro.
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Onde comer'));
      await tester.pumpAndSettle();
      expect(find.text('Nenhum restaurante cadastrado.'), findsOneWidget);
    });
  });
}

class _Location implements CampusLocationService {
  @override
  Future<CampusLocationResult> locate() async =>
      const CampusLocationResult(CampusLocationStatus.denied);
  @override
  Future<bool> openAppSettings() async => true;
  @override
  Future<bool> openLocationSettings() async => true;
}
