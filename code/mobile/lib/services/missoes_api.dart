import 'package:http/http.dart' as http;

import '../models/missao.dart';
import 'api_config.dart';

class MissoesApi {
  MissoesApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Map<String, String> _cabecalhos(String token) => {
    'accept': 'application/json',
    'authorization': 'Bearer $token',
  };

  Future<MissoesAluno> listar(String token) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/missoes'),
        headers: _cabecalhos(token),
      ),
      erroPadrao: 'Não foi possível carregar as missões',
    );
    final missoes = MissoesAluno.fromJson(decodificarJson(resposta));
    if (missoes == null) {
      throw const FormatException('Resposta inválida das missões.');
    }
    return missoes;
  }

  Future<ConclusaoMissao> concluir(String token, String id) async {
    final resposta = await executarRequisicao(
      () => _client.post(
        Uri.parse('$baseUrl/me/missoes/${Uri.encodeComponent(id)}/concluir'),
        headers: _cabecalhos(token),
      ),
      erroPadrao: 'Não foi possível concluir a missão',
    );
    final conclusao = ConclusaoMissao.fromJson(decodificarJson(resposta));
    if (conclusao == null) {
      throw const FormatException('Resposta inválida da conclusão.');
    }
    return conclusao;
  }
}
