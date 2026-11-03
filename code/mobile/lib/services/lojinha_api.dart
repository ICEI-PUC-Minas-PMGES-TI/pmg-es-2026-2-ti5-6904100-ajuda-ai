import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'api_config.dart';

class LojinhaApi {
  LojinhaApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<List<Map<String, dynamic>>> listar(String token) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/lojinha'),
        headers: {'authorization': 'Bearer $token'},
      ),
      erroPadrao: 'Não foi possível carregar a lojinha',
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) {
      throw const FormatException('Resposta inválida da lojinha.');
    }
    return corpo.map((item) => Map<String, dynamic>.from(item as Map)).toList();
  }

  Future<Map<String, dynamic>> resgatar(
    String token,
    String recompensaId,
    String chave,
  ) async {
    final resposta = await executarRequisicao(
      () => _client.post(
        Uri.parse(
          '$baseUrl/me/lojinha/${Uri.encodeComponent(recompensaId)}/resgatar',
        ),
        headers: {
          'authorization': 'Bearer $token',
          'content-type': 'application/json',
        },
        body: jsonEncode({'chaveIdempotencia': chave}),
      ),
      erroPadrao: 'Não foi possível resgatar a recompensa',
    );
    return Map<String, dynamic>.from(decodificarJson(resposta) as Map);
  }

  /// UUID v4 para identificar a tentativa, reutilizado até a API responder.
  static String novaChave() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}
