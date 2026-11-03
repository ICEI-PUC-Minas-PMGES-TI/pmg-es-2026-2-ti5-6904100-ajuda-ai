import 'dart:convert';

import 'package:ajuda_ai/services/lojinha_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('lista, detalha, resgata e consulta histórico e extrato', () async {
    final requisicoes = <http.Request>[];
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient((req) async {
        requisicoes.add(req);
        final caminho = req.url.path;
        if (req.method == 'POST') {
          return http.Response(
            jsonEncode({'id': 'r1', 'codigo': 'ABC', 'saldoAtual': 70}),
            201,
          );
        }
        if (caminho == '/me/lojinha') {
          return http.Response(
            jsonEncode([
              {'id': 'item', 'nome': 'Caneca'},
            ]),
            200,
          );
        }
        if (caminho == '/me/xp') {
          return http.Response(jsonEncode({'saldo': 100}), 200);
        }
        if (caminho == '/me/lojinha/resgates' ||
            caminho == '/me/xp/movimentacoes') {
          return http.Response(jsonEncode([]), 200);
        }
        return http.Response(jsonEncode({'id': 'x'}), 200);
      }),
    );

    final lista = await api.listar('token');
    await api.detalhe('token', 'item');
    const chave = '123e4567-e89b-42d3-a456-426614174000';
    final resgate = await api.resgatar('token', 'item', chave);
    await api.historico('token');
    await api.comprovante('token', 'r1');
    await api.extrato('token', limite: 10, antes: '55');

    expect(lista['saldo'], 100);
    expect(lista['recompensas'], hasLength(1));
    expect(resgate['codigo'], 'ABC');
    expect(requisicoes.map((r) => r.url.path).toList(), [
      '/me/lojinha',
      '/me/xp',
      '/me/lojinha/item',
      '/me/lojinha/item/resgatar',
      '/me/lojinha/resgates',
      '/me/lojinha/resgates/r1',
      '/me/xp/movimentacoes',
    ]);
    expect(requisicoes[3].headers['authorization'], 'Bearer token');
    expect(jsonDecode(requisicoes[3].body)['chaveIdempotencia'], chave);
    expect(requisicoes[6].url.queryParameters, {'limite': '10', 'antes': '55'});
  });

  test('a chave gerada é UUID v4', () {
    expect(
      LojinhaApi.novaChave(),
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
  });
}
