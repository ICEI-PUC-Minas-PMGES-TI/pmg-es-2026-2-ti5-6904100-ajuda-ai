import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/ciclo_participacao.dart';
import '../models/formulario.dart';
import '../models/situacao_participacao.dart';
import 'api_config.dart';

/// Resposta de `POST /cadastro`: sessão do aluno + inscrição do ciclo.
class ResultadoCadastro {
  const ResultadoCadastro({
    required this.accessToken,
    required this.usuario,
    required this.participacao,
  });

  final String accessToken;
  final Map<String, dynamic> usuario;
  final CicloParticipacao participacao;
}

/// Rotas autenticadas do aluno; a identidade é sempre validada pelo JWT.
class ParticipacoesApi {
  ParticipacoesApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  /// JWT de acesso emitido pela API.
  String? accessToken;
  String? programa;

  Map<String, String> _headers(String? usuarioId, {bool json = false}) => {
    'accept': 'application/json',
    if (json) 'content-type': 'application/json',
    if (accessToken != null) 'authorization': 'Bearer $accessToken',
  };

  /// Cadastro no programa (`POST /cadastro`). O backend valida as regras
  /// (inclusive período × modalidade), cria o usuário PENDENTE + a inscrição
  /// do ciclo e devolve a sessão; o token passa a ser usado nas próximas
  /// chamadas. Respostas enviadas são imutáveis; duplicação é recusada pela API.
  Future<ResultadoCadastro> cadastrar({
    String? autorizacao,
    required String nome,
    required String email,
    required String curso,
    required int periodo,
    String? turno,
    List<String> interesses = const [],
    required String tipoParticipacao,
    Map<String, dynamic>? respostas,
  }) async {
    final resposta = await executarRequisicao(
      () => _client.post(
        Uri.parse('$baseUrl/cadastro'),
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          if ((autorizacao ?? accessToken) != null)
            'authorization': 'Bearer ${autorizacao ?? accessToken}',
        },
        body: jsonEncode({
          'nome': nome,
          'email': email,
          'curso': curso,
          'periodo': periodo,
          if (turno != null && turno.isNotEmpty) 'turno': turno,
          if (interesses.isNotEmpty) 'interesses': interesses,
          'programa': ?programa,
          'tipoParticipacao': tipoParticipacao,
          'respostas': ?respostas,
        }),
      ),
      erroPadrao: 'Falha ao enviar cadastro',
    );
    final corpo = decodificarJson(resposta);
    final token = corpo is Map ? corpo['accessToken'] : null;
    final participacao = corpo is Map ? corpo['participacao'] : null;
    if (token is! String || participacao is! Map) {
      throw const ApiException('Resposta inválida do cadastro.');
    }
    accessToken = token;
    return ResultadoCadastro(
      accessToken: token,
      usuario: Map<String, dynamic>.from(corpo['usuario'] as Map? ?? const {}),
      participacao: CicloParticipacao.fromJson(
        Map<String, dynamic>.from(participacao),
      ),
    );
  }

  Future<Map<String, dynamic>> perfil() => _json('/me');

  Future<Map<String, dynamic>> salvarPerfil(
    Map<String, dynamic> dados, {
    String? onboarding,
  }) async {
    final resultado = await _json(
      onboarding != null ? '/cadastro/perfil' : '/me',
      method: onboarding != null ? 'PUT' : 'PATCH',
      dados: dados,
      token: onboarding,
    );
    return resultado;
  }

  Future<List<Map<String, dynamic>>> programas() async {
    final r = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/participacoes/programas'),
        headers: _headers(null),
      ),
      erroPadrao: 'Falha ao carregar ciclos',
    );
    return (decodificarJson(r) as List)
        .map((p) => Map<String, dynamic>.from(p as Map))
        .toList();
  }

  Future<String?> foto() async => (await _json('/me/foto'))['url'] as String?;

  Future<String?> enviarFoto(List<int> bytes) async {
    final request = http.MultipartRequest('PUT', Uri.parse('$baseUrl/me/foto'))
      ..headers.addAll(_headers(null))
      ..files.add(
        http.MultipartFile.fromBytes('foto', bytes, filename: 'perfil.img'),
      );
    final r = await executarRequisicao(
      () async => http.Response.fromStream(await _client.send(request)),
      erroPadrao: 'Falha ao salvar foto',
    );
    return (decodificarJson(r) as Map)['url'] as String?;
  }

  Future<void> removerFoto() async {
    await _json('/me/foto', method: 'DELETE');
  }

  Future<Map<String, dynamic>> _json(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? dados,
    String? token,
  }) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers.addAll(_headers(null, json: dados != null));
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    if (dados != null) request.body = jsonEncode(dados);
    final r = await executarRequisicao(
      () async => http.Response.fromStream(await _client.send(request)),
      erroPadrao: 'Não foi possível carregar/salvar o perfil',
    );
    return Map<String, dynamic>.from(decodificarJson(r) as Map);
  }

  /// Login demo do aluno já cadastrado (no lugar do login Microsoft).
  /// Devolve `false` se o e-mail não tem cadastro; falha de rede propaga.
  Future<bool> entrar(String email) async {
    try {
      final resposta = await executarRequisicao(
        () => _client.post(
          Uri.parse('$baseUrl/auth/login-demo'),
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
          },
          body: jsonEncode({'email': email}),
        ),
        erroPadrao: 'Falha ao entrar',
      );
      final corpo = decodificarJson(resposta);
      final token = corpo is Map ? corpo['accessToken'] : null;
      final usuario = corpo is Map ? corpo['usuario'] : null;
      final perfil = usuario is Map ? usuario['perfil'] : null;
      if (token is! String || perfil == 'coordenador') return false;
      accessToken = token;
      return true;
    } on ApiException {
      return false;
    }
  }

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
            .replace(queryParameters: {'programa': ?programa}),
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

  /// Formulário publicado (`padrinho` ou `apadrinhado`). Sem publicação,
  /// o backend devolve `perguntas: []`.
  Future<Formulario> formulario(String tipo) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/formularios/$tipo')
            .replace(queryParameters: {'programa': ?programa}),
        headers: _headers(null),
      ),
      erroPadrao: 'Falha ao carregar o formulário',
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! Map) {
      return Formulario(tipo: tipo, publicado: false, perguntas: const []);
    }
    final formulario = Formulario.fromJson(Map<String, dynamic>.from(corpo));
    if (formulario.publicado) formulario.exigirTiposSuportados();
    return formulario;
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
