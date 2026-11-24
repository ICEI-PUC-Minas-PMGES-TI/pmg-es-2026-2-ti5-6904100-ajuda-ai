import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Conexão SSE com Bearer, timeout, reconexão e cancelamento independente do REST.
class FeedEvents {
  FeedEvents({
    required this.token,
    required this.onEvento,
    required this.onEstado,
    this.baseUrl = apiBaseUrl,
    this.programa,
    this.onSemAcesso,
    http.Client Function()? clientFactory,
  }) : _clientFactory = clientFactory ?? http.Client.new;

  final String? Function() token;
  final String baseUrl;
  final String? Function()? programa;
  final void Function()? onSemAcesso;
  final void Function(String tipo, Map<String, dynamic> dados) onEvento;
  final void Function(String mensagem) onEstado;
  final http.Client Function() _clientFactory;
  http.Client? _client;
  Timer? _retry;
  Completer<void>? _espera;
  int _geracao = 0;

  void iniciar() {
    fechar();
    final geracao = ++_geracao;
    unawaited(_conectar(geracao));
  }

  Future<void> _conectar(int geracao) async {
    var atraso = 1;
    while (geracao == _geracao) {
      final jwt = token();
      if (jwt == null || jwt.isEmpty) {
        onEstado('Entre novamente para acessar o feed.');
        onSemAcesso?.call();
        return;
      }
      final client = _clientFactory();
      _client = client;
      try {
        final request =
            http.Request(
                'GET',
                Uri.parse('$baseUrl/publicacoes/events').replace(
                  queryParameters: (programa?.call()?.isNotEmpty ?? false)
                      ? {'programa': programa!()!}
                      : null,
                ),
              )
              ..headers.addAll({
                'Authorization': 'Bearer $jwt',
                'Accept': 'text/event-stream',
              });
        final response = await client
            .send(request)
            .timeout(const Duration(seconds: 10));
        if (geracao != _geracao) return;
        if (response.statusCode == 401 || response.statusCode == 403) {
          onEstado('Sessão expirada. Entre novamente.');
          onSemAcesso?.call();
          return;
        }
        if (response.statusCode != 200 ||
            !(response.headers['content-type'] ?? '').contains(
              'text/event-stream',
            )) {
          throw const FormatException('Stream indisponível.');
        }
        atraso = 1;
        var tipo = 'message';
        final dados = <String>[];
        var tamanho = 0;
        await for (final linha
            in response.stream
                .transform(utf8.decoder)
                .transform(const LineSplitter())
                .timeout(const Duration(seconds: 45))) {
          if (geracao != _geracao) return;
          tamanho += linha.length;
          if (tamanho > 1024 * 1024) {
            throw const FormatException('Evento muito grande.');
          }
          if (linha.isEmpty) {
            if (dados.isNotEmpty) {
              final evento = jsonDecode(dados.join('\n'));
              if (evento is Map<String, dynamic>) {
                if (tipo == 'feed.access') {
                  onSemAcesso?.call();
                  return;
                }
                if (tipo == 'feed.ready' || tipo == 'feed.heartbeat') {
                  onEstado(
                    evento['conectado'] == true
                        ? 'Atualizações ao vivo'
                        : 'Aguardando conexão do servidor',
                  );
                }
                onEvento(tipo, evento);
              }
            }
            dados.clear();
            tipo = 'message';
            tamanho = 0;
          } else if (linha.startsWith('event:')) {
            tipo = linha.substring(6).trim();
          } else if (linha.startsWith('data:')) {
            dados.add(linha.substring(5).trimLeft());
          }
        }
      } catch (_) {
        // O histórico é consultado novamente após feed.ready, cobrindo eventos perdidos.
      } finally {
        client.close();
      }
      if (geracao != _geracao) return;
      onEstado('Reconectando às atualizações…');
      final espera = Completer<void>();
      _espera = espera;
      _retry = Timer(Duration(seconds: atraso), () {
        if (!espera.isCompleted) espera.complete();
      });
      await espera.future;
      atraso = (atraso * 2).clamp(1, 15);
    }
  }

  void fechar() {
    _geracao++;
    _retry?.cancel();
    if (_espera case final espera? when !espera.isCompleted) {
      espera.complete();
    }
    _client?.close();
  }
}
