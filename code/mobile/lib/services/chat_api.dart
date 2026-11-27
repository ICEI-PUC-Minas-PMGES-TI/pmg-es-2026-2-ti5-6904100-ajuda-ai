import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api_config.dart';

class ChatParticipante {
  const ChatParticipante({
    required this.participacaoId,
    required this.nome,
    required this.email,
    required this.papel,
  });

  final int participacaoId;
  final String nome;
  final String email;
  final String papel;

  factory ChatParticipante.fromJson(Map<String, dynamic> json) {
    final id = json['participacaoId'];
    if (id is! num) throw const ApiException('Participante de chat inválido.');
    return ChatParticipante(
      participacaoId: id.toInt(),
      nome: json['nome'] as String? ?? '',
      email: json['email'] as String? ?? '',
      papel: json['papel'] as String? ?? '',
    );
  }
}

class ConversaChat {
  const ConversaChat({
    required this.id,
    required this.minhaParticipacaoId,
    required this.programa,
    required this.participantes,
  });

  final int id;
  final int minhaParticipacaoId;
  final String programa;
  final List<ChatParticipante> participantes;

  ChatParticipante? get outraPessoa {
    for (final participante in participantes) {
      if (participante.participacaoId != minhaParticipacaoId) {
        return participante;
      }
    }
    return null;
  }

  factory ConversaChat.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final minhaParticipacaoId = json['minhaParticipacaoId'];
    final participantes = json['participantes'];
    if (id is! num || minhaParticipacaoId is! num || participantes is! List) {
      throw const ApiException('Conversa recebida da API é inválida.');
    }
    return ConversaChat(
      id: id.toInt(),
      minhaParticipacaoId: minhaParticipacaoId.toInt(),
      programa: json['programa'] as String? ?? '',
      participantes: participantes
          .whereType<Map>()
          .map(
            (item) =>
                ChatParticipante.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}

class MensagemChat {
  const MensagemChat({
    required this.id,
    required this.remetenteParticipacaoId,
    required this.texto,
    required this.estado,
    this.imagemUrl,
    this.criadaEm,
  });

  final int id;
  final int remetenteParticipacaoId;
  final String texto;
  final String estado;
  final String? imagemUrl;
  final DateTime? criadaEm;

  factory MensagemChat.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final remetenteId = json['remetenteParticipacaoId'];
    if (id is! num || remetenteId is! num) {
      throw const ApiException('Mensagem recebida da API é inválida.');
    }
    return MensagemChat(
      id: id.toInt(),
      remetenteParticipacaoId: remetenteId.toInt(),
      texto: json['texto'] as String? ?? '',
      estado: json['estado'] as String? ?? '',
      imagemUrl: json['imagemUrl'] as String?,
      criadaEm: DateTime.tryParse('${json['criadaEm'] ?? ''}'),
    );
  }
}

class PaginaMensagensChat {
  const PaginaMensagensChat({required this.mensagens, required this.temMais});

  final List<MensagemChat> mensagens;
  final bool temMais;

  factory PaginaMensagensChat.fromJson(Map<String, dynamic> json) {
    final mensagens = json['mensagens'];
    if (mensagens is! List) {
      throw const ApiException('Lista de mensagens recebida é inválida.');
    }
    return PaginaMensagensChat(
      mensagens: mensagens
          .whereType<Map>()
          .map((item) => MensagemChat.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
      temMais: json['temMais'] == true,
    );
  }
}

class ChatApi {
  ChatApi({
    http.Client? client,
    required this.accessToken,
    this.baseUrl = apiBaseUrl,
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String? accessToken;
  final String baseUrl;

  Uri _uri(String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return Uri.parse('$base$path');
  }

  Map<String, String> _headers({bool json = false}) {
    final token = accessToken?.trim();
    if (token == null || token.isEmpty) {
      throw const ApiException('Entre na sua conta para acessar as conversas.');
    }
    return {
      'accept': 'application/json',
      if (json) 'content-type': 'application/json',
      'authorization': 'Bearer $token',
    };
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final headers = _headers(json: body != null);
    final resposta = await executarRequisicao(
      () => method == 'GET'
          ? _client.get(_uri(path), headers: headers)
          : _client.post(_uri(path), headers: headers, body: jsonEncode(body)),
      erroPadrao: 'Não foi possível carregar/salvar a conversa',
    );
    return decodificarJson(resposta);
  }

  Future<List<ConversaChat>> listar() async {
    final resposta = await _request('GET', '/chats');
    if (resposta is! List) {
      throw const ApiException('Lista de conversas recebida é inválida.');
    }
    return resposta
        .whereType<Map>()
        .map((item) => ConversaChat.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<PaginaMensagensChat> listarMensagens(int chatId) async {
    final resposta = await _request('GET', '/chats/$chatId/mensagens');
    if (resposta is! Map) {
      throw const ApiException('Resposta de mensagens recebida é inválida.');
    }
    return PaginaMensagensChat.fromJson(Map<String, dynamic>.from(resposta));
  }

  Future<MensagemChat> enviarMensagem(int chatId, String texto) async {
    final resposta = await _request(
      'POST',
      '/chats/$chatId/mensagens',
      body: {'texto': texto},
    );
    if (resposta is! Map) {
      throw const ApiException('Resposta do envio da mensagem é inválida.');
    }
    return MensagemChat.fromJson(Map<String, dynamic>.from(resposta));
  }
}
