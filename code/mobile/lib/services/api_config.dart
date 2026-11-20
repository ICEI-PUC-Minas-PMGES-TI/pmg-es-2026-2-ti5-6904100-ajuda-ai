import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Base URL da API.
///
/// Override em qualquer máquina/dispositivo:
/// `flutter run --dart-define=API_BASE_URL=http://SEU_IP:3000`
///
/// Padrões de desenvolvimento (sem URL de produção):
/// - `API_BASE_URL` via --dart-define tem prioridade em qualquer plataforma.
/// - Web: localhost. O simulador de iOS também usa localhost quando o alvo é web.
/// - Android, inclusive o emulador: `http://10.0.2.2:3000` (o localhost da máquina).
///   No emulador, `localhost` seria o próprio Android, não o Windows.
/// - Celular físico: passe o IP da máquina em `API_BASE_URL`.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: kIsWeb ? 'http://localhost:3000' : 'http://10.0.2.2:3000',
);

/// Candidatos usados quando a URL padrão falha (ex.: emulador sem rota a 10.0.2.2).
List<String> apiBaseUrlCandidates() {
  const defined = String.fromEnvironment('API_BASE_URL');
  final list = <String>[
    if (defined.isNotEmpty) defined,
    apiBaseUrl,
    'http://10.0.2.2:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
  ];
  // Remove duplicatas preservando ordem.
  final seen = <String>{};
  return list.where((u) => seen.add(u)).toList();
}

/// Descobre uma base que responde. Use no bootstrap da coordenação/login.
Future<String> resolverApiBaseUrl({
  http.Client? client,
  Duration timeout = const Duration(seconds: 2),
}) async {
  final httpClient = client ?? http.Client();
  final deveFechar = client == null;
  try {
    for (final base in apiBaseUrlCandidates()) {
      try {
        final resposta = await httpClient
            .post(
              Uri.parse('$base/auth/login-demo'),
              headers: {
                'content-type': 'application/json',
                'accept': 'application/json',
              },
              body: '{"email":"renata@pucminas.edu.br"}',
            )
            .timeout(timeout);
        if (responseOk(resposta.statusCode) ||
            resposta.statusCode == 401 ||
            resposta.statusCode == 403) {
          return base;
        }
      } catch (_) {
        // tenta o próximo candidato
      }
    }
  } finally {
    if (deveFechar) httpClient.close();
  }
  return apiBaseUrl;
}

bool responseOk(int status) => status >= 200 && status < 300;

/// Erro devolvido pela API (resposta HTTP fora de 2xx).
class ApiException implements Exception {
  const ApiException(this.mensagem, {this.statusCode});

  final String mensagem;
  final int? statusCode;

  @override
  String toString() => mensagem;
}

/// Falha de rede: backend fora do ar, sem conexão ou tempo esgotado.
class ApiIndisponivelException implements Exception {
  const ApiIndisponivelException([this.detalhe]);

  final Object? detalhe;

  @override
  String toString() =>
      'Não foi possível conectar ao Ajuda-aí.\n'
      'Verifique sua conexão com a internet e tente novamente.';
}

/// Extrai a mensagem legível do corpo `{message, error, statusCode}`.
String mensagemErroApi(http.Response resposta, String padrao) {
  try {
    final corpo = jsonDecode(resposta.body);
    if (corpo is Map) {
      final mensagem = corpo['message'];
      if (mensagem is String && mensagem.trim().isNotEmpty) return mensagem;
      if (mensagem is List && mensagem.isNotEmpty) {
        return mensagem.map((e) => '$e').join('\n');
      }
    }
  } catch (_) {
    // corpo não é JSON
  }
  return '$padrao (${resposta.statusCode}).';
}

/// Executa a requisição convertendo falhas de rede em [ApiIndisponivelException]
/// e respostas de erro em [ApiException].
Future<http.Response> executarRequisicao(
  Future<http.Response> Function() requisicao, {
  required String erroPadrao,
  Duration timeout = const Duration(seconds: 10),
}) async {
  final http.Response resposta;
  try {
    resposta = await requisicao().timeout(timeout);
  } on TimeoutException catch (e) {
    throw ApiIndisponivelException(e);
  } on http.ClientException catch (e) {
    throw ApiIndisponivelException(e);
  }
  if (!responseOk(resposta.statusCode)) {
    throw ApiException(
      mensagemErroApi(resposta, erroPadrao),
      statusCode: resposta.statusCode,
    );
  }
  return resposta;
}

/// Decodifica o corpo como JSON (aceita corpo vazio → null).
dynamic decodificarJson(http.Response resposta) {
  if (resposta.body.trim().isEmpty) return null;
  return jsonDecode(utf8.decode(resposta.bodyBytes));
}
