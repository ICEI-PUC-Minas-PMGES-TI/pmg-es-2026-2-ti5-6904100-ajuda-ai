import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ajuda_ai/tela_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);

void main() {
  for (final protocolo in ['https', 'http']) {
    testWidgets('feed carrega imagem $protocolo preservando a SAS', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final url =
          '$protocolo://storage.example.test/feed/publicacoes/autor/foto.jpg'
          '?sv=2025-11-05&spr=https&sp=r&sig=assinatura%2Bteste%2F%3D';
      final rede = _ClienteImagem();
      debugNetworkImageHttpClientProvider = () => rede;
      addTearDown(() {
        debugNetworkImageHttpClientProvider = null;
        PaintingBinding.instance.imageCache.clear();
        PaintingBinding.instance.imageCache.clearLiveImages();
      });
      final api = MockClient((request) async {
        final corpo = request.url.path == '/publicacoes/permissoes'
            ? {'podePublicar': false}
            : [
                {
                  'id': 6,
                  'autor': 'Coordenação',
                  'texto': 'Publicação com imagem do Azure',
                  'imagens': [url],
                  'midias': ['feed/publicacoes/autor/foto.jpg'],
                },
              ];
        return http.Response(
          jsonEncode(corpo),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      addTearDown(api.close);

      await tester.pumpWidget(MaterialApp(home: FeedPage(client: api)));
      await tester.pumpAndSettle();

      final imagens = tester.widgetList<Image>(find.byType(Image));
      expect(
        imagens.where((imagem) => imagem.image is NetworkImage),
        hasLength(1),
      );
      expect(rede.urls.map((uri) => uri.toString()), [url]);
      // Espera a decodificação do arquivo, além da escolha do ImageProvider.
      final rawFinder = find.descendant(
        of: find.byWidgetPredicate(
          (widget) => widget is Image && widget.image is NetworkImage,
        ),
        matching: find.byType(RawImage),
      );
      final rawImage = tester.widget<RawImage>(rawFinder);
      if (rawImage.image == null) {
        await tester.runAsync(() async {
          final completer = Completer<void>();
          final stream = NetworkImage(url).resolve(ImageConfiguration.empty);
          final listener = ImageStreamListener(
            (_, _) => completer.complete(),
            onError: completer.completeError,
          );
          stream.addListener(listener);
          try {
            await completer.future;
          } finally {
            stream.removeListener(listener);
          }
        });
        await tester.pump();
      }
      expect(tester.widget<RawImage>(rawFinder).image, isNotNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      debugNetworkImageHttpClientProvider = null;
    });
  }
}

class _ClienteImagem extends Fake implements HttpClient {
  final urls = <Uri>[];

  @override
  Future<HttpClientRequest> getUrl(Uri url) async {
    urls.add(url);
    return _PedidoImagem();
  }
}

class _PedidoImagem extends Fake implements HttpClientRequest {
  @override
  Future<HttpClientResponse> close() async => _RespostaImagem();
}

class _RespostaImagem extends Fake implements HttpClientResponse {
  @override
  int get statusCode => HttpStatus.ok;

  @override
  int get contentLength => _png.length;

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int>)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.value(_png).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );
}
