import 'package:flutter_test/flutter_test.dart';
import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/services/auth_api.dart';

void main() {
  test('com API_BASE_URL definida, so ela e usada (sem fallback local)', () {
    final bases = apiBaseUrlCandidates(
      definida: 'https://api.exemplo.azurecontainerapps.io',
    );
    expect(bases, ['https://api.exemplo.azurecontainerapps.io']);
  });

  test('sem definicao, mantem os candidatos de desenvolvimento', () {
    final bases = apiBaseUrlCandidates(definida: '');
    expect(bases, contains('http://10.0.2.2:3000'));
    expect(bases, contains('http://localhost:3000'));
  });

  test('login demo hospedado (https) tolera a subida do servidor; local falha rápido', () {
    expect(
      AuthApi.limiteLoginDemo('https://api.exemplo.azurecontainerapps.io'),
      const Duration(seconds: 90),
    );
    expect(
      AuthApi.limiteLoginDemo('http://10.0.2.2:3000'),
      const Duration(seconds: 8),
    );
  });

  test('chave demo: aceita ASCII visível; recusa frase colada por engano', () {
    expect(AuthApi.chaveDemoValida('AbC123-_xyz.0123456789'), isTrue);
    expect(
      AuthApi.chaveDemoValida('Ainda não achei a causa do mapa 3D'),
      isFalse,
    );
    expect(AuthApi.chaveDemoValida('chave com espaço 1234'), isFalse);
    expect(AuthApi.chaveDemoValida('linha1\nlinha2-abcdef'), isFalse);
    expect(AuthApi.chaveDemoValida('curta'), isFalse);
  });

  test(
    'login demo com chave inválida falha com mensagem própria, sem rede',
    () async {
      final api = AuthApi(baseUrl: 'https://api.exemplo.test');
      await expectLater(
        api.loginDemo(
          'a@pucminas.edu.br',
          chave: 'texto qualquer colado por engano',
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.mensagem,
            'mensagem',
            contains('chave de demonstração está inválida'),
          ),
        ),
      );
    },
  );
}
