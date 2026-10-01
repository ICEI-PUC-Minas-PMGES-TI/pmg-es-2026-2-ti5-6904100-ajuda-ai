import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/ciclo_participacao.dart';
import '../models/formulario.dart';
import '../models/situacao_participacao.dart';
import 'api_config.dart';

/// Rotas do aluno (sem token). A identidade é o e-mail institucional
/// (`usuarioId` em minúsculas), enviado na query/corpo e no `x-user-id`.
///
/// Erros: [ApiIndisponivelException] quando o backend não responde e
/// [ApiException] quando ele responde com erro.
class ParticipacoesApi {
  ParticipacoesApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Map<String, String> _headers(String? usuarioId, {bool json = false}) => {
    'accept': 'application/json',
    if (json) 'content-type': 'application/json',
    'x-user-id': ?usuarioId,
  };

  Future<List<CicloParticipacao>> listar(String usuarioId) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/participacoes')
            .replace(queryParameters: {'usuarioId': usuarioId}),
        headers: _headers(usuarioId),
      ),
      erroPadrao: 'Falha ao carregar histórico',
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) return const [];
    return corpo
        .whereType<Map>()
        .map(
          (item) => CicloParticipacao.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList();
  }

  Future<SituacaoParticipacao> situacao(String usuarioId) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/participacoes/situacao')
            .replace(queryParameters: {'usuarioId': usuarioId}),
        headers: _headers(usuarioId),
      ),
      erroPadrao: 'Falha ao carregar sua situação no programa',
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! Map) {
      throw const ApiException('Resposta inválida da situação.');
    }
    return SituacaoParticipacao.fromJson(Map<String, dynamic>.from(corpo));
  }

  Future<CicloParticipacao> registrarCandidaturaPadrinho({
    required String usuarioId,
    String? programa,
    Map<String, dynamic>? respostas,
  }) {
    return _enviarCadastro(
      rota: 'candidatura-padrinho',
      usuarioId: usuarioId,
      programa: programa,
      respostas: respostas,
      erroPadrao: 'Falha ao registrar candidatura',
    );
  }

  Future<CicloParticipacao> cadastrarApadrinhado({
    required String usuarioId,
    String? programa,
    required Map<String, dynamic> respostas,
  }) {
    return _enviarCadastro(
      rota: 'cadastro-apadrinhado',
      usuarioId: usuarioId,
      programa: programa,
      respostas: respostas,
      erroPadrao: 'Falha ao enviar cadastro',
    );
  }

  Future<CicloParticipacao> _enviarCadastro({
    required String rota,
    required String usuarioId,
    required String? programa,
    required Map<String, dynamic>? respostas,
    required String erroPadrao,
  }) async {
    final resposta = await executarRequisicao(
      () => _client.post(
        Uri.parse('$baseUrl/participacoes/$rota'),
        headers: _headers(usuarioId, json: true),
        body: jsonEncode({
          'usuarioId': usuarioId,
          'programa': ?programa,
          'respostas': ?respostas,
        }),
      ),
      erroPadrao: erroPadrao,
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! Map) throw ApiException('$erroPadrao: resposta inválida.');
    return CicloParticipacao.fromJson(Map<String, dynamic>.from(corpo));
  }

  /// Formulário publicado (`padrinho` ou `apadrinhado`). Sem publicação,
  /// o backend devolve `perguntas: []`.
  Future<Formulario> formulario(String tipo) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/formularios/$tipo'),
        headers: _headers(null),
      ),
      erroPadrao: 'Falha ao carregar o formulário',
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! Map) {
      return Formulario(tipo: tipo, publicado: false, perguntas: const []);
    }
    return Formulario.fromJson(Map<String, dynamic>.from(corpo));
  }

  /// Avisos/comunicados para `padrinhos` ou `apadrinhados`.
  Future<List<Aviso>> avisos(String publico) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/avisos')
            .replace(queryParameters: {'publico': publico}),
        headers: _headers(null),
      ),
      erroPadrao: 'Falha ao carregar notificações',
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) return const [];
    return corpo
        .whereType<Map>()
        .map((item) => Aviso.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<CicloParticipacao> confirmarIngresso({
    required String usuarioId,
    required String papel,
    String? programa,
    String? grupo,
    int? apadrinhados,
  }) async {
    final resposta = await executarRequisicao(
      () => _client.post(
        Uri.parse('$baseUrl/participacoes/confirmar'),
        headers: _headers(usuarioId, json: true),
        body: jsonEncode({
          'usuarioId': usuarioId,
          'papel': papel,
          'programa': ?programa,
          'grupo': ?grupo,
          'apadrinhados': ?apadrinhados,
        }),
      ),
      erroPadrao: 'Falha ao confirmar participação',
    );
    final corpo = decodificarJson(resposta) as Map<String, dynamic>;
    return CicloParticipacao.fromJson(corpo);
  }
}
