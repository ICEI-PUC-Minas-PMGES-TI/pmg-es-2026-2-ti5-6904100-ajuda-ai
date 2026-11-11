import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api_config.dart';

class MapaLocalAdminApi {
  MapaLocalAdminApi({
    required this.accessToken,
    http.Client? client,
    this.baseUrl = apiBaseUrl,
  }) : _client = client ?? http.Client();

  final String accessToken;
  final String baseUrl;
  final http.Client _client;

  Map<String, String> get _headers => {
    'accept': 'application/json',
    'authorization': 'Bearer $accessToken',
  };

  String _id(String value) => Uri.encodeComponent(value);

  Future<Map<String, dynamic>> atualizarDescricao(
    String localId,
    String descricao,
  ) async {
    final resposta = await executarRequisicao(
      () => _client.patch(
        Uri.parse('$baseUrl/coordenacao/mapa/predios/${_id(localId)}'),
        headers: {..._headers, 'content-type': 'application/json'},
        body: jsonEncode({'descricao': descricao}),
      ),
      erroPadrao: 'Não foi possível atualizar o local',
    );
    return Map<String, dynamic>.from(decodificarJson(resposta) as Map);
  }

  Future<Map<String, dynamic>> adicionarImagens(
    String localId,
    List<({String nome, Uint8List bytes})> arquivos,
  ) => _multipart('POST', '/coordenacao/mapa/predios/${_id(localId)}/imagens', [
    for (final arquivo in arquivos)
      http.MultipartFile.fromBytes(
        'arquivos',
        arquivo.bytes,
        filename: arquivo.nome,
      ),
  ]);

  Future<Map<String, dynamic>> substituirImagem(
    String localId,
    String imagemId,
    ({String nome, Uint8List bytes}) arquivo,
  ) => _multipart(
    'PATCH',
    '/coordenacao/mapa/predios/${_id(localId)}/imagens/${_id(imagemId)}',
    [
      http.MultipartFile.fromBytes(
        'arquivo',
        arquivo.bytes,
        filename: arquivo.nome,
      ),
    ],
  );

  Future<Map<String, dynamic>> removerImagem(
    String localId,
    String imagemId,
  ) async {
    final resposta = await executarRequisicao(
      () => _client.delete(
        Uri.parse(
          '$baseUrl/coordenacao/mapa/predios/${_id(localId)}/imagens/${_id(imagemId)}',
        ),
        headers: _headers,
      ),
      erroPadrao: 'Não foi possível remover a imagem',
    );
    return Map<String, dynamic>.from(decodificarJson(resposta) as Map);
  }

  Future<Map<String, dynamic>> _multipart(
    String metodo,
    String caminho,
    List<http.MultipartFile> arquivos,
  ) async {
    final pedido = http.MultipartRequest(metodo, Uri.parse('$baseUrl$caminho'))
      ..headers.addAll(_headers)
      ..files.addAll(arquivos);
    final stream = await _client
        .send(pedido)
        .timeout(const Duration(seconds: 60));
    final resposta = await http.Response.fromStream(stream);
    if (!responseOk(resposta.statusCode)) {
      throw ApiException(
        mensagemErroApi(resposta, 'Não foi possível enviar a imagem'),
        statusCode: resposta.statusCode,
      );
    }
    return Map<String, dynamic>.from(decodificarJson(resposta) as Map);
  }
}
