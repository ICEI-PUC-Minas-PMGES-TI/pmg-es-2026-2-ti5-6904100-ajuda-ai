import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'api_config.dart';

String novoIdMensagemChat() {
  final random = Random.secure();
  final b = List.generate(16, (_) => random.nextInt(256));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  final h = b.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

class ChatApi {
  ChatApi({
    required this.token,
    this.baseUrl = apiBaseUrl,
    http.Client? client,
    http.Client Function()? streamClientFactory,
  }) : _client = client ?? http.Client(),
       _proprio = client == null,
       _streamClientFactory = streamClientFactory ?? http.Client.new;
  final String? Function() token;
  final String baseUrl;
  final http.Client _client;
  final bool _proprio;
  final http.Client Function() _streamClientFactory;
  Map<String, String> _headers({bool sse = false}) {
    final atual = token();
    if (atual == null || atual.isEmpty) {
      throw const ApiException(
        'Sua sessão expirou. Entre novamente.',
        statusCode: 401,
      );
    }
    return {
      'authorization': 'Bearer $atual',
      'accept': sse ? 'text/event-stream' : 'application/json',
      if (!sse) 'content-type': 'application/json',
    };
  }

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${baseUrl.replaceFirst(RegExp(r'/$'), '')}$path')
          .replace(queryParameters: query?.isEmpty == true ? null : query);
  Future<dynamic> _request(
    String path, {
    Map<String, String>? query,
    Map<String, dynamic>? body,
  }) async {
    final headers = _headers();
    final response = await executarRequisicao(
      () => body == null
          ? _client.get(_uri(path, query), headers: headers)
          : _client.post(
              _uri(path, query),
              headers: headers,
              body: jsonEncode(body),
            ),
      erroPadrao: 'Não foi possível consultar a conversa',
    );
    if (!responseOk(response.statusCode)) {
      throw ApiException(
        mensagemErroApi(response, 'Não foi possível consultar a conversa'),
        statusCode: response.statusCode,
      );
    }
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  Future<List<Map<String, dynamic>>> listar(String programa) async =>
      ((await _request(
        '/chats',
        query: {if (programa.isNotEmpty) 'programa': programa},
      )) as List).map((c) => Map<String, dynamic>.from(c as Map)).toList();
  Future<Map<String, dynamic>> mensagens(
    int id, {
    int? antesDe,
    int? depoisDe,
  }) async => Map<String, dynamic>.from(
    await _request(
      '/chats/$id/mensagens',
      query: {
        if (antesDe != null) 'antesDe': '$antesDe',
        if (depoisDe != null) 'depoisDe': '$depoisDe',
      },
    ) as Map,
  );
  Future<Map<String, dynamic>> enviar(
    int id,
    String texto,
    String clientId,
  ) async => Map<String, dynamic>.from(
    await _request(
      '/chats/$id/mensagens',
      body: {'texto': texto, 'clientId': clientId},
    ) as Map,
  );

  Stream<Map<String, dynamic>> observar(int id) {
    late StreamController<Map<String, dynamic>> controller;
    StreamSubscription<String>? linhas;
    http.Client? client;
    var terminou = false;
    Future<void> cancelar() async {
      final cancelarFonte = !terminou;
      terminou = true;
      client?.close();
      client = null;
      if (cancelarFonte) await linhas?.cancel();
    }

    void concluir([Object? erro, StackTrace? stack]) {
      if (terminou) return;
      terminou = true;
      client?.close();
      client = null;
      if (erro != null) unawaited(linhas?.cancel());
      if (erro != null) controller.addError(erro, stack);
      unawaited(controller.close());
    }

    Future<void> abrir() async {
      try {
        final headers = _headers(sse: true);
        client = _streamClientFactory();
        final request = http.Request('GET', _uri('/chats/$id/events'))
          ..headers.addAll(headers);
        final response = await client!
            .send(request)
            .timeout(const Duration(seconds: 12));
        if (terminou) return;
        if (!responseOk(response.statusCode)) {
          throw ApiException(
            'Não foi possível atualizar a conversa.',
            statusCode: response.statusCode,
          );
        }
        var tipo = 'message', tamanho = 0;
        final dados = <String>[];
        linhas = response.stream
            .transform(utf8.decoder)
            .transform(const LineSplitter())
            .listen(
              (linha) {
                if (terminou) return;
                try {
                  tamanho += linha.length;
                  if (tamanho > 65536) {
                    throw const ApiException('Evento de conversa inválido.');
                  }
                  if (linha.isEmpty) {
                    if (dados.isNotEmpty) {
                      controller.add({
                        'tipo': tipo,
                        'dados': jsonDecode(dados.join('\n')),
                      });
                    }
                    tipo = 'message';
                    dados.clear();
                    tamanho = 0;
                  } else if (linha.startsWith('event:')) {
                    tipo = linha.substring(6).trim();
                  } else if (linha.startsWith('data:')) {
                    dados.add(linha.substring(5).trimLeft());
                  }
                } catch (erro, stack) {
                  concluir(erro, stack);
                }
              },
              onError: (Object erro, StackTrace stack) => concluir(erro, stack),
              onDone: concluir,
            );
      } catch (erro, stack) {
        concluir(
          erro is TimeoutException ? const ApiIndisponivelException() : erro,
          stack,
        );
      }
    }

    controller = StreamController<Map<String, dynamic>>(
      onListen: () {
        unawaited(abrir());
      },
      onCancel: cancelar,
      onPause: () => linhas?.pause(),
      onResume: () => linhas?.resume(),
    );
    return controller.stream;
  }

  void fechar() {
    if (_proprio) _client.close();
  }
}

List<Map<String, dynamic>> mesclarMensagensChat(
  List<Map<String, dynamic>> atuais,
  List<Map<String, dynamic>> novas,
) {
  const ordem = {'enviada': 0, 'entregue': 1, 'lida': 2};
  final porId = {for (final m in atuais) m['id']: m};
  for (final nova in novas) {
    final antiga = porId[nova['id']];
    final estado =
        antiga != null &&
            (ordem[antiga['estado']] ?? 0) > (ordem[nova['estado']] ?? 0)
        ? antiga['estado']
        : nova['estado'];
    final recibosAntigos = antiga?['recibos'] as Map?;
    final recibosNovos = nova['recibos'] as Map?;
    final recibos = recibosAntigos == null && recibosNovos == null
        ? null
        : {
            ...?recibosAntigos,
            ...?recibosNovos,
            'lidas': max(
              (recibosAntigos?['lidas'] as num? ?? 0),
              (recibosNovos?['lidas'] as num? ?? 0),
            ),
            'entregues': max(
              (recibosAntigos?['entregues'] as num? ?? 0),
              (recibosNovos?['entregues'] as num? ?? 0),
            ),
          };
    porId[nova['id']] = {
      ...?antiga,
      ...nova,
      'estado': estado,
      'recibos': ?recibos,
    };
  }
  return porId.values.toList()
    ..sort((a, b) => (a['id'] as num).compareTo(b['id'] as num));
}

String tituloConversaChat(Map<String, dynamic> chat) {
  if (chat['tipo'] == 'coletivo') {
    return '${chat['titulo'] ?? 'Conversa do grupo'}';
  }
  final pessoas = (chat['participantes'] as List? ?? []).whereType<Map>().where(
    (p) => p['participacaoId'] != chat['minhaParticipacaoId'],
  );
  return pessoas.isEmpty ? 'Conversa privada' : '${pessoas.first['nome']}';
}
