import 'dart:convert';

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

class AuthApi {
  AuthApi({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _baseUrlOverride = baseUrl;

  final http.Client _client;
  final String? _baseUrlOverride;
  String? _baseUrlResolvida;

  String get baseUrl => _baseUrlOverride ?? _baseUrlResolvida ?? apiBaseUrl;

  Future<SessaoAuth> loginDemo(String email) async {
    Object? ultimoErro;

    final override = _baseUrlOverride;
    final bases = override != null
        ? <String>[override]
        : apiBaseUrlCandidates();

    for (final base in bases) {
      try {
        final resposta = await _client
            .post(
              Uri.parse('$base/auth/login-demo'),
              headers: {
                'content-type': 'application/json',
                'accept': 'application/json',
              },
              body: jsonEncode({'email': email}),
            )
            .timeout(const Duration(seconds: 4));

        if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
          ultimoErro = Exception(
            'Falha no acesso demo (${resposta.statusCode}) em $base.',
          );
          continue;
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
      } catch (e) {
        ultimoErro = e;
      }
    }

    throw Exception(
      'Não foi possível conectar à API. '
      'Confirme se o backend está rodando na porta 3000 '
      'e, em dispositivo físico, use '
      '--dart-define=API_BASE_URL=http://IP_DA_MAQUINA:3000. '
      'Detalhe: ${ultimoErro ?? 'sem resposta'}',
    );
  }
}
