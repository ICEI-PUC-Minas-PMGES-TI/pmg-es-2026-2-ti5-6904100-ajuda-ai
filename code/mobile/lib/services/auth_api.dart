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
  AuthApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Future<SessaoAuth> loginDemo(String email) async {
    final resposta = await _client.post(
      Uri.parse('$baseUrl/auth/login-demo'),
      headers: {'content-type': 'application/json', 'accept': 'application/json'},
      body: jsonEncode({'email': email}),
    );
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      throw Exception('Falha no acesso demo (${resposta.statusCode}).');
    }
    final corpo = jsonDecode(resposta.body) as Map<String, dynamic>;
    final token = corpo['accessToken'] as String?;
    final usuario = corpo['usuario'];
    if (token == null || usuario is! Map) {
      throw Exception('Resposta de autenticação inválida.');
    }
    return SessaoAuth(
      accessToken: token,
      usuario: Map<String, dynamic>.from(usuario),
    );
  }
}
