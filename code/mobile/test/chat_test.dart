import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ajuda_ai/services/chat_api.dart';
import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/tela_conversas.dart';

http.Response json(Object valor, [int status = 200]) => http.Response(
  jsonEncode(valor),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
Map<String, dynamic> conversa({
  bool pode = true,
  String nome = 'Grupo de Ana',
}) => {
  'id': 7,
  'tipo': 'coletivo',
  'titulo': nome,
  'programa': '2026/2',
  'podeEnviar': pode,
  'minhaParticipacaoId': 100,
  'minhasParticipacoesIds': [100],
  'participantes': [],
  'naoLidas': 1,
};
Map<String, dynamic> mensagem(int id, String texto) => {
  'id': id,
  'chatId': 7,
  'remetenteParticipacaoId': 1,
  'remetenteNome': 'Ana',
  'texto': texto,
  'estado': 'enviada',
  'criadaEm': '2026-11-24T12:00:00Z',
};

class StreamChat extends http.BaseClient {
  final controller = StreamController<List<int>>();
  bool fechou = false;
  void evento(String tipo, [Map<String, dynamic> dados = const {}]) {
    if (!fechou) {
      controller.add(
        utf8.encode('event: $tipo\ndata: ${jsonEncode(dados)}\n\n'),
      );
    }
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    evento('chat.ready', {'revisao': 1});
    return http.StreamedResponse(controller.stream, 200);
  }

  @override
  void close() {
    fechou = true;
    unawaited(controller.close());
  }
}

void main() {
  testWidgets(
    '500 mensagens carregadas: evento busca apenas a nova e atualiza recibos antigos separadamente',
    (tester) async {
      final stream = StreamChat();
      final consultas = <Uri>[];
      final consultasRecibos = <Uri>[];
      var nova = false;
      var primeiro = true;
      final api = ChatApi(
        token: () => 'jwt',
        baseUrl: '',
        streamClientFactory: () => stream,
        client: MockClient((r) async {
          if (r.url.path == '/chats') {
            return json([conversa()]);
          }
          if (r.url.path.endsWith('/recibos')) {
            consultasRecibos.add(r.url);
            return json({'recibos': [], 'recibosRevisao': nova ? 2 : 1});
          }
          consultas.add(r.url);
          if (primeiro) {
            primeiro = false;
            return json({
              ...conversa(),
              'mensagens': List.generate(
                500,
                (i) => mensagem(i + 1, 'Mensagem ${i + 1}'),
              ),
              'temMais': false,
            });
          }
          final cursor =
              int.tryParse(r.url.queryParameters['depoisDe'] ?? '') ?? 0;
          return json({
            ...conversa(),
            'mensagens': cursor == 500 && nova
                ? [mensagem(501, 'Única nova')]
                : [],
            'temMais': false,
          });
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: TelaConversaChat(api: api, chat: conversa()),
        ),
      );
      await tester.pumpAndSettle();
      consultas.clear();
      consultasRecibos.clear();
      nova = true;
      stream.evento('chat.changed', {'revisao': 2});
      await tester.pumpAndSettle();
      expect(consultas.length, 1);
      expect(consultasRecibos.length, 1);
      expect(consultasRecibos.single.queryParameters['depoisDaRevisao'], '1');
      expect(consultasRecibos.single.queryParameters['ateMensagemId'], '501');
      expect(consultas.single.queryParameters['depoisDe'], '500');
      await tester.pumpWidget(const SizedBox.shrink());
      api.fechar();
    },
  );

  for (final coletivo in [true, false]) {
    testWidgets(
      'atalho por ${coletivo ? 'grupo' : 'vínculo'} abre o ID correto sem escolher a primeira conversa',
      (tester) async {
        final pedidos = <String>[];
        final stream = StreamChat();
        final api = ChatApi(
          token: () => 'jwt',
          baseUrl: '',
          streamClientFactory: () => stream,
          client: MockClient((r) async {
            pedidos.add(r.url.path);
            if (r.url.path == '/chats') {
              return json([
                {...conversa(), 'id': 7, 'grupoId': 41},
                {
                  ...conversa(pode: coletivo),
                  'id': 9,
                  'tipo': coletivo ? 'coletivo' : 'privado',
                  'grupoId': 42,
                  'matchingVinculoId': 22,
                },
              ]);
            }
            return json({
              ...conversa(pode: coletivo),
              'id': 9,
              'mensagens': [],
              'temMais': false,
            });
          }),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: TelaConversas(
              api: api,
              programa: '2026/2',
              focoGrupo: coletivo ? 42 : null,
              focoVinculo: coletivo ? null : 22,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(pedidos, contains('/chats/9/mensagens'));
        expect(pedidos, isNot(contains('/chats/7/mensagens')));
        await tester.pumpWidget(const SizedBox.shrink());
        api.fechar();
      },
    );
  }
  test(
    'API autentica requisições e mantém o UUID na repetição de envio',
    () async {
      final pedidos = <http.Request>[];
      final api = ChatApi(
        token: () => 'jwt',
        baseUrl: '',
        client: MockClient((p) async {
          pedidos.add(p);
          return json(p.url.path == '/chats' ? [] : <String, dynamic>{});
        }),
      );
      await api.listar('2026/2');
      await api.mensagens(7, depoisDe: 0);
      final id = novoIdMensagemChat();
      await api.enviar(7, 'Olá', id);
      await api.enviar(7, 'Olá', id);
      expect(
        pedidos.every((p) => p.headers['authorization'] == 'Bearer jwt'),
        isTrue,
      );
      expect(pedidos[0].url.queryParameters['programa'], '2026/2');
      expect(pedidos[1].url.queryParameters['depoisDe'], '0');
      expect(pedidos[2].body, pedidos[3].body);
      expect(jsonDecode(pedidos[2].body), {'texto': 'Olá', 'clientId': id});
      expect(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(id),
        isTrue,
      );
    },
  );
  test(
    'ausência de token impede HTTP antes de acessar dados de outra conta',
    () async {
      var chamadas = 0;
      final api = ChatApi(
        token: () => null,
        baseUrl: '',
        client: MockClient((_) async {
          chamadas++;
          return json([]);
        }),
      );
      await expectLater(api.listar('2026/2'), throwsA(isA<ApiException>()));
      expect(chamadas, 0);
    },
  );
  test(
    'parser de eventos suporta UTF-8 e CRLF divididos entre chunks',
    () async {
      final corpo = utf8.encode(
        'event: chat.changed\r\ndata: {"aviso":"Conexão"}\r\n\r\n',
      );
      final partes = Stream<List<int>>.fromIterable([
        for (final b in corpo) [b],
      ]);
      final client = _SseFinito(partes);
      final api = ChatApi(
        token: () => 'jwt',
        baseUrl: '',
        streamClientFactory: () => client,
      );
      final eventos = await api.observar(7).toList();
      expect(eventos, [
        {
          'tipo': 'chat.changed',
          'dados': {'aviso': 'Conexão'},
        },
      ]);
      expect(client.fechou, isTrue);
      api.fechar();
    },
  );
  test('mescla sem duplicar ID e sem regredir uma leitura confirmada', () {
    final m = mesclarMensagensChat(
      [
        {'id': 2, 'texto': 'Olá', 'estado': 'lida'},
      ],
      [
        {'id': 1, 'texto': 'Antes', 'estado': 'enviada'},
        {'id': 2, 'texto': 'Olá', 'estado': 'enviada'},
      ],
    );
    expect(m.map((m) => m['id']), [1, 2]);
    expect(m.last['estado'], 'lida');
  });
  testWidgets('lista mostra privado, coletivo e histórico de um ciclo', (
    tester,
  ) async {
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient(
        (_) async => json([
          conversa(),
          {...conversa(pode: false, nome: 'Histórico antigo'), 'id': 8},
          {
            ...conversa(),
            'id': 9,
            'tipo': 'privado',
            'participantes': [
              {'participacaoId': 1, 'nome': 'Padrinho João'},
            ],
          },
        ]),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaConversas(api: api, programa: '2026/2'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Grupo de Ana'), findsOneWidget);
    expect(find.text('Histórico antigo'), findsOneWidget);
    expect(find.text('Padrinho João'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('conversa recebe evento e busca mensagens reais sem duplicação', (
    tester,
  ) async {
    final stream = StreamChat();
    var nova = false;
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient(
        (_) async => json({
          'mensagens': [
            mensagem(1, 'Primeira'),
            if (nova) mensagem(2, 'Nova mensagem'),
          ],
          'temMais': false,
          ...conversa(),
        }),
      ),
      streamClientFactory: () => stream,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaConversaChat(api: api, chat: conversa()),
      ),
    );
    await tester.pumpAndSettle();
    nova = true;
    stream.evento('chat.changed', {'revisao': 2});
    await tester.pumpAndSettle();
    expect(find.text('Nova mensagem'), findsOneWidget);
    expect(find.text('Primeira'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(stream.fechou, isTrue);
  });
  testWidgets(
    'envio incerto repete a intenção original e mantém o campo bloqueado',
    (tester) async {
      final stream = StreamChat();
      final corpos = <String>[];
      final api = ChatApi(
        token: () => 'jwt',
        baseUrl: '',
        client: MockClient((p) async {
          if (p.method == 'POST') {
            corpos.add(p.body);
            return corpos.length == 1
                ? json({'message': 'Resultado indisponível'}, 500)
                : json({...mensagem(2, 'Olá'), 'remetenteParticipacaoId': 100});
          }
          return json({'mensagens': [], 'temMais': false, ...conversa()});
        }),
        streamClientFactory: () => stream,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: TelaConversaChat(api: api, chat: conversa()),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Olá');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Enviar mensagem'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
      expect(find.text('Resultado indisponível'), findsOneWidget);
      await tester.tap(find.byTooltip('Tentar enviar novamente'));
      await tester.pumpAndSettle();
      expect(corpos, hasLength(2));
      expect(corpos[0], corpos[1]);
      expect(find.text('Olá'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('histórico permanece visível com envio desabilitado', (
    tester,
  ) async {
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient(
        (_) async => json({
          'mensagens': [mensagem(1, 'Do seu período')],
          'temMais': false,
          ...conversa(pode: false),
          'motivoBloqueio': 'O ciclo foi encerrado.',
        }),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaConversaChat(api: api, chat: conversa(pode: false)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Do seu período'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('troca de conta limpa a conversa e ignora resposta atrasada', (
    tester,
  ) async {
    final stream = StreamChat(), mudancas = ChangeNotifier();
    var valida = true;
    final resposta = Completer<http.Response>();
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient((_) => resposta.future),
      streamClientFactory: () => stream,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaConversaChat(
          api: api,
          chat: conversa(),
          mudancasSessao: mudancas,
          escopoValido: () => valida,
        ),
      ),
    );
    await tester.pump();
    await tester.enterText(
      find.byType(TextField),
      'Rascunho da conta anterior',
    );
    valida = false;
    mudancas.notifyListeners();
    resposta.complete(
      json({
        'mensagens': [mensagem(1, 'Mensagem da conta anterior')],
        ...conversa(),
        'temMais': false,
      }),
    );
    await tester.pumpAndSettle();
    expect(find.text('Mensagem da conta anterior'), findsNothing);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      isEmpty,
    );
    expect(find.text('Grupo de Ana'), findsNothing);
    expect(find.textContaining('conta ou o ciclo mudou'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    mudancas.dispose();
  });
  testWidgets('resposta de outro ciclo não substitui a lista atual', (
    tester,
  ) async {
    final antiga = Completer<http.Response>();
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient(
        (p) => p.url.queryParameters['programa'] == '2026/2'
            ? antiga.future
            : Future.value(json([conversa(nome: 'Ciclo atual')])),
      ),
    );
    Widget tela(String ciclo) => MaterialApp(
      home: TelaConversas(
        key: const ValueKey('lista'),
        api: api,
        programa: ciclo,
      ),
    );
    await tester.pumpWidget(tela('2026/2'));
    await tester.pump();
    await tester.pumpWidget(tela('2027/1'));
    await tester.pumpAndSettle();
    antiga.complete(json([conversa(nome: 'Ciclo anterior')]));
    await tester.pumpAndSettle();
    expect(find.text('Ciclo atual'), findsOneWidget);
    expect(find.text('Ciclo anterior'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('revogação recebida em conexão aberta remove dados da tela', (
    tester,
  ) async {
    final stream = StreamChat();
    var revogado = false;
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient(
        (_) async => revogado
            ? json({'message': 'Conversa não encontrada'}, 404)
            : json({
                'mensagens': [mensagem(1, 'Acesso anterior')],
                ...conversa(),
                'temMais': false,
              }),
      ),
      streamClientFactory: () => stream,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaConversaChat(api: api, chat: conversa()),
      ),
    );
    await tester.pumpAndSettle();
    revogado = true;
    stream.evento('chat.access', {'revogado': true});
    await tester.pumpAndSettle();
    expect(find.text('Acesso anterior'), findsNothing);
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'reconexão continua tentando após falha de rede e recupera mensagens',
    (tester) async {
      final streams = <StreamChat>[];
      var offline = false, recuperada = false;
      final consultas = <String>[];
      final api = ChatApi(
        token: () => 'jwt',
        baseUrl: '',
        client: MockClient((_) async {
          consultas.add('${tester.binding.clock.now()} offline=$offline');
          if (offline) throw http.ClientException('Sem rede');
          return json({
            'mensagens': [
              mensagem(1, 'Antes'),
              if (recuperada) mensagem(2, 'Recuperada após reconexão'),
            ],
            'temMais': false,
            ...conversa(),
          });
        }),
        streamClientFactory: () {
          final stream = StreamChat();
          streams.add(stream);
          return stream;
        },
      );
      await tester.pumpWidget(
        MaterialApp(
          home: TelaConversaChat(api: api, chat: conversa()),
        ),
      );
      await tester.pumpAndSettle();
      offline = true;
      unawaited(streams.first.controller.close());
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
      offline = false;
      recuperada = true;
      await tester.pump(const Duration(seconds: 7));
      await tester.pumpAndSettle();
      expect(
        find.text('Recuperada após reconexão'),
        findsOneWidget,
        reason:
            'consultas=$consultas streams=${streams.length} estado=${streams.map((s) => 'fechou=${s.fechou},closed=${s.controller.isClosed},listener=${s.controller.hasListener},paused=${s.controller.isPaused}').toList()} textos=${tester.widgetList<Text>(find.byType(Text)).map((t) => t.data).toList()}',
      );
      expect(streams.length, greaterThan(1));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      expect(streams.every((s) => s.fechou), isTrue);
    },
  );
  testWidgets('pausa fecha conexão e retomada recupera a conversa', (
    tester,
  ) async {
    final streams = <StreamChat>[];
    final api = ChatApi(
      token: () => 'jwt',
      baseUrl: '',
      client: MockClient(
        (_) async => json({'mensagens': [], 'temMais': false, ...conversa()}),
      ),
      streamClientFactory: () {
        final s = StreamChat();
        streams.add(s);
        return s;
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaConversaChat(api: api, chat: conversa()),
      ),
    );
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pumpAndSettle();
    expect(streams.first.fechou, isTrue);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(streams.length, greaterThan(1));
    expect(streams.last.fechou, isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

class _SseFinito extends http.BaseClient {
  _SseFinito(this.stream);
  final Stream<List<int>> stream;
  bool fechou = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async =>
      http.StreamedResponse(stream, 200);
  @override
  void close() {
    fechou = true;
  }
}
