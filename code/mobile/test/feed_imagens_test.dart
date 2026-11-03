import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ajuda_ai/tela_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);

void main() {
  late _GaleriaFake galeria;
  setUp(() {
    galeria = _GaleriaFake();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('gal'), galeria.chamar);
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel('gal'), null);
  });

  for (final protocolo in ['https', 'http']) {
    testWidgets('feed carrega imagem $protocolo preservando a SAS', (
      tester,
    ) async {
      final url =
          '$protocolo://storage.example.test/feed/publicacoes/autor/foto.jpg'
          '?sv=2025-11-05&spr=https&sp=r&sig=assinatura%2Bteste%2F%3D';
      final rede = await _abrirFeed(tester, [url]);

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

  testWidgets('toque abre a imagem selecionada e fechar preserva o carrossel', (
    tester,
  ) async {
    const primeira =
        'https://storage.example.test/feed/primeira.jpg?sp=r&sig=a%2B%2F%3D';
    const segunda =
        'https://storage.example.test/feed/segunda.jpg?sp=r&sig=b%2B%2F%3D';
    final downloads = <http.Request>[];
    final rede = await _abrirFeed(tester, [
      primeira,
      segunda,
    ], downloads: downloads);
    final tag = tester
        .widget<Hero>(
          find.ancestor(
            of: _imagemRemota(primeira),
            matching: find.byType(Hero),
          ),
        )
        .tag;

    await tester.tap(_imagemRemota(primeira));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    expect(tester.takeException(), isNull);
    await tester.pumpAndSettle();

    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(tester.getSize(find.byType(Scaffold)), const Size(390, 1000));
    expect(
      tester.widget<Scaffold>(find.byType(Scaffold)).backgroundColor,
      Colors.black,
    );
    expect(_imagemRemota(primeira), findsOneWidget);
    expect(tester.widget<Image>(_imagemRemota(primeira)).fit, BoxFit.contain);
    expect(tester.widget<Hero>(find.byType(Hero)).tag, tag);
    expect(find.byTooltip('Salvar imagem'), findsOneWidget);

    await tester.tap(find.byTooltip('Fechar imagem'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(find.text('Publicação com imagem do Azure'), findsOneWidget);

    await tester.drag(find.byType(PageView), const Offset(-300, 0));
    await tester.pumpAndSettle();
    expect(find.text('2/2'), findsOneWidget);
    await tester.tap(_imagemRemota(segunda));
    await tester.pumpAndSettle();

    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(_imagemRemota(segunda), findsOneWidget);
    expect(_imagemRemota(primeira), findsNothing);
    expect(
      tester.widget<Image>(_imagemRemota(segunda)).image,
      isA<NetworkImage>(),
    );
    expect(
      rede.urls.map((uri) => uri.toString()),
      containsAll([primeira, segunda]),
    );
    await tester.tap(find.byTooltip('Salvar imagem'));
    await tester.pumpAndSettle();
    expect(downloads.single.url.toString(), segunda);
    expect(downloads.single.headers.containsKey('authorization'), isFalse);
    expect(galeria.arquivos.single['bytes'], orderedEquals(_png));
    expect(galeria.arquivos.single['name'], startsWith('ajuda-ai-'));
    expect(galeria.arquivos.single.toString(), isNot(contains('sig=')));
    expect(find.text('Imagem salva na galeria'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
    expect(
      tester.getSize(find.text('Imagem salva na galeria')).width,
      lessThan(320),
    );
    expect(
      tester.getTopLeft(find.text('Imagem salva na galeria')).dy,
      lessThan(120),
    );
    expect(find.byType(InteractiveViewer), findsOneWidget);

    // O botão/gesto voltar do sistema também fecha a rota.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(find.text('2/2'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = null;
  });

  testWidgets('viewer permite pinça e arraste da imagem ampliada', (
    tester,
  ) async {
    const url = 'https://storage.example.test/feed/zoom.jpg?sp=r&sig=teste';
    await _abrirFeed(tester, [url]);
    await tester.tap(_imagemRemota(url));
    await tester.pumpAndSettle();
    final viewer = find.byType(InteractiveViewer);
    final widget = tester.widget<InteractiveViewer>(viewer);
    expect(widget.minScale, 1);
    expect(widget.maxScale, 5);
    final transform = find.descendant(
      of: viewer,
      matching: find.byType(Transform),
    );
    final centro = tester.getCenter(viewer);
    final esquerdo = await tester.createGesture(pointer: 1);
    final direito = await tester.createGesture(pointer: 2);
    await esquerdo.down(centro - const Offset(30, 0));
    await direito.down(centro + const Offset(30, 0));
    for (var passo = 1; passo <= 5; passo++) {
      await esquerdo.moveTo(centro - Offset(30 + passo * 15, 0));
      await direito.moveTo(centro + Offset(30 + passo * 15, 0));
      await tester.pump();
    }
    await esquerdo.up();
    await direito.up();
    await tester.pumpAndSettle();
    final ampliada = tester.widget<Transform>(transform).transform.clone();
    expect(ampliada.getMaxScaleOnAxis(), greaterThan(1));

    await tester.drag(viewer, const Offset(35, 25));
    await tester.pumpAndSettle();
    final arrastada = tester.widget<Transform>(transform).transform;
    expect(
      arrastada.getMaxScaleOnAxis(),
      closeTo(ampliada.getMaxScaleOnAxis(), 0.01),
    );
    expect(arrastada.getTranslation(), isNot(ampliada.getTranslation()));
    final antesDeSalvar = arrastada.clone();
    await tester.tap(find.byTooltip('Salvar imagem'));
    await tester.pumpAndSettle();
    expect(tester.widget<Transform>(transform).transform, antesDeSalvar);
    expect(find.text('Imagem salva na galeria'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = null;
  });

  testWidgets('falha de carregamento mostra aviso e permite fechar o viewer', (
    tester,
  ) async {
    const url = 'https://storage.example.test/feed/expirada.jpg?sp=r&sig=teste';
    await _abrirFeed(tester, [url], status: HttpStatus.forbidden);
    expect(find.text('Não foi possível carregar a imagem.'), findsOneWidget);

    await tester.tap(find.text('Não foi possível carregar a imagem.'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(find.text('Não foi possível carregar a imagem.'), findsOneWidget);
    await tester.tap(find.byTooltip('Fechar imagem'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = null;
  });

  testWidgets('toques rápidos iniciam somente um download por vez', (
    tester,
  ) async {
    const url = 'https://storage.example.test/feed/salvar.jpg?sig=teste%2B%3D';
    final downloads = <http.Request>[];
    final concluir = Completer<void>();
    galeria.aguardar = concluir.future;
    await _abrirFeed(tester, [url], downloads: downloads);
    await tester.tap(_imagemRemota(url));
    await tester.pumpAndSettle();
    final botao = find.byWidgetPredicate(
      (widget) => widget is IconButton && widget.tooltip == 'Salvar imagem',
    );
    await tester.tap(botao);
    await tester.tap(botao);
    await tester.pump();
    expect(downloads, hasLength(1));
    expect(galeria.arquivos, hasLength(1));
    expect(tester.widget<IconButton>(botao).onPressed, isNull);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    concluir.complete();
    await tester.pumpAndSettle();
    expect(find.text('Imagem salva na galeria'), findsOneWidget);
    expect(tester.widget<IconButton>(botao).onPressed, isNotNull);
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.tap(find.byTooltip('Fechar imagem'));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = null;
  });

  for (final falha in ['http', 'galeria', 'permissao']) {
    testWidgets('falha de $falha mostra feedback e mantém viewer aberto', (
      tester,
    ) async {
      const url = 'https://storage.example.test/feed/falha.jpg?sig=teste';
      final downloads = <http.Request>[];
      if (falha == 'galeria') galeria.falhar = true;
      if (falha == 'permissao') {
        galeria.acesso = false;
        galeria.autorizar = false;
      }
      await _abrirFeed(
        tester,
        [url],
        downloads: downloads,
        downloadStatus: falha == 'http' ? HttpStatus.forbidden : HttpStatus.ok,
      );
      await tester.tap(_imagemRemota(url));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Salvar imagem'));
      await tester.pumpAndSettle();
      expect(find.text('Não foi possível salvar a imagem'), findsOneWidget);
      expect(find.text('Imagem salva na galeria'), findsNothing);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      if (falha == 'permissao') {
        expect(downloads, isEmpty);
        expect(galeria.metodos, contains('requestAccess'));
      }
      if (falha != 'galeria') expect(galeria.arquivos, isEmpty);
      await tester.tap(find.byTooltip('Fechar imagem'));
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      debugNetworkImageHttpClientProvider = null;
    });
  }

  testWidgets('SSE de interação preserva imagem e consulta apenas o post afetado', (
    tester,
  ) async {
    const a =
        'https://storage.example.test/feed/mesma.jpg?se=2040-01-01T00:00:00Z&sig=a';
    const b =
        'https://storage.example.test/feed/mesma.jpg?se=2040-01-01T00:00:00Z&sig=b';
    const nova =
        'https://storage.example.test/feed/outra.jpg?se=2040-01-01T00:00:00Z&sig=c';
    final p = <String, dynamic>{
      'id': 6,
      'texto': 'Imagem estável',
      'imagens': [a],
      'midias': ['feed/mesma.jpg'],
      'comentarios': 0,
    };
    final stream = _StreamImagens();
    final consultas = <String>[];
    final rede = await _abrirFeed(
      tester,
      [a],
      publicacao: p,
      eventos: stream,
      consultas: consultas,
    );
    expect(rede.urls, hasLength(1));
    final elemento = tester.element(_imagemRemota(a));
    p['imagens'] = [b];
    p['comentarios'] = 1;
    stream.emitir('feed.comment.created');
    await tester.pumpAndSettle();
    expect(_imagemRemota(a), findsOneWidget);
    expect(tester.element(_imagemRemota(a)), same(elemento));
    expect(rede.urls, hasLength(1));
    expect(consultas.where((v) => v == '/publicacoes'), hasLength(1));
    expect(consultas.where((v) => v == '/publicacoes/6'), hasLength(1));
    p['imagens'] = [nova];
    p['midias'] = ['feed/outra.jpg'];
    stream.emitir('feed.post.updated');
    await tester.pumpAndSettle();
    expect(_imagemRemota(nova), findsOneWidget);
    expect(rede.urls, hasLength(2));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = null;
  });

  testWidgets(
    'download com SAS recusada reutiliza renovação recebida e salva a imagem',
    (tester) async {
      const a =
          'https://storage.example.test/feed/mesma.jpg?se=2040-01-01T00:00:00Z&sig=velha';
      const b =
          'https://storage.example.test/feed/mesma.jpg?se=2040-01-01T00:00:00Z&sig=nova';
      final p = <String, dynamic>{
        'id': 6,
        'imagens': [a],
        'midias': ['feed/mesma.jpg'],
      };
      final stream = _StreamImagens();
      final downloads = <http.Request>[];
      await _abrirFeed(
        tester,
        [a],
        publicacao: p,
        eventos: stream,
        downloads: downloads,
        downloadStatusFor: (uri) => uri.toString() == a ? 403 : 200,
      );
      p['imagens'] = [b];
      stream.emitir('feed.like.updated');
      await tester.pumpAndSettle();
      expect(_imagemRemota(a), findsOneWidget);
      await tester.tap(_imagemRemota(a));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Salvar imagem'));
      await tester.pumpAndSettle();
      expect(downloads.map((v) => v.url.toString()), [a, b]);
      expect(galeria.arquivos, hasLength(1));
      expect(find.text('Imagem salva na galeria'), findsOneWidget);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      debugNetworkImageHttpClientProvider = null;
    },
  );
}

Finder _imagemRemota(String url) => find.byWidgetPredicate(
  (widget) =>
      widget is Image &&
      widget.image is NetworkImage &&
      (widget.image as NetworkImage).url == url,
);

Future<_ClienteImagem> _abrirFeed(
  WidgetTester tester,
  List<String> urls, {
  int status = HttpStatus.ok,
  int downloadStatus = HttpStatus.ok,
  List<http.Request>? downloads,
  Map<String, dynamic>? publicacao,
  _StreamImagens? eventos,
  List<String>? consultas,
  int Function(Uri)? downloadStatusFor,
}) async {
  tester.view.physicalSize = const Size(390, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final rede = _ClienteImagem(status);
  debugNetworkImageHttpClientProvider = () => rede;
  addTearDown(() {
    debugNetworkImageHttpClientProvider = null;
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
  });
  final api = MockClient((request) async {
    consultas?.add(request.url.path);
    // Abrir/fechar uma imagem só pode fazer leituras, nunca novos uploads.
    expect(request.method, 'GET');
    if (request.url.host == 'storage.example.test') {
      downloads?.add(request);
      return http.Response.bytes(
        _png,
        downloadStatusFor?.call(request.url) ?? downloadStatus,
        headers: {'content-type': 'image/png'},
      );
    }
    final dados =
        publicacao ??
        {
          'id': 6,
          'autor': 'Coordenação',
          'texto': 'Publicação com imagem do Azure',
          'imagens': urls,
          'midias': [for (var i = 0; i < urls.length; i++) 'feed/foto-$i.jpg'],
        };
    final post = {'podeInteragir': true, ...dados};
    final corpo = request.url.path == '/publicacoes/permissoes'
        ? {'podePublicar': false}
        : request.url.path == '/publicacoes/6'
        ? post
        : [post];
    return http.Response(
      jsonEncode(corpo),
      200,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
  addTearDown(api.close);
  await tester.pumpWidget(
    MaterialApp(
      home: FeedPage(
        client: api,
        accessToken: eventos == null ? null : 'teste',
        eventsClientFactory: eventos == null ? null : () => eventos,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return rede;
}

class _StreamImagens extends http.BaseClient {
  final dados = StreamController<List<int>>();
  void emitir(String tipo) =>
      dados.add(utf8.encode('event: $tipo\ndata: {"publicacaoId":6}\n\n'));
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      http.StreamedResponse(
        dados.stream,
        200,
        headers: {'content-type': 'text/event-stream'},
      );
  @override
  void close() {
    unawaited(dados.close());
  }
}

class _GaleriaFake {
  bool acesso = true;
  bool autorizar = true;
  bool falhar = false;
  Future<void>? aguardar;
  final metodos = <String>[];
  final arquivos = <Map<String, dynamic>>[];

  Future<dynamic> chamar(MethodCall call) async {
    metodos.add(call.method);
    switch (call.method) {
      case 'hasAccess':
        return acesso;
      case 'requestAccess':
        acesso = autorizar;
        return autorizar;
      case 'putImageBytes':
        arquivos.add(Map<String, dynamic>.from(call.arguments as Map));
        if (falhar) throw PlatformException(code: 'UNEXPECTED');
        await aguardar;
        return null;
      default:
        throw StateError('Método inesperado: ${call.method}');
    }
  }
}

class _ClienteImagem extends Fake implements HttpClient {
  _ClienteImagem(this.status);

  final int status;
  final urls = <Uri>[];

  @override
  Future<HttpClientRequest> getUrl(Uri url) async {
    urls.add(url);
    return _PedidoImagem(status);
  }
}

class _PedidoImagem extends Fake implements HttpClientRequest {
  _PedidoImagem(this.status);

  final int status;
  @override
  Future<HttpClientResponse> close() async => _RespostaImagem(status);
}

class _RespostaImagem extends Fake implements HttpClientResponse {
  _RespostaImagem(this.statusCode);

  @override
  final int statusCode;

  @override
  Future<E> drain<E>([E? futureValue]) =>
      Stream<List<int>>.empty().drain(futureValue);

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
