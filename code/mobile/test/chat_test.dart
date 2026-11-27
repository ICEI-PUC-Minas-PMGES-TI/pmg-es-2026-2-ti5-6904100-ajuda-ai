import 'dart:convert';

import 'package:ajuda_ai/services/chat_api.dart';
import 'package:ajuda_ai/tela_chat.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  testWidgets('carrega e envia mensagens pela API autenticada', (tester) async {
    final backend = _ChatBackend();
    final client = MockClient(backend.responder);
    addTearDown(client.close);
    final api = ChatApi(
      client: client,
      accessToken: 'token-aluno',
      baseUrl: 'https://api.teste',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: TelaChat(destinatarioEmail: 'parceiro@pucminas.edu.br', api: api),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Mensagem recebida do banco'), findsOneWidget);
    expect(find.text('Parceria Teste'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('chat-message-input')),
      'Minha mensagem salva',
    );
    await tester.tap(find.byKey(const Key('chat-send')));
    await tester.pumpAndSettle();

    expect(find.text('Minha mensagem salva'), findsOneWidget);
    expect(backend.mensagens, hasLength(2));
    expect(backend.mensagens.last['texto'], 'Minha mensagem salva');
    expect(backend.requisicoes, contains('POST /chats/7/mensagens'));
  });
}

class _ChatBackend {
  final List<Map<String, dynamic>> mensagens = [
    {
      'id': 1,
      'remetenteParticipacaoId': 22,
      'texto': 'Mensagem recebida do banco',
      'estado': 'entregue',
      'criadaEm': '2026-11-27T12:00:00.000Z',
    },
  ];
  final List<String> requisicoes = [];

  Future<http.Response> responder(http.Request request) async {
    expect(request.headers['authorization'], 'Bearer token-aluno');
    requisicoes.add('${request.method} ${request.url.path}');

    if (request.method == 'GET' && request.url.path == '/chats') {
      return _json([
        {
          'id': 7,
          'minhaParticipacaoId': 11,
          'programa': '2026/2',
          'participantes': [
            {
              'participacaoId': 11,
              'nome': 'Aluno',
              'email': 'aluno@pucminas.edu.br',
              'papel': 'apadrinhado',
            },
            {
              'participacaoId': 22,
              'nome': 'Parceria Teste',
              'email': 'parceiro@pucminas.edu.br',
              'papel': 'padrinho',
            },
          ],
        },
      ]);
    }

    if (request.method == 'GET' && request.url.path == '/chats/7/mensagens') {
      return _json({'mensagens': mensagens, 'temMais': false});
    }

    if (request.method == 'POST' && request.url.path == '/chats/7/mensagens') {
      final corpo = jsonDecode(request.body) as Map<String, dynamic>;
      final mensagem = {
        'id': 2,
        'remetenteParticipacaoId': 11,
        'texto': corpo['texto'],
        'estado': 'enviada',
        'criadaEm': '2026-11-27T12:01:00.000Z',
      };
      mensagens.add(mensagem);
      return _json(mensagem);
    }

    return _json({'message': 'Não encontrado'}, status: 404);
  }

  http.Response _json(Object body, {int status = 200}) => http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json'},
  );
}
