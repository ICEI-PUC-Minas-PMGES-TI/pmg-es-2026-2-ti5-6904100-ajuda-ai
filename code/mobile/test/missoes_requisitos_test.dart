import 'dart:convert';

import 'package:ajuda_ai/models/missao.dart';
import 'package:ajuda_ai/services/missoes_api.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_missoes.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:ajuda_ai/widgets/confete_celebracao.dart';
import 'package:ajuda_ai/widgets/navegacao_app.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'missoes_test.dart' show conclusao, resposta, telaAlta;

const _token =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMiIsImVtYWlsIjoiY2FtaWxhQHB1Y21pbmFzLmVkdS5iciJ9.assinatura';

Map<String, dynamic> missaoReal(
  String id, {
  required String titulo,
  required String descricao,
  required String requisito,
  String tipo = 'UNICA',
  int xp = 30,
  int? atual,
  int? meta,
  bool pronta = false,
  Map<String, dynamic>? alvo,
}) => {
  'id': id,
  'titulo': titulo,
  'descricao': descricao,
  'tipo': tipo,
  'requisito': requisito,
  'xp': xp,
  'moedas': xp,
  'fim': null,
  'status': 'disponivel',
  'xpPrevisto': xp,
  'progresso': meta == null ? null : {'atual': atual ?? 0, 'meta': meta},
  'pronta': pronta,
  'alvo': alvo,
  'conclusao': null,
};

final _abertura = DateTime.now().subtract(const Duration(hours: 1));
final _eventoAgora = {
  'tipo': 'evento',
  'id': '6a8b8519-9f30-4fc2-8ac5-428f115deb13',
  'nome': 'Abertura da Semana do Calouro',
  'checkinAbre': _abertura
      .subtract(const Duration(minutes: 30))
      .toUtc()
      .toIso8601String(),
  'inicio': _abertura.toUtc().toIso8601String(),
  'fim': _abertura.add(const Duration(hours: 3)).toUtc().toIso8601String(),
  'latitude': -19.9228,
  'longitude': -43.9935,
  'local': 'Prédio 30',
};

final _oficinaAmanha = () {
  final inicio = DateTime(2030, 3, 14, 19, 0);
  return {
    ..._eventoAgora,
    'id': '00993fa8-a486-463d-b9f0-ad10054ca2b2',
    'nome': 'Oficina de currículo e LinkedIn',
    'checkinAbre': inicio
        .subtract(const Duration(minutes: 30))
        .toUtc()
        .toIso8601String(),
    'inicio': inicio.toUtc().toIso8601String(),
    'fim': inicio.add(const Duration(hours: 2)).toUtc().toIso8601String(),
    'local': 'Prédio 34',
  };
}();

class ServidorMissoes {
  ServidorMissoes(this.missoes);

  List<Map<String, dynamic>> missoes;
  final pedidos = <(String id, Map<String, dynamic> corpo)>[];
  int listagens = 0;

  (int, Map<String, dynamic>)? recusa;

  MockClient get client => MockClient((request) async {
    if (request.headers['authorization'] != 'Bearer $_token') {
      return resposta('{"message":"Token inválido."}', 401);
    }
    if (request.method == 'GET' && request.url.path == '/me/missoes') {
      listagens++;
      return resposta(
        jsonEncode({
          'ciclo': '2026/2',
          'semana': '2026-11-23',
          'limites': {
            'ciclo': {'ganho': 230, 'limite': 1500},
            'semanal': {'ganho': 20, 'limite': 60},
          },
          'missoes': missoes,
        }),
        200,
      );
    }
    final achado = RegExp(r'^/me/missoes/([^/]+)/concluir$')
        .firstMatch(request.url.path);
    if (request.method == 'POST' && achado != null) {
      final id = achado.group(1)!;
      expect(request.headers['content-type'], startsWith('application/json'));
      pedidos.add((id, jsonDecode(request.body) as Map<String, dynamic>));
      final r = recusa;
      if (r != null) {
        recusa = null;
        return resposta(jsonEncode({'statusCode': r.$1, ...r.$2}), r.$1);
      }
      final xp = missoes.firstWhere((m) => m['id'] == id)['xp'] as int;
      missoes = [
        for (final m in missoes)
          m['id'] == id
              ? {
                  ...m,
                  'status': 'concluida',
                  'pronta': false,
                  'conclusao': {
                    'id': '9d1c7f4e-2b3a-4c5d-8e6f-7a8b9c0d1e2f',
                    'xp': xp,
                    'moedas': xp,
                    'limitado': false,
                    'concluidaEm': DateTime.now().toUtc().toIso8601String(),
                  },
                }
              : m,
      ];
      return resposta(
        jsonEncode({...conclusao(xp: xp, xpConfigurado: xp), 'missaoId': id}),
        201,
      );
    }
    return resposta('{}', 404);
  });
}

class GpsFalso implements CampusLocationService {
  GpsFalso(this.resultado);

  CampusLocationResult resultado;
  int leituras = 0;

  @override
  Future<CampusLocationResult> locate() async {
    leituras++;
    return resultado;
  }

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;
}

const _noTeatro = CampusLocationResult(
  CampusLocationStatus.located,
  location: CampusUserLocation(
    latitude: -19.92281,
    longitude: -43.99352,
    accuracy: 9,
  ),
);

Future<ServidorMissoes> abrirTela(
  WidgetTester tester,
  List<Map<String, dynamic>> missoes, {
  GpsFalso? gps,
}) async {
  telaAlta(tester);
  final servidor = ServidorMissoes(missoes);
  SessaoUsuario.atual.configurarApi(
    ParticipacoesApi(client: servidor.client)..accessToken = _token,
  );
  await tester.pumpWidget(
    MaterialApp(
      home: MissoesPage(
        api: MissoesApi(client: servidor.client, baseUrl: ''),
        localizacao: gps ?? GpsFalso(_noTeatro),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return servidor;
}

Future<void> abrirDetalhe(WidgetTester tester, String id) async {
  await tester.tap(find.byKey(Key('missao-$id')));
  await tester.pumpAndSettle();
  expect(find.byKey(const Key('detalhe-missao')), findsOneWidget);
}

String textoDoBotao(WidgetTester tester) {
  final botao = find.byKey(const Key('detalhe-concluir'));
  return tester
      .widget<Text>(find.descendant(of: botao, matching: find.byType(Text)))
      .data!;
}

bool botaoAtivo(WidgetTester tester) => tester
    .widget<FilledButton>(
      find.descendant(
        of: find.byKey(const Key('detalhe-concluir')),
        matching: find.byType(FilledButton),
      ),
    )
    .enabled;

class Caso {
  const Caso(
    this.categoria,
    this.json, {
    required this.comoConcluir,
    this.atalho,
    this.progresso,
  });

  final String categoria;
  final Map<String, dynamic> json;
  final String comoConcluir;
  final String? atalho;
  final String? progresso;
}

final casosPendentes = [
  Caso(
    'totem',
    missaoReal(
      'totem',
      titulo: 'Visite 3 totens do campus',
      descricao: 'Encontre e colete três PucStops diferentes pelo mapa.',
      requisito: 'PUCSTOPS',
      xp: 80,
      atual: 1,
      meta: 3,
    ),
    comoConcluir: 'Colete 3 PucStops diferentes no mapa.',
    atalho: 'Abrir mapa',
    progresso: '1/3',
  ),
  Caso(
    'campus',
    missaoReal(
      'campus',
      titulo: 'Ache o Prédio 34 pelo mapa do app',
      descricao: 'Use a rota do app e colete o PucStop do ICEI.',
      requisito: 'PUCSTOPS',
      xp: 25,
      atual: 0,
      meta: 1,
      alvo: {
        'tipo': 'pucstop',
        'id': 'a593faa9-34b4-495d-9e55-890830f43f17',
        'nome': 'Biblioteca ICEI',
        'latitude': -19.9236,
        'longitude': -43.9925,
      },
    ),
    comoConcluir: 'Colete o PucStop Biblioteca ICEI no mapa.',
    atalho: 'Abrir mapa',
    progresso: '0/1',
  ),
  Caso(
    'conversa',
    missaoReal(
      'conversa',
      titulo: 'Ajude um calouro',
      descricao: 'Tire a dúvida de um calouro no feed.',
      requisito: 'FEED_COMENTARIOS',
      tipo: 'SEMANAL',
      xp: 20,
      atual: 0,
      meta: 2,
    ),
    comoConcluir:
        'Comente 2 vezes em posts do feed (pelo menos 10 caracteres).',
    atalho: 'Ir para o feed',
    progresso: '0/2',
  ),
  Caso(
    'perfil',
    missaoReal(
      'perfil',
      titulo: 'Curta 3 fotos de colegas',
      descricao: 'Veja o que o pessoal do programa anda postando no feed.',
      requisito: 'FEED_CURTIDAS',
      xp: 15,
      atual: 2,
      meta: 3,
    ),
    comoConcluir: 'Curta 3 posts de colegas no feed.',
    atalho: 'Ir para o feed',
    progresso: '2/3',
  ),
  Caso(
    'publicacao',
    missaoReal(
      'publicacao',
      titulo: 'Publique uma dica para os calouros',
      descricao: 'Compartilhe algo que você queria ter sabido no 1º período.',
      requisito: 'FEED_PUBLICACOES',
      xp: 30,
      atual: 0,
      meta: 1,
    ),
    comoConcluir: 'Faça 1 publicação no feed.',
    atalho: 'Ir para o feed',
    progresso: '0/1',
  ),
  Caso(
    'semanal',
    missaoReal(
      'semanal',
      titulo: 'Combine o encontro da semana com seu padrinho',
      descricao: 'Troque mensagens com seu padrinho ou madrinha.',
      requisito: 'CHAT_MENSAGENS',
      tipo: 'SEMANAL',
      xp: 20,
      atual: 1,
      meta: 3,
    ),
    comoConcluir: 'Envie 3 mensagens para sua dupla no chat.',
    progresso: '1/3',
  ),
];

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  group('ainda falta fazer: o detalhe explica, mostra o progresso e trava', () {
    for (final caso in casosPendentes) {
      testWidgets(caso.categoria, (tester) async {
        final servidor = await abrirTela(tester, [caso.json]);
        await abrirDetalhe(tester, caso.categoria);
        expect(find.text(caso.comoConcluir), findsOneWidget);
        expect(find.text(caso.progresso!), findsOneWidget);
        final faltam =
            (caso.json['progresso'] as Map)['meta'] -
            (caso.json['progresso'] as Map)['atual'];
        expect(
          textoDoBotao(tester),
          'Falta${faltam == 1 ? '' : 'm'} $faltam para resgatar',
        );
        expect(botaoAtivo(tester), isFalse);
        if (caso.atalho == null) {
          expect(find.byKey(const Key('detalhe-atalho')), findsNothing);
        } else {
          expect(
            find.descendant(
              of: find.byKey(const Key('detalhe-atalho')),
              matching: find.text(caso.atalho!),
            ),
            findsOneWidget,
          );
        }
        await tester.tap(find.byKey(const Key('detalhe-concluir')));
        await tester.pumpAndSettle();
        expect(servidor.pedidos, isEmpty);
      });
    }
  });

  group('pronta: o resgate manda só a prova que o requisito pede', () {
    for (final (nome, json, corpoEsperado, botao) in [
      (
        'totem',
        missaoReal(
          'totem',
          titulo: 'Visite 3 totens do campus',
          descricao: 'Encontre e colete três PucStops diferentes pelo mapa.',
          requisito: 'PUCSTOPS',
          xp: 80,
          atual: 3,
          meta: 3,
          pronta: true,
        ),
        <String, dynamic>{},
        'Resgatar recompensa',
      ),
      (
        'conversa',
        missaoReal(
          'conversa',
          titulo: 'Ajude um calouro',
          descricao: 'Tire a dúvida de um calouro no feed.',
          requisito: 'FEED_COMENTARIOS',
          tipo: 'SEMANAL',
          xp: 20,
          atual: 2,
          meta: 2,
          pronta: true,
        ),
        <String, dynamic>{},
        'Resgatar recompensa',
      ),
      (
        'evento',
        missaoReal(
          'evento',
          titulo: 'Participe da Semana do Calouro',
          descricao: 'Faça o check-in na abertura, no Prédio 30.',
          requisito: 'EVENTO',
          xp: 60,
          pronta: true,
          alvo: _eventoAgora,
        ),
        <String, dynamic>{
          'latitude': -19.92281,
          'longitude': -43.99352,
          'accuracy': 9.0,
          'codigo': 'CALOURO26',
        },
        'Fazer check-in e resgatar',
      ),
    ]) {
      testWidgets(nome, (tester) async {
        final servidor = await abrirTela(tester, [json]);
        final listagens = servidor.listagens;
        await abrirDetalhe(tester, nome);
        if (nome == 'evento') {
          await tester.enterText(
            find.byKey(const Key('detalhe-codigo')),
            'CALOURO26',
          );
        }
        expect(textoDoBotao(tester), botao);
        expect(botaoAtivo(tester), isTrue);
        expect(find.byKey(const Key('detalhe-atalho')), findsNothing);
        await tester.tap(find.byKey(const Key('detalhe-concluir')));
        await tester.pump(const Duration(milliseconds: 500));

        expect(servidor.pedidos, hasLength(1));
        expect(servidor.pedidos.single.$1, nome);
        expect(servidor.pedidos.single.$2, corpoEsperado);
        expect(find.byType(ConfeteCelebracao), findsOneWidget);
        expect(find.text('Missão concluída!'), findsNothing);
        expect(SessaoUsuario.atual.xp.value, 400);
        expect(find.text('Continuar'), findsNothing);
        await tester.pump(const Duration(seconds: 2));
        await tester.pumpAndSettle();
        expect(find.byType(ConfeteCelebracao), findsNothing);
        expect(servidor.listagens, listagens + 1);
        await tester.tap(find.byKey(const Key('filtro-concluidas')));
        await tester.pumpAndSettle();
        expect(find.byKey(Key('missao-concluida-$nome')), findsOneWidget);
      });
    }
  });

  group('código da atividade', () {
    Map<String, dynamic> missaoCodigo() => missaoReal(
      'estudo',
      titulo: 'Estude em grupo',
      descricao: 'Reserve uma sala da biblioteca e peça o código ao monitor.',
      requisito: 'CODIGO',
      tipo: 'SEMANAL',
      xp: 30,
      pronta: true,
    );

    testWidgets('vazio não chama a API; digitado vai como o aluno digitou', (
      tester,
    ) async {
      final servidor = await abrirTela(tester, [missaoCodigo()]);
      await abrirDetalhe(tester, 'estudo');
      expect(
        find.text('Digite o código mostrado na atividade pela coordenação.'),
        findsOneWidget,
      );
      expect(textoDoBotao(tester), 'Validar código e resgatar');
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(servidor.pedidos, isEmpty);
      expect(find.text('Digite o código da atividade.'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('detalhe-codigo')),
        ' estudo-grupo ',
      );
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pump(const Duration(milliseconds: 500));
      expect(servidor.pedidos.single.$2, {'codigo': 'estudo-grupo'});
      expect(find.byType(ConfeteCelebracao), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.byType(ConfeteCelebracao), findsNothing);
    });

    testWidgets('código errado: o detalhe fica aberto com a mensagem da API', (
      tester,
    ) async {
      final servidor = await abrirTela(tester, [missaoCodigo()]);
      servidor.recusa = (
        422,
        {
          'message': 'Código incorreto. Confira com a coordenação.',
          'motivo': 'codigo-incorreto',
        },
      );
      await abrirDetalhe(tester, 'estudo');
      await tester.enterText(find.byKey(const Key('detalhe-codigo')), 'CHUTE');
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(
        find.text('Código incorreto. Confira com a coordenação.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('detalhe-missao')), findsOneWidget);
      expect(find.text('Missão concluída!'), findsNothing);

      await tester.enterText(
        find.byKey(const Key('detalhe-codigo')),
        'ESTUDO-GRUPO',
      );
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pump(const Duration(milliseconds: 500));
      expect(servidor.pedidos, hasLength(2));
      expect(find.byType(ConfeteCelebracao), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(find.byType(ConfeteCelebracao), findsNothing);
    });

    testWidgets('bloqueio por tentativas mostra a mensagem do servidor', (
      tester,
    ) async {
      final servidor = await abrirTela(tester, [missaoCodigo()]);
      servidor.recusa = (
        429,
        {
          'message':
              'Muitas tentativas com código errado. Tente de novo em uma hora.',
          'motivo': 'muitas-tentativas',
        },
      );
      await abrirDetalhe(tester, 'estudo');
      await tester.enterText(
        find.byKey(const Key('detalhe-codigo')),
        'ESTUDO-GRUPO',
      );
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Muitas tentativas com código errado. Tente de novo em uma hora.',
        ),
        findsOneWidget,
      );
    });
  });

  group('check-in de evento', () {
    testWidgets('sem o código do evento não lê o GPS nem chama a API', (
      tester,
    ) async {
      final gps = GpsFalso(_noTeatro);
      final servidor = await abrirTela(tester, [
        missaoReal(
          'evento',
          titulo: 'Participe da Semana do Calouro',
          descricao: 'Faça o check-in na abertura, no Prédio 30.',
          requisito: 'EVENTO',
          xp: 60,
          pronta: true,
          alvo: _eventoAgora,
        ),
      ], gps: gps);
      await abrirDetalhe(tester, 'evento');
      expect(find.byKey(const Key('detalhe-codigo')), findsOneWidget);
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(find.text('Digite o código da atividade.'), findsOneWidget);
      expect(gps.leituras, 0);
      expect(servidor.pedidos, isEmpty);
    });

    Map<String, dynamic> evento({
      required Map<String, dynamic> alvo,
      bool pronta = true,
    }) => missaoReal(
      'evento',
      titulo: 'Participe da Semana do Calouro',
      descricao: 'Faça o check-in na abertura, no Prédio 30.',
      requisito: 'EVENTO',
      xp: 60,
      pronta: pronta,
      alvo: alvo,
    );

    for (final (status, mensagem) in [
      (
        CampusLocationStatus.serviceDisabled,
        'Ligue a localização do celular para fazer o check-in.',
      ),
      (
        CampusLocationStatus.denied,
        'Permita o acesso à localização para fazer o check-in no evento.',
      ),
      (
        CampusLocationStatus.deniedForever,
        'Permita o acesso à localização para fazer o check-in no evento.',
      ),
      (
        CampusLocationStatus.error,
        'Não foi possível obter sua localização. Tente de novo.',
      ),
    ]) {
      testWidgets('GPS ${status.name}: avisa e não chama a API', (
        tester,
      ) async {
        final gps = GpsFalso(CampusLocationResult(status));
        final servidor = await abrirTela(tester, [
          evento(alvo: _eventoAgora),
        ], gps: gps);
        await abrirDetalhe(tester, 'evento');
        expect(
          find.textContaining('Abertura da Semana do Calouro (Prédio 30)'),
          findsOneWidget,
        );
        await tester.enterText(
          find.byKey(const Key('detalhe-codigo')),
          'CALOURO26',
        );
        await tester.tap(find.byKey(const Key('detalhe-concluir')));
        await tester.pumpAndSettle();
        expect(gps.leituras, 1);
        expect(servidor.pedidos, isEmpty);
        expect(find.text(mensagem), findsOneWidget);
      });
    }

    testWidgets('longe do local: a distância vem do servidor', (tester) async {
      final servidor = await abrirTela(tester, [evento(alvo: _eventoAgora)]);
      servidor.recusa = (
        422,
        {
          'message':
              'Você precisa estar no local do evento para fazer o check-in.',
          'motivo': 'fora-do-local',
          'distanciaMetros': 240,
          'raioMetros': 60,
        },
      );
      await abrirDetalhe(tester, 'evento');
      await tester.enterText(
        find.byKey(const Key('detalhe-codigo')),
        'CALOURO26',
      );
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Você precisa estar no local do evento para fazer o check-in.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('antes de abrir o check-in: botão travado com o horário', (
      tester,
    ) async {
      final servidor = await abrirTela(tester, [
        evento(alvo: _oficinaAmanha, pronta: false),
      ]);
      await abrirDetalhe(tester, 'evento');
      final abre = DateTime.parse(_oficinaAmanha['checkinAbre'] as String)
          .toLocal();
      final dd = abre.day.toString().padLeft(2, '0');
      final mm = abre.month.toString().padLeft(2, '0');
      final hh = abre.hour.toString().padLeft(2, '0');
      final mi = abre.minute.toString().padLeft(2, '0');
      expect(textoDoBotao(tester), 'Check-in abre $dd/$mm às $hh:$mi');
      expect(botaoAtivo(tester), isFalse);
      expect(
        find.descendant(
          of: find.byKey(const Key('detalhe-atalho')),
          matching: find.text('Abrir mapa'),
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(servidor.pedidos, isEmpty);
    });

    testWidgets('evento que já acabou: botão diz encerrado', (tester) async {
      final passado = {
        ..._eventoAgora,
        'checkinAbre': DateTime(2020, 1, 1).toUtc().toIso8601String(),
        'inicio': DateTime(2020, 1, 1, 0, 30).toUtc().toIso8601String(),
        'fim': DateTime(2020, 1, 1, 2).toUtc().toIso8601String(),
      };
      await abrirTela(tester, [evento(alvo: passado, pronta: false)]);
      await abrirDetalhe(tester, 'evento');
      expect(textoDoBotao(tester), 'Evento encerrado');
      expect(botaoAtivo(tester), isFalse);
    });
  });

  testWidgets(
    'progresso que ainda falta aparece de novo se o servidor recusar',
    (tester) async {
      final servidor = await abrirTela(tester, [
        missaoReal(
          'conversa',
          titulo: 'Ajude um calouro',
          descricao: 'Tire a dúvida de um calouro no feed.',
          requisito: 'FEED_COMENTARIOS',
          xp: 20,
          atual: 1,
          meta: 1,
          pronta: true,
        ),
      ]);
      servidor.recusa = (
        422,
        {
          'message': 'Comente mais 1 vez no feed.',
          'motivo': 'requisito-pendente',
          'progresso': {'atual': 0, 'meta': 1},
        },
      );
      await abrirDetalhe(tester, 'conversa');
      await tester.tap(find.byKey(const Key('detalhe-concluir')));
      await tester.pumpAndSettle();
      expect(find.text('Comente mais 1 vez no feed.'), findsOneWidget);
      expect(find.text('Missão concluída!'), findsNothing);
    },
  );

  testWidgets('atalho leva para a aba certa do app', (tester) async {
    telaAlta(tester);
    final servidor = ServidorMissoes([casosPendentes.first.json]);
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(client: servidor.client)..accessToken = _token,
    );
    SessaoUsuario.atual.status = StatusParticipacao.apadrinhadoAtivo;
    await tester.pumpWidget(
      MaterialApp(
        home: AppShell(
          inicial: AppDestination.missoes,
          construtorDePagina: (destino) => destino == AppDestination.missoes
              ? MissoesPage(
                  api: MissoesApi(client: servidor.client, baseUrl: ''),
                  localizacao: GpsFalso(_noTeatro),
                )
              : Center(child: Text('pagina-${destino.name}')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await abrirDetalhe(tester, 'totem');
    await tester.tap(find.byKey(const Key('detalhe-atalho')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('detalhe-missao')), findsNothing);
    expect(find.text('pagina-mapa'), findsOneWidget);
  });

  group('modelo', () {
    test('lê requisito, progresso, pronta e alvo', () {
      final m = Missao.fromJson(
        missaoReal(
          'evento',
          titulo: 'Participe da Semana do Calouro',
          descricao: 'Check-in na abertura.',
          requisito: 'EVENTO',
          pronta: true,
          alvo: _eventoAgora,
        ),
      )!;
      expect(m.requisito, RequisitoMissao.evento);
      expect(m.pronta, isTrue);
      expect(m.progresso, isNull);
      expect(m.alvo!.evento, isTrue);
      expect(m.alvo!.local, 'Prédio 30');
      expect(m.alvo!.latitude, closeTo(-19.9228, 1e-6));
    });

    test('valores fora do contrato não quebram nem liberam o resgate', () {
      for (final (requisito, progresso) in [
        ('AUTODECLARADA', {'atual': 1, 'meta': 1}),
        (null, null),
        ('PUCSTOPS', {'atual': 'tres', 'meta': 3}),
        ('PUCSTOPS', {'atual': 5, 'meta': 0}),
      ]) {
        final m = Missao.fromJson({
          'id': '8c1f3a2e-4b5d-4e6f-9a7b-1c2d3e4f5a6b',
          'titulo': 'Visite 3 totens do campus',
          'requisito': requisito,
          'progresso': progresso,
          'pronta': 'sim',
        })!;
        expect(m.pronta, isFalse);
        if (requisito != 'PUCSTOPS') {
          expect(m.requisito, RequisitoMissao.desconhecido);
        }
        if (progresso?['meta'] == 0 || progresso?['atual'] is String) {
          expect(m.progresso, isNull);
        }
      }
      final excedido = ProgressoMissao.fromJson({'atual': 9, 'meta': 3})!;
      expect(excedido.atual, 3);
      expect(excedido.faltam, 0);
      expect(excedido.fracao, 1);
    });

    test('a frase de como concluir cobre cada requisito', () {
      for (final requisito in [
        'PUCSTOPS',
        'EVENTO',
        'FEED_PUBLICACOES',
        'FEED_COMENTARIOS',
        'FEED_CURTIDAS',
        'CHAT_MENSAGENS',
        'CODIGO',
        'NOVO_REQUISITO',
      ]) {
        final m = Missao.fromJson(
          missaoReal(
            'm',
            titulo: 'Missão do ciclo',
            descricao: 'x',
            requisito: requisito,
            meta: 2,
          ),
        )!;
        expect(comoConcluirMissao(m), isNotEmpty, reason: requisito);
      }
    });
  });

  test('cliente manda o corpo certo e sem campos nulos', () async {
    final corpos = <Object?>[];
    final api = MissoesApi(
      baseUrl: '',
      client: MockClient((request) async {
        corpos.add(jsonDecode(request.body));
        return resposta(jsonEncode(conclusao()), 201);
      }),
    );
    await api.concluir(_token, 'a');
    await api.concluir(_token, 'b', codigo: 'CALOURO26');
    await api.concluir(
      _token,
      'c',
      latitude: -19.92,
      longitude: -43.99,
      accuracy: 12,
    );
    expect(corpos, [
      <String, dynamic>{},
      {'codigo': 'CALOURO26'},
      {'latitude': -19.92, 'longitude': -43.99, 'accuracy': 12.0},
    ]);
    expect(api, isA<MissoesApi>());
    expect(http.Client, isNotNull);
  });
}
