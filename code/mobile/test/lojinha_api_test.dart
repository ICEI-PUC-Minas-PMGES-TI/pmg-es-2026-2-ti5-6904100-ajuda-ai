import 'dart:convert';

import 'package:ajuda_ai/services/lojinha_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('lista recompensas e envia a mesma chave de resgate', () async {
    final requisicoes = <http.Request>[];
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient((req) async {
        requisicoes.add(req);
        if (req.method == 'GET') {
          return http.Response(
            jsonEncode([
              {
                'id': 'item',
                'nome': 'Caneca',
                'descricao': 'Azul',
                'custoXp': 30,
                'estoque': 1,
                'condicoesRetirada': 'Secretaria',
              },
            ]),
            200,
          );
        }
        return http.Response(
          jsonEncode({'id': 'comprovante', 'saldoApos': 70, 'saldoAtual': 70}),
          201,
        );
      }),
    );

    final itens = await api.listar('token');
    const chave = '123e4567-e89b-42d3-a456-426614174000';
    final resgate = await api.resgatar('token', 'item', chave);

    expect(itens.single['nome'], 'Caneca');
    expect(resgate['saldoAtual'], 70);
    expect(requisicoes[0].url.path, '/me/lojinha');
    expect(requisicoes[1].url.path, '/me/lojinha/item/resgatar');
    expect(jsonDecode(requisicoes[1].body)['chaveIdempotencia'], chave);
    expect(requisicoes[1].headers['authorization'], 'Bearer token');
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
