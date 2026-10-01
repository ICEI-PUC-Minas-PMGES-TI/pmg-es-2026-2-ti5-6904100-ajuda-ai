import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_config.dart';

class CoordenacaoApi {
  CoordenacaoApi({
    required this.accessToken,
    http.Client? client,
    this.baseUrl = apiBaseUrl,
  }) : _client = client ?? http.Client();

  final String accessToken;
  final http.Client _client;
  final String baseUrl;

  Map<String, String> get _headers => {
    'accept': 'application/json',
    'authorization': 'Bearer $accessToken',
  };

  Future<Map<String, dynamic>> dashboard([String? programa]) async {
    final uri = Uri.parse('$baseUrl/coordenacao/dashboard').replace(
      queryParameters: {
        if (programa != null && programa.isNotEmpty) 'programa': programa,
      },
    );
    final resposta = await _client.get(uri, headers: _headers);
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha ao carregar dashboard (${resposta.statusCode}).');
    }
    return Map<String, dynamic>.from(jsonDecode(resposta.body) as Map);
  }

  Future<List<Map<String, dynamic>>> candidaturas({
    String? programa,
    String? status,
  }) async {
    final uri = Uri.parse('$baseUrl/coordenacao/candidaturas').replace(
      queryParameters: {
        if (programa != null && programa.isNotEmpty) 'programa': programa,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    final resposta = await _client.get(uri, headers: _headers);
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha ao carregar candidaturas (${resposta.statusCode}).');
    }
    final corpo = jsonDecode(resposta.body);
    if (corpo is! List) return const [];
    return corpo
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<Map<String, dynamic>> criarPrograma([String? codigo]) async {
    final resposta = await _client.post(
      Uri.parse('$baseUrl/coordenacao/programas'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({
        if (codigo != null) 'codigo': codigo,
      }),
    );
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha ao abrir ciclo (${resposta.statusCode}).');
    }
    return Map<String, dynamic>.from(jsonDecode(resposta.body) as Map);
  }
}
