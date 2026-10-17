import 'package:flutter_appauth/flutter_appauth.dart';

/// Client ID e tenant do app público no Entra ID.
/// Não são segredo. O client secret não entra no aplicativo.
const microsoftClientId = String.fromEnvironment('MICROSOFT_CLIENT_ID');
const microsoftTenantId = String.fromEnvironment('MICROSOFT_TENANT_ID');

/// Precisa ser o mesmo URI cadastrado no Entra ID, em minúsculas.
const microsoftRedirectUri = String.fromEnvironment(
  'MICROSOFT_REDIRECT_URI',
  defaultValue: 'br.pucminas.ajudaai://auth',
);

bool get microsoftConfigurado =>
    microsoftClientId.isNotEmpty && microsoftTenantId.isNotEmpty;

class MicrosoftNaoConfigurado implements Exception {
  const MicrosoftNaoConfigurado();

  @override
  String toString() =>
      'Login Microsoft não configurado. Informe MICROSOFT_CLIENT_ID e '
      'MICROSOFT_TENANT_ID e cadastre o redirect $microsoftRedirectUri '
      'no Entra ID.';
}

/// Obtém um ID token real (authorization code + PKCE). Sem client secret.
Future<String> obterIdTokenMicrosoft() async {
  if (!microsoftConfigurado) throw const MicrosoftNaoConfigurado();

  final appAuth = FlutterAppAuth();
  final resultado = await appAuth.authorizeAndExchangeCode(
    AuthorizationTokenRequest(
      microsoftClientId,
      microsoftRedirectUri,
      issuer: 'https://login.microsoftonline.com/$microsoftTenantId/v2.0',
      scopes: const ['openid', 'profile', 'email'],
      promptValues: const ['select_account'],
    ),
  );
  final idToken = resultado.idToken;
  if (idToken == null || idToken.isEmpty) {
    throw Exception('A Microsoft não devolveu um ID token.');
  }
  return idToken;
}
