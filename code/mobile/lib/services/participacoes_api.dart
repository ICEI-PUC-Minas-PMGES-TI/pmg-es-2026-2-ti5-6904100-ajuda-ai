import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/ciclo_participacao.dart';
import 'api_config.dart';

class ParticipacoesApi {
  ParticipacoesApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<List<CicloParticipacao>> listar(String usuarioId) async {
    final resposta = await _client.get(
      Uri.parse('$baseUrl/participacoes').replace(
        queryParameters: {'usuarioId': usuarioId},
      ),
      headers: {'x-user-id': usuarioId},
    );
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha ao carregar histórico (${resposta.statusCode}).');
    }
    final corpo = jsonDecode(resposta.body);
    if (corpo is! List) return const [];
    return corpo
        .whereType<Map>()
        .map((item) => CicloParticipacao.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<CicloParticipacao> registrarCandidaturaPadrinho({
    required String usuarioId,
    String? programa,
  }) async {
    final resposta = await _client.post(
      Uri.parse('$baseUrl/participacoes/candidatura-padrinho'),
      headers: {
        'content-type': 'application/json',
        'x-user-id': usuarioId,
      },
      body: jsonEncode({
        'usuarioId': usuarioId,
        'programa': ?programa,
      }),
    );
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha ao registrar candidatura (${resposta.statusCode}).');
    }
    final corpo = jsonDecode(resposta.body) as Map<String, dynamic>;
    return CicloParticipacao.fromJson(corpo);
  }

  Future<CicloParticipacao> confirmarIngresso({
    required String usuarioId,
    required String papel,
    String? programa,
    String? grupo,
    int? apadrinhados,
  }) async {
    final resposta = await _client.post(
      Uri.parse('$baseUrl/participacoes/confirmar'),
      headers: {
        'content-type': 'application/json',
        'x-user-id': usuarioId,
      },
      body: jsonEncode({
        'usuarioId': usuarioId,
        'papel': papel,
        'programa': ?programa,
        'grupo': ?grupo,
        'apadrinhados': ?apadrinhados,
      }),
    );
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha ao confirmar participação (${resposta.statusCode}).');
    }
    final corpo = jsonDecode(resposta.body) as Map<String, dynamic>;
    return CicloParticipacao.fromJson(corpo);
  }
}
