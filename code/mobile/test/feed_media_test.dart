import 'package:ajuda_ai/services/feed_media.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const a = 'https://storage.test/foto.jpg?se=2040-01-01T00%3A00%3A00Z&sig=a';
  const b = 'https://storage.test/foto.jpg?se=2040-01-01T00%3A00%3A00Z&sig=b';
  test('mesmo blob preserva SAS válida sem notificar ou baixar novamente', () {
    final midia = FeedMedia('feed/foto.jpg', a, () async {});
    var atualizacoes = 0;
    midia.addListener(() => atualizacoes++);
    midia.receber(b);
    expect(midia.value, a);
    expect(atualizacoes, 0);
    midia.dispose();
  });
  test('erro usa SAS nova já recebida e evita nova consulta', () async {
    var consultas = 0;
    final midia = FeedMedia('feed/foto.jpg', a, () async {
      consultas++;
    });
    midia.receber(b);
    await midia.garantirValida(erro: true, urlComErro: a);
    expect(midia.value, b);
    expect(consultas, 0);
    // Um callback atrasado de uma imagem antiga não invalida a nova URL.
    await midia.garantirValida(erro: true, urlComErro: a);
    expect(midia.value, b);
    midia.dispose();
  });
  test('SAS expirada aceita renovação legítima', () {
    final midia = FeedMedia(
      'feed/foto.jpg',
      'https://storage.test/foto.jpg?se=2000-01-01T00:00:00Z',
      () async {},
    );
    midia.receber(a);
    expect(midia.value, a);
    midia.dispose();
  });
  test(
    'download renova SAS expirada uma vez e limita tentativas de erro',
    () async {
      var consultas = 0;
      late FeedMedia midia;
      midia = FeedMedia(
        'feed/foto.jpg',
        'https://storage.test/foto.jpg?se=2000-01-01T00:00:00Z',
        () async {
          consultas++;
          midia.receber(a);
        },
      );
      await midia.garantirValida();
      await midia.garantirValida();
      expect(midia.value, a);
      expect(consultas, 1);
      await midia.garantirValida(erro: true, urlComErro: a);
      expect(consultas, 1);
      midia.dispose();
    },
  );
}
