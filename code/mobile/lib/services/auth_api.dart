import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

class SessaoAuth {
  const SessaoAuth({required this.accessToken, required this.usuario});

  final String accessToken;
  final Map<String, dynamic> usuario;

  String get nome => usuario['nome'] as String? ?? 'Coordenação';
  String get email => usuario['email'] as String? ?? '';
  String get perfil => usuario['perfil'] as String? ?? '';
  bool get ehCoordenador => perfil == 'coordenador';
}

class ResultadoLoginMicrosoft {
  const ResultadoLoginMicrosoft.autenticado(this.sessao)
    : nome = null,
      email = null,
      onboardingToken = null;

  const ResultadoLoginMicrosoft.onboarding({
    required String this.nome,
    required String this.email,
    required String this.onboardingToken,
  }) : sessao = null;

  final SessaoAuth? sessao;
  final String? nome;
  final String? email;
  final String? onboardingToken;

  bool get ehOnboarding => onboardingToken != null;
}

class AuthApi {
  AuthApi({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _baseUrlOverride = baseUrl;

  final http.Client _client;
  final String? _baseUrlOverride;
  String? _baseUrlResolvida;

  String get baseUrl => _baseUrlOverride ?? _baseUrlResolvida ?? apiBaseUrl;

  Future<ResultadoLoginMicrosoft> loginMicrosoft(String idToken) async {
    final resposta = await _client
        .post(
          Uri.parse('$baseUrl/auth/login'),
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
          },
          body: jsonEncode({'idToken': idToken}),
        )
        .timeout(const Duration(seconds: 20));

    final corpo = resposta.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(resposta.body);
    if (corpo is! Map<String, dynamic>) {
      throw Exception('Resposta de autenticação inválida.');
    }
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      final mensagem = corpo['message'];
      throw Exception(
        mensagem is String
            ? mensagem
            : mensagem is List
            ? mensagem.join(', ')
            : 'Falha no login Microsoft (${resposta.statusCode}).',
      );
    }

    if (corpo['situacao'] == 'onboarding') {
      final identidade = corpo['identidade'];
      final token = corpo['onboardingToken'];
      if (identidade is! Map || token is! String) {
        throw Exception('Resposta de onboarding inválida.');
      }
      final dados = Map<String, dynamic>.from(identidade);
      return ResultadoLoginMicrosoft.onboarding(
        nome: dados['nome'] as String? ?? '',
        email: dados['email'] as String? ?? '',
        onboardingToken: token,
      );
    }

    final token = corpo['accessToken'] as String?;
    final usuario = corpo['usuario'];
    if (token == null || usuario is! Map) {
      throw Exception('Resposta de autenticação inválida.');
    }
    return ResultadoLoginMicrosoft.autenticado(
      SessaoAuth(
        accessToken: token,
        usuario: Map<String, dynamic>.from(usuario),
      ),
    );
  }

  Future<Map<String, dynamic>> meuPerfil(String accessToken) async {
    final resposta = await _client
        .get(
          Uri.parse('$baseUrl/me'),
          headers: {
            'accept': 'application/json',
            'authorization': 'Bearer $accessToken',
          },
        )
        .timeout(const Duration(seconds: 15));
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Não foi possível carregar o perfil.');
    }
    final corpo = jsonDecode(resposta.body);
    if (corpo is! Map) throw Exception('Perfil inválido.');
    return Map<String, dynamic>.from(corpo);
  }

  Future<SessaoAuth> loginDemo(String email) async {
    Object? ultimoErro;

    final override = _baseUrlOverride;
    final bases = override != null
        ? <String>[override]
        : apiBaseUrlCandidates();

    for (final base in bases) {
      try {
        debugPrint('POST $base/auth/login-demo');
        final resposta = await _client
            .post(
              Uri.parse('$base/auth/login-demo'),
              headers: {
                'content-type': 'application/json',
                'accept': 'application/json',
              },
              body: jsonEncode({'email': email}),
            )
            .timeout(const Duration(seconds: 8));

        if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
          throw ApiException(
            mensagemErroApi(resposta, 'Falha no acesso demo'),
            statusCode: resposta.statusCode,
          );
        }

        final corpo = jsonDecode(resposta.body) as Map<String, dynamic>;
        final token = corpo['accessToken'] as String?;
        final usuario = corpo['usuario'];
        if (token == null || usuario is! Map) {
          throw Exception('Resposta de autenticação inválida.');
        }

        _baseUrlResolvida = base;
        return SessaoAuth(
          accessToken: token,
          usuario: Map<String, dynamic>.from(usuario),
        );
      } on ApiException {
        rethrow;
      } catch (e) {
        ultimoErro = e;
        debugPrint('login-demo sem resposta em $base: $e');
      }
    }

    debugPrint('login-demo esgotou os endereços. Último erro: $ultimoErro');
    throw const ApiIndisponivelException();
  }
}
