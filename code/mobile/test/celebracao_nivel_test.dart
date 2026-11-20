import 'dart:convert';

import 'package:ajuda_ai/models/resumo_gamificacao.dart';
import 'package:ajuda_ai/services/api_config.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/services/pucstops_api.dart';
import 'package:ajuda_ai/services/sons_conquista.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_qa_gamificacao.dart';
import 'package:ajuda_ai/widgets/celebracao_nivel.dart';
import 'package:ajuda_ai/widgets/navegacao_app.dart';
import 'package:ajuda_ai/widgets/progresso_gamificacao.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _niveis = [
  {'numero': 1, 'nome': 'Primeiro passo', 'xpMinimo': 0},
  {'numero': 2, 'nome': 'Curiosidade', 'xpMinimo': 50},
  {'numero': 3, 'nome': 'Exploração', 'xpMinimo': 150},
  {'numero': 4, 'nome': 'Descoberta', 'xpMinimo': 300},
  {'numero': 5, 'nome': 'Conexão', 'xpMinimo': 500},
  {'numero': 6, 'nome': 'Parceria', 'xpMinimo': 750},
  {'numero': 7, 'nome': 'Mentoria', 'xpMinimo': 1050},
  {'numero': 8, 'nome': 'Guia do campus', 'xpMinimo': 1400},
  {'numero': 9, 'nome': 'Referência', 'xpMinimo': 1950},
  {'numero': 10, 'nome': 'Lenda da PUC', 'xpMinimo': 2600},
];

Map<String, dynamic> _resumo({
  required int xp,
  required int nivel,
  String nome = 'Curiosidade',
  Map<String, dynamic>? celebracao,
  bool simulado = false,
}) => {
  'saldo': xp,
  'moedas': xp,
  'xpAcumulado': xp,
  'nivel': {
    'numero': nivel,
    'nome': nome,
    'xpMinimo': 50,
    'proximoXp': 150,
    'proximoNome': 'Exploração',
    'xpNoNivel': xp - 50,
    'xpDoNivel': 100,
    'xpRestante': 150 - xp,
    'progresso': 10,
    'maximo': false,
  },
  'ciclo': '2026/2',
  'celebracao': celebracao,
  'simulado': simulado,
};

http.Response _json(Object corpo, [int status = 200]) => http.Response(
  jsonEncode(corpo),
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

/// Servidor falso: `/me/xp` com celebração até ser confirmada; registra
/// as confirmações. `qa` decide se o painel está liberado.
class _Servidor {
  _Servidor({this.qa = false, this.confirmacaoFalha = false});

  bool qa;
  bool confirmacaoFalha;
  int celebrado = 1;
  int xp = 60;
  final confirmacoes = <int>[];
  final simulacoes = <Uri>[];
  final escritas = <String>[];

  int get nivelReal => xp >= 50 ? 2 : 1;

  late final client = MockClient((r) async {
    if (r.method != 'GET') escritas.add('${r.method} ${r.url.path}');
    if (r.url.path == '/me/xp') {
      return _json(
        _resumo(
          xp: xp,
          nivel: nivelReal,
          celebracao: nivelReal > celebrado
              ? {
                  'de': celebrado,
                  'para': nivelReal,
                  'nome': 'Curiosidade',
                  'niveisAvancados': nivelReal - celebrado,
                }
              : null,
        ),
      );
    }
    if (r.url.path == '/me/xp/celebracoes') {
      if (confirmacaoFalha) throw http.ClientException('sem rede');
      final nivel = (jsonDecode(r.body) as Map)['nivel'] as int;
      confirmacoes.add(nivel);
      celebrado = nivel > celebrado ? nivel.clamp(1, nivelReal) : celebrado;
      return _json({'nivelCelebrado': celebrado});
    }
    if (r.url.path == '/qa/gamificacao/acesso') {
      return qa
          ? _json({'habilitado': true, 'niveis': _niveis})
          : _json({'message': 'Forbidden'}, 403);
    }
    if (r.url.path == '/qa/gamificacao/simulacao') {
      if (!qa) return _json({'message': 'Forbidden'}, 403);
      simulacoes.add(r.url);
      final n = int.parse(r.url.queryParameters['nivel']!);
      final dados = _niveis[n - 1];
      return _json(
        _resumo(
          xp: dados['xpMinimo'] as int,
          nivel: n,
          nome: dados['nome'] as String,
          simulado: true,
        ),
      );
    }
    return _json({'message': 'rota não simulada'}, 404);
  });

  void instalar() {
    SessaoUsuario.atual
      ..assumirSessao(
        accessToken: 'token',
        nome: 'QA Gamificação',
        email: 'camila@pucminas.edu.br',
      )
      ..configurarApi(ParticipacoesApi(client: client)..accessToken = 'token')
      ..configurarXpApi(XpApi(client: client, baseUrl: ''));
  }
}

Widget _app(Widget filho) => MaterialApp(home: filho);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SessaoUsuario.atual.limpar();
    SonsConquista.instancia = SonsConquista.silenciosos();
    SonsConquista.silenciado.value = false;
  });
  tearDown(() => SessaoUsuario.atual.limpar());

  group('partículas', () {
    test('determinísticas e iguais às da web (mesmo gerador com semente)', () {
      final p = gerarParticulas(4);
      expect(p, hasLength(32));
      // Valores de `gerarParticulas(4)` em CelebracaoNivel.jsx.
      expect(p[0].tipo, TipoParticula.estrela);
      expect((p[0].dx, p[0].dy, p[0].tamanho), (0.681, 0.122, 18));
      expect((p[0].rot, p[0].atraso, p[0].duracao), (-644, 88, 1161));
      expect((p[0].escala, p[0].queda), (1.11, 0.33));
      expect(p[0].cor, const Color(0xFFFDE68A));
      expect(p[13].tipo, TipoParticula.faisca);
      expect((p[13].dx, p[13].dy, p[13].tamanho), (-0.412, -0.127, 7));
      expect(p[31].tipo, TipoParticula.confete);
      expect((p[31].dx, p[31].dy, p[31].rot), (0.745, -0.315, -221));
      expect(p[31].cor, const Color(0xFFFBBF24));
      expect(gerarParticulas(5).first.dx, isNot(p.first.dx));
    });
  });

  group('contrato', () {
    test('celebração e simulação no resumo', () {
      final r = ResumoGamificacao.fromJson(
        _resumo(
          xp: 320,
          nivel: 4,
          celebracao: {
            'de': 2,
            'para': 4,
            'nome': 'Descoberta',
            'niveisAvancados': 2,
          },
        ),
      )!;
      expect(r.celebracao!.para, 4);
      expect(r.celebracao!.niveisAvancados, 2);
      expect(r.simulado, isFalse);
      expect(
        ConquistaNivel.fromJson({'de': 3, 'para': 3, 'nome': 'x'}),
        isNull,
      );
      expect(
        ResumoGamificacao.fromJson(_resumo(xp: 60, nivel: 2))!.celebracao,
        isNull,
      );
    });

    test('painel de QA negado vira ApiException 403', () async {
      final servidor = _Servidor();
      final api = XpApi(client: servidor.client, baseUrl: '');
      await expectLater(
        api.qaAcesso('token'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)),
      );
    });

    test('simulação exige a marca `simulado` do servidor', () async {
      final api = XpApi(
        client: MockClient((_) async => _json(_resumo(xp: 60, nivel: 2))),
        baseUrl: '',
      );
      await expectLater(api.qaSimulacao('t', 2), throwsFormatException);
    });
  });

  group('integração com a progressão real', () {
    test('detecta a conquista, confirma uma vez e não repete', () async {
      final servidor = _Servidor()..instalar();
      final sessao = SessaoUsuario.atual;
      await sessao.atualizarXp();
      expect(sessao.conquistaPendente.value?.para, 2);

      await sessao.confirmarConquista(2);
      expect(sessao.conquistaPendente.value, isNull);
      expect(servidor.confirmacoes, [2]);

      // Recarregar não traz a mesma conquista de volta.
      await sessao.atualizarXp();
      expect(sessao.conquistaPendente.value, isNull);
      expect(servidor.confirmacoes, [2]);
      // Nenhuma escrita além da confirmação (nada de XP).
      expect(servidor.escritas, ['POST /me/xp/celebracoes']);
    });

    test(
      'sem rede na confirmação: não reaparece e é reenviada depois',
      () async {
        final servidor = _Servidor(confirmacaoFalha: true)..instalar();
        final sessao = SessaoUsuario.atual;
        await sessao.atualizarXp();
        await sessao.confirmarConquista(2);
        expect(servidor.confirmacoes, isEmpty);

        // O servidor ainda devolve a celebração, mas ela já foi exibida.
        await sessao.atualizarXp();
        expect(sessao.conquistaPendente.value, isNull);

        servidor.confirmacaoFalha = false;
        await sessao.atualizarXp();
        expect(servidor.confirmacoes, [2]);
      },
    );

    test('painel liberado só quando a API autoriza', () async {
      _Servidor().instalar();
      await SessaoUsuario.atual.verificarQaGamificacao();
      expect(SessaoUsuario.atual.qaGamificacao.value, isFalse);

      SessaoUsuario.atual.limpar();
      _Servidor(qa: true).instalar();
      await SessaoUsuario.atual.verificarQaGamificacao();
      expect(SessaoUsuario.atual.qaGamificacao.value, isTrue);
    });

    testWidgets('a casca do app mostra a animação real e confirma', (
      tester,
    ) async {
      final servidor = _Servidor()..instalar();
      await tester.pumpWidget(
        _app(AppShell(construtorDePagina: (d) => Text(d.name))),
      );
      SessaoUsuario.atual.atualizarXp();
      await tester.pump();
      await tester.pump();
      expect(SessaoUsuario.atual.conquistaPendente.value?.para, 2);
      await tester.pump(const Duration(milliseconds: 950));
      await tester.pump(const Duration(milliseconds: 2500));
      expect(find.text(tituloCelebracao), findsOneWidget);
      expect(find.text('Nível 2 · Curiosidade'), findsOneWidget);
      expect(find.text('Pré-visualização · sem XP real'), findsNothing);
      expect(servidor.confirmacoes, [2]);

      await tester.tap(find.byKey(const Key('celebracao-continuar')));
      await tester.pumpAndSettle();
      expect(find.text(tituloCelebracao), findsNothing);
      // Volta para a tela anterior (a casca continua ali).
      expect(find.byType(AppShell), findsOneWidget);
      expect(SessaoUsuario.atual.conquistaPendente.value, isNull);
    });
  });

  group('animação', () {
    Future<void> abrir(
      WidgetTester tester, {
      int numero = 5,
      int saltos = 1,
      bool teste = false,
      bool reduzir = false,
      VoidCallback? onFechar,
    }) async {
      await tester.pumpWidget(
        MediaQuery(
          data: MediaQueryData(
            size: const Size(390, 844),
            disableAnimations: reduzir,
          ),
          child: MaterialApp(
            home: CelebracaoNivel(
              numero: numero,
              nome: 'Conexão',
              niveisAvancados: saltos,
              teste: teste,
              onFechar: onFechar ?? () {},
            ),
          ),
        ),
      );
    }

    testWidgets('sequência completa com o emblema real e sons sincronizados', (
      tester,
    ) async {
      var fechou = 0;
      await abrir(tester, saltos: 3, teste: true, onFechar: () => fechou++);
      final emblema = tester.widget<Image>(
        find
            .descendant(
              of: find.byKey(const Key('celebracao-emblema')),
              matching: find.byType(Image),
            )
            .first,
      );
      expect(
        (emblema.image as AssetImage).assetName,
        'assets/gamificacao/nivel_05.png',
      );

      await tester.pump(const Duration(milliseconds: 700));
      expect(sonsTocadosEmTeste(), [SomConquista.giro]);
      await tester.pump(const Duration(milliseconds: 1000));
      expect(sonsTocadosEmTeste(), [SomConquista.giro, SomConquista.conquista]);
      await tester.pump(const Duration(milliseconds: 2000));
      expect(sonsTocadosEmTeste(), [
        SomConquista.giro,
        SomConquista.conquista,
        SomConquista.brilho,
      ]);
      expect(find.text(tituloCelebracao), findsOneWidget);
      expect(find.text('Nível 5 · Conexão'), findsOneWidget);
      expect(find.text('Você avançou 3 níveis de uma vez.'), findsOneWidget);
      expect(find.text('Pré-visualização · sem XP real'), findsOneWidget);

      await tester.tap(find.byKey(const Key('celebracao-continuar')));
      await tester.pumpAndSettle();
      expect(fechou, 1);
    });

    testWidgets('toque no fundo só fecha depois do início', (tester) async {
      var fechou = 0;
      await abrir(tester, onFechar: () => fechou++);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tapAt(const Offset(10, 10));
      await tester.pump(const Duration(milliseconds: 300));
      expect(fechou, 0);
      await tester.pump(const Duration(seconds: 1));
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();
      expect(fechou, 1);
    });

    testWidgets('silenciar desliga os sons', (tester) async {
      SonsConquista.silenciado.value = true;
      await abrir(tester);
      await tester.pumpAndSettle();
      expect(sonsTocadosEmTeste(), isEmpty);
      expect(find.byIcon(Icons.volume_off_rounded), findsOneWidget);
    });

    testWidgets(
      'movimento reduzido: sem giro nem partículas, só o som da conquista',
      (tester) async {
        await abrir(tester, reduzir: true);
        await tester.pump(const Duration(milliseconds: 1000));
        expect(sonsTocadosEmTeste(), [SomConquista.conquista]);
        expect(find.text(tituloCelebracao), findsOneWidget);
        final palco = find.byKey(const Key('celebracao-palco'));
        expect(
          find.descendant(of: palco, matching: find.byType(CustomPaint)),
          findsNothing,
        );
        await tester.pumpAndSettle();
      },
    );

    testWidgets('nível sem arte própria mostra o número (não limita a 10)', (
      tester,
    ) async {
      await abrir(tester, numero: 12);
      await tester.pumpAndSettle();
      expect(find.text('12'), findsWidgets);
      expect(
        find.descendant(
          of: find.byKey(const Key('celebracao-emblema')),
          matching: find.byType(Image),
        ),
        findsNothing,
      );
    });

    test('os três sons estão no bundle', () async {
      for (final som in SomConquista.values) {
        final bytes = await rootBundle.load('assets/${som.asset}');
        expect(bytes.lengthInBytes, greaterThan(1000), reason: som.asset);
      }
    });

    test('efeitos usam volume de mídia/jogo, não de notificação', () {
      final android = contextoSomConquista().android;
      expect(android.usageType, AndroidUsageType.game);
      expect(android.contentType, AndroidContentType.sonification);
      expect(android.audioFocus, AndroidAudioFocus.none);
      expect(android.usageType, isNot(AndroidUsageType.notification));
      expect(android.usageType, isNot(AndroidUsageType.notificationRingtone));
    });
  });

  group('painel de QA', () {
    testWidgets(
      'lista os níveis reais, simula, reproduz e reinicia sem gravar',
      (tester) async {
        tester.view.physicalSize = const Size(430, 2400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final servidor = _Servidor(qa: true)..instalar();
        SessaoUsuario.atual.gamificacao.value = ResumoGamificacao.fromJson(
          _resumo(xp: 60, nivel: 2),
        );
        await tester.pumpWidget(_app(const TelaQaGamificacao()));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 200));
        await tester.pump();

        expect(find.text('Níveis cadastrados (10)'), findsOneWidget);
        // A faixa de níveis rola na horizontal até o último nível da tabela.
        await tester.scrollUntilVisible(
          find.byKey(const Key('qa-nivel-10')),
          300,
          scrollable: find.descendant(
            of: find.byKey(const Key('qa-niveis')),
            matching: find.byType(Scrollable),
          ),
        );
        expect(find.byKey(const Key('qa-nivel-10')), findsOneWidget);
        // Começa no nível real da conta.
        expect(find.text('Nível 2 · Curiosidade'), findsWidgets);
        expect(find.byKey(const Key('selo-simulacao')), findsOneWidget);

        await tester.tap(find.byKey(const Key('qa-nivel-10')));
        await tester.pump(const Duration(milliseconds: 200));
        await tester.pump();
        expect(find.byKey(const Key('qa-nivel-selecionado')), findsOneWidget);
        expect(find.text('Nível 10 · Lenda da PUC'), findsWidgets);
        expect(find.textContaining('XP exigido: 2.600 XP'), findsOneWidget);
        expect(servidor.simulacoes.last.queryParameters['nivel'], '10');

        // Reproduz duas vezes seguidas.
        for (var i = 0; i < 2; i++) {
          await tester.ensureVisible(find.byKey(const Key('qa-reproduzir')));
          await tester.tap(find.byKey(const Key('qa-reproduzir')));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 3500));
          expect(find.text('Pré-visualização · sem XP real'), findsOneWidget);
          await tester.tap(find.byKey(const Key('celebracao-continuar')));
          await tester.pumpAndSettle();
        }

        await tester.ensureVisible(find.byKey(const Key('qa-reiniciar')));
        await tester.tap(find.byKey(const Key('qa-reiniciar')));
        await tester.pump(const Duration(milliseconds: 200));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('qa-nivel-selecionado')), findsOneWidget);
        expect(
          tester
              .widget<Text>(find.byKey(const Key('qa-nivel-selecionado')))
              .data,
          'Nível 2 · Curiosidade',
        );
        // Nada foi gravado: nem XP, nem celebração.
        expect(servidor.escritas, isEmpty);
        expect(servidor.confirmacoes, isEmpty);
      },
    );

    testWidgets('conta sem liberação: a tela fecha', (tester) async {
      _Servidor().instalar();
      await tester.pumpWidget(
        _app(
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const TelaQaGamificacao()),
                ),
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('abrir'));
      await tester.pump();
      await tester.pump();
      await tester.pumpAndSettle();
      expect(find.byType(TelaQaGamificacao), findsNothing);
      expect(
        find.text('Painel de testes indisponível para esta conta.'),
        findsOneWidget,
      );
    });

    testWidgets('cartão simulado usa o mesmo cartão do perfil, com selo', (
      tester,
    ) async {
      final simulado = ResumoGamificacao.fromJson(
        _resumo(xp: 60, nivel: 2, simulado: true),
      )!;
      await tester.pumpWidget(
        _app(Scaffold(body: CartaoProgressoResumo(resumo: simulado))),
      );
      expect(find.byKey(const Key('selo-simulacao')), findsOneWidget);
      expect(find.byKey(const Key('barra-nivel')), findsOneWidget);
      expect(find.byKey(const ValueKey('emblema-nivel-2')), findsOneWidget);
    });
  });
}
