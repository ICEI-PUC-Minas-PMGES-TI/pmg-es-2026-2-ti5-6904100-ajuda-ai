import 'dart:convert';

import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/services/encontros_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_encontro_detalhe.dart';
import 'package:ajuda_ai/widgets/painel_notificacoes.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const id = '6f1c2b0e-3d7a-4c61-9a52-1b8e0f4d2a77';
const posicao = CampusUserLocation(
  latitude: -19.92,
  longitude: -43.98,
  accuracy: 9,
);

Map<String, dynamic> encontro({
  required DateTime abre,
  required DateTime fecha,
}) => {
  'id': id,
  'organizador': {'nome': 'Thiago'},
  'local': {'pucstopId': 'totem', 'nome': 'Biblioteca', 'ativo': true},
  'inicio': abre.toIso8601String(),
  'fim': fecha.toIso8601String(),
  'checkinAbre': abre.toIso8601String(),
  'checkinFecha': fecha.toIso8601String(),
  'status': 'agendado',
  'souOrganizador': true,
  'podeConfirmarPresenca': true,
  'podeRemarcar': true,
  'convites': [],
};

void main() {
  test(
    'cliente usa Bearer, filtros, métodos e coordenadas de check-in',
    () async {
      final pedidos = <http.Request>[];
      final dados = encontro(
        abre: DateTime.utc(2026, 12, 1),
        fecha: DateTime.utc(2026, 12, 2),
      );
      final client = MockClient((pedido) async {
        pedidos.add(pedido);
        if (pedido.url.path.endsWith('/presenca')) {
          return http.Response('{"xpGanho":25}', 200);
        }
        if (pedido.url.path.endsWith('/apadrinhados')) {
          return http.Response('[{"id":7,"nome":"Camila"}]', 200);
        }
        final corpo = pedido.url.queryParameters['quando'] == 'anteriores'
            ? [dados]
            : dados;
        return http.Response(jsonEncode(corpo), 200);
      });
      final api = EncontrosApi(client: client, baseUrl: 'https://api.test');
      expect(
        (await api.listar('jwt', anteriores: true)).single.local,
        'Biblioteca',
      );
      expect(await api.apadrinhados('jwt'), [(id: 7, nome: 'Camila')]);
      await api.salvar('jwt', {
        'pucstopId': 'totem',
        'apadrinhadoIds': [7],
      });
      await api.salvar('jwt', {'descricao': 'Revisão'}, id: id);
      await api.responder('jwt', id, 'aceito');
      await api.cancelar('jwt', id);
      expect(await api.confirmar('jwt', id, posicao), 25);

      expect(pedidos.map((p) => [p.method, p.url.path]), [
        ['GET', '/me/encontros'],
        ['GET', '/me/encontros/apadrinhados'],
        ['POST', '/me/encontros'],
        ['PATCH', '/me/encontros/$id'],
        ['POST', '/me/encontros/$id/responder'],
        ['POST', '/me/encontros/$id/cancelar'],
        ['POST', '/me/encontros/$id/presenca'],
      ]);
      expect(
        pedidos.every((p) => p.headers['authorization'] == 'Bearer jwt'),
        isTrue,
      );
      expect(jsonDecode(pedidos.last.body), {
        'latitude': -19.92,
        'longitude': -43.98,
        'accuracy': 9,
      });
    },
  );

  test('preserva motivo de recusa e reconhece o link no sino', () async {
    final api = EncontrosApi(
      client: MockClient((pedido) async {
        expect(jsonDecode(pedido.body), isEmpty);
        return http.Response(
          '{"message":"Envie a localização.","motivo":"localizacao-obrigatoria"}',
          422,
        );
      }),
      baseUrl: 'https://api.test',
    );
    await expectLater(
      api.confirmar('jwt', id, null),
      throwsA(
        isA<ApiException>().having(
          (erro) => erro.motivo,
          'motivo',
          'localizacao-obrigatoria',
        ),
      ),
    );
    expect(encontroDaNotificacao('/encontros/$id'), id);
    expect(encontroDaNotificacao('/missoes'), isNull);
  });

  testWidgets('exibe a janela da API e bloqueia o botão antes da abertura', (
    tester,
  ) async {
    final agora = DateTime.now();
    final dados = encontro(
      abre: agora.add(const Duration(hours: 1)),
      fecha: agora.add(const Duration(hours: 3)),
    );
    final client = MockClient(
      (_) async => http.Response(jsonEncode(dados), 200),
    );
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(client: client)..accessToken = 'jwt',
    );
    addTearDown(SessaoUsuario.atual.limpar);
    await tester.pumpWidget(
      MaterialApp(
        home: TelaEncontroDetalhe(
          id: id,
          api: EncontrosApi(client: client, baseUrl: 'https://api.test'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final botao = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Confirmar presença'),
    );
    expect(botao.onPressed, isNull);
    expect(
      find.textContaining('Confirmação disponível a partir'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
