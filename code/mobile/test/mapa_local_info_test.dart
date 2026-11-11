import 'dart:convert';
import 'dart:typed_data';

import 'package:ajuda_ai/services/mapa_api.dart';
import 'package:ajuda_ai/services/mapa_local_admin_api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('detalhe público mantém descrição e URL original por prédio', () async {
    final repositorio = MapaApiPlaceRepository(
      baseUrl: '',
      client: MockClient(
        (pedido) async => http.Response(
          jsonEncode({
            'id': 'P01_R4751608',
            'nome': 'Igreja',
            'latitude': -19.923,
            'longitude': -43.993,
            'descricao': 'Missas aos domingos.',
            'imagens': [
              {
                'id': 'img-1',
                'url': 'https://storage.test/preview.webp',
                'originalUrl': 'https://storage.test/original.webp',
              },
            ],
          }),
          200,
        ),
      ),
    );
    final local = await repositorio.findById('P01_R4751608');
    expect(local?.description, 'Missas aos domingos.');
    expect(local?.images.single.originalUrl.toString(), contains('original'));
  });

  test('edição mobile envia JWT e usa rotas administrativas', () async {
    final pedidos = <http.Request>[];
    final client = MockClient((pedido) async {
      pedidos.add(pedido);
      expect(pedido.headers['authorization'], 'Bearer coordenador');
      return http.Response(
        jsonEncode({'localId': 'P01', 'descricao': 'Texto', 'imagens': []}),
        200,
      );
    });
    final api = MapaLocalAdminApi(
      accessToken: 'coordenador',
      baseUrl: '',
      client: client,
    );
    await api.atualizarDescricao('P01', 'Texto');
    await api.adicionarImagens('P01', [
      (nome: 'menu.png', bytes: Uint8List.fromList([137, 80, 78, 71])),
    ]);
    await api.substituirImagem('P01', 'img-1', (
      nome: 'missa.webp',
      bytes: Uint8List.fromList([82, 73, 70, 70]),
    ));
    await api.removerImagem('P01', 'img-1');
    expect(pedidos.map((p) => '${p.method} ${p.url.path}'), [
      'PATCH /coordenacao/mapa/predios/P01',
      'POST /coordenacao/mapa/predios/P01/imagens',
      'PATCH /coordenacao/mapa/predios/P01/imagens/img-1',
      'DELETE /coordenacao/mapa/predios/P01/imagens/img-1',
    ]);
  });
}
