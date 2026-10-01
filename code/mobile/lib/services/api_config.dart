import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Base URL da API.
///
/// Override em qualquer máquina/dispositivo:
/// `flutter run --dart-define=API_BASE_URL=http://SEU_IP:3000`
///
/// Padrões:
/// - Web / iOS simulator: localhost
/// - Android (emulador): 10.0.2.2 (host da máquina)
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
        if (responseOk(resposta.statusCode) || resposta.statusCode == 401 || resposta.statusCode == 403) {
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
