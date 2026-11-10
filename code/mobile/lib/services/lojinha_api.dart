import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'api_config.dart';

class LojinhaApi {
  LojinhaApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Map<String, String> _cabecalhos(String token) => {
    'accept': 'application/json',
    'authorization': 'Bearer $token',
  };

  Future<dynamic> _get(String token, String caminho, String erro) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl$caminho'),
        headers: _cabecalhos(token),
      ),
      erroPadrao: erro,
    );
    return decodificarJson(resposta);
  }

  Map<String, dynamic> _mapa(dynamic corpo) {
    if (corpo is! Map) {
      throw const FormatException('Resposta inválida da lojinha.');
    }
    return Map<String, dynamic>.from(corpo);
  }

  List<Map<String, dynamic>> _lista(dynamic corpo) {
    if (corpo is! List) {
      throw const FormatException('Resposta inválida da lojinha.');
    }
    return corpo.map((item) => Map<String, dynamic>.from(item as Map)).toList();
  }

  Future<Map<String, dynamic>> listar(String token) async {
    final respostas = await Future.wait([
      _get(token, '/me/lojinha', 'Não foi possível carregar a lojinha'),
      _get(token, '/me/xp', 'Não foi possível carregar seu saldo'),
    ]);
    return {
      'saldo': _mapa(respostas[1])['saldo'] as int? ?? 0,
      'recompensas': _lista(respostas[0]),
    };
  }

  Future<Map<String, dynamic>> detalhe(String token, String id) async => _mapa(
    await _get(
      token,
      '/me/lojinha/${Uri.encodeComponent(id)}',
      'Não foi possível carregar a recompensa',
    ),
  );

  Future<List<Map<String, dynamic>>> historico(String token) async => _lista(
    await _get(
      token,
      '/me/lojinha/resgates',
      'Não foi possível carregar seus resgates',
    ),
  );

  Future<Map<String, dynamic>> comprovante(String token, String id) async =>
      _mapa(
        await _get(
          token,
          '/me/lojinha/resgates/${Uri.encodeComponent(id)}',
          'Não foi possível carregar o comprovante',
        ),
      );

  Future<List<Map<String, dynamic>>> extrato(
    String token, {
    int limite = 30,
    String? antes,
  }) async {
    final consulta = 'limite=$limite${antes == null ? '' : '&antes=$antes'}';
    return _lista(
      await _get(
        token,
        '/me/xp/movimentacoes?$consulta',
        'Não foi possível carregar o extrato',
      ),
    );
  }

  Future<Map<String, dynamic>> resgatar(
    String token,
    String recompensaId,
    String chave, {
    required int versao,
    required int custoXp,
  }) async {
    final resposta = await executarRequisicao(
      () => _client.post(
        Uri.parse(
          '$baseUrl/me/lojinha/${Uri.encodeComponent(recompensaId)}/resgatar',
        ),
        headers: {..._cabecalhos(token), 'content-type': 'application/json'},
        body: jsonEncode({
          'chaveIdempotencia': chave,
          // O que o aluno confirmou; a API recusa se a recompensa mudou.
          'versao': versao,
          'custoXp': custoXp,
        }),
      ),
      erroPadrao: 'Não foi possível resgatar a recompensa',
    );
    return _mapa(decodificarJson(resposta));
  }

  static String novaChave() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}
