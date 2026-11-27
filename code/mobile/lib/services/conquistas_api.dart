import 'package:http/http.dart' as http;

import '../models/conquista.dart';
import 'api_config.dart';

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
}
