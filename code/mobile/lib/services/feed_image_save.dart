import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;

class FeedImageDownloadException implements Exception {
  const FeedImageDownloadException(this.statusCode);
  final int statusCode;
  @override
  String toString() => 'Não foi possível baixar a imagem (HTTP $statusCode)';
}

/// Mantém a SAS somente em memória e envia ao plugin apenas os bytes da imagem.
Future<void> salvarImagemDoFeed(
  String fonte, {
  required http.Client client,
}) async {
  final uri = Uri.parse(fonte);
  if (uri.scheme != 'https' && uri.scheme != 'http') {
    throw StateError('Fonte de imagem não suportada');
  }
  if (!await Gal.hasAccess() && !await Gal.requestAccess()) {
    throw StateError('Acesso à galeria não autorizado');
  }

  final resposta = await client.get(uri).timeout(const Duration(seconds: 30));
  if (resposta.statusCode != 200 || resposta.bodyBytes.isEmpty) {
    throw FeedImageDownloadException(resposta.statusCode);
  }
  await Gal.putImageBytes(
    resposta.bodyBytes,
    name: 'ajuda-ai-${DateTime.now().microsecondsSinceEpoch}',
  );
}
