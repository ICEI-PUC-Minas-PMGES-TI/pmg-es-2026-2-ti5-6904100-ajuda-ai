import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/conquista.dart';
import 'api_config.dart';

/// Máximo por `POST /me/conquistas/vistas` (o mesmo limite da API).
const vistasPorLote = 200;

/// Conquistas do aluno (F32). Consultar já faz o servidor conferir o
/// progresso e desbloquear o que tiver a meta cumprida.
class ConquistasApi {
  ConquistasApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<ColecaoConquistas> listar(String token) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/conquistas'),
        headers: {
          'accept': 'application/json',
          'authorization': 'Bearer $token',
        },
      ),
      erroPadrao: 'Não foi possível carregar as conquistas',
    );
    final colecao = ColecaoConquistas.fromJson(decodificarJson(resposta));
    if (colecao == null) {
      throw const FormatException('Resposta inválida das conquistas.');
    }
    return colecao;
  }

  /// Confirma que o aviso "Nova!" destes desbloqueios foi exibido. Até
  /// aqui eles continuam em `novas`: ler a coleção não consome o aviso.
  /// Em lotes de [vistasPorLote], um depois do outro: a falha de um lote não
  /// impede os demais. Se algum falhar, lança o primeiro erro no fim.
  Future<void> confirmarVistas(
    String token,
    List<Map<String, String>> vistas,
  ) async {
    Object? primeiroErro;
    for (var i = 0; i < vistas.length; i += vistasPorLote) {
      final fim = i + vistasPorLote < vistas.length
          ? i + vistasPorLote
          : vistas.length;
      try {
        await _confirmarLote(token, vistas.sublist(i, fim));
      } catch (erro) {
        primeiroErro ??= erro;
      }
    }
    if (primeiroErro != null) throw primeiroErro;
  }

  Future<void> _confirmarLote(
    String token,
    List<Map<String, String>> vistas,
  ) async {
    await executarRequisicao(
      () => _client.post(
        Uri.parse('$baseUrl/me/conquistas/vistas'),
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authorization': 'Bearer $token',
        },
        body: jsonEncode({'vistas': vistas}),
      ),
      erroPadrao: 'Não foi possível confirmar o aviso das conquistas',
    );
  }
}
