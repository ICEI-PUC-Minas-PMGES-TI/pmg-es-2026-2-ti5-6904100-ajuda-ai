import 'dart:async';
import 'dart:convert';

import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:ajuda_ai/widgets/navegacao_app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'helpers/api_falsa.dart';

/// Página de mentira que conta quantas vezes nasceu e guarda o próprio estado
/// (como o scroll do feed), para provar que trocar de aba não recria nada.
class _Pagina extends StatefulWidget {
  const _Pagina(this.destino, this.nascimentos);
  final AppDestination destino;
  final Map<AppDestination, int> nascimentos;

  @override
  State<_Pagina> createState() => _PaginaState();
}

class _PaginaState extends State<_Pagina> {
  int contador = 0;

  @override
  void initState() {
    super.initState();
    widget.nascimentos.update(widget.destino, (n) => n + 1, ifAbsent: () => 1);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    key: ValueKey('pagina-${widget.destino.name}'),
    onTap: () => setState(() => contador++),
    child: Center(child: Text('${widget.destino.name}:$contador')),
  );
}

void main() {
  final sessao = SessaoUsuario.atual;
  late Map<AppDestination, int> nascimentos;
  late int requisicoes;
  late bool falhar;
  late Completer<void>? segurar;

  setUp(() {
    nascimentos = {};
    requisicoes = 0;
    falhar = false;
    segurar = null;
    sessao.limpar();
    sessao.configurarApi(
      ParticipacoesApi(
        client: MockClient((_) async {
          requisicoes++;
          if (segurar != null) await segurar!.future;
          const json = {'content-type': 'application/json; charset=utf-8'};
          if (falhar) {
            return http.Response('{"message":"x"}', 500, headers: json);
          }
          return http.Response(
            jsonEncode(situacaoApadrinhadoAtivo()),
            200,
            headers: json,
          );
        }),
      )..accessToken = 'tk',
    );
    sessao.definirIdentidade(nome: 'Camila', email: 'camila@pucminas.edu.br');
  });

  Future<void> abrir(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    // Login: confirma a participação antes de abrir a casca.
    final f = sessao.sincronizarSituacao();
    await tester.runAsync(() => f);
    await tester.pumpWidget(
      MaterialApp(
        home: AppShell(construtorDePagina: (d) => _Pagina(d, nascimentos)),
      ),
    );
    await tester.pump();
  }

  List<String> abasVisiveis(WidgetTester tester) => [
    for (final d in AppDestination.values)
      if (find.byKey(ValueKey('aba-${d.name}')).evaluate().isNotEmpty) d.name,
  ];

  Future<void> tocar(WidgetTester tester, AppDestination d) async {
    await tester.tap(find.byKey(ValueKey('aba-${d.name}')));
    await tester.pump(const Duration(milliseconds: 30));
  }

  testWidgets('apadrinhado ativo vê as cinco abas ao abrir', (tester) async {
    await abrir(tester);
    expect(abasVisiveis(tester), [
      'mapa',
      'missoes',
      'inicio',
      'feed',
      'perfil',
    ]);
  });

  testWidgets(
    '30 trocas rápidas Início/Feed/Perfil: sempre as cinco abas e nenhuma página recriada',
    (tester) async {
      await abrir(tester);
      const ciclo = [
        AppDestination.feed,
        AppDestination.perfil,
        AppDestination.inicio,
      ];
      for (var i = 0; i < 30; i++) {
        // No meio das trocas, a participação é revalidada (e às vezes falha).
        if (i % 5 == 0) {
          falhar = i % 10 == 0;
          unawaited(sessao.sincronizarSituacao(forcar: true));
        }
        await tocar(tester, ciclo[i % 3]);
        expect(abasVisiveis(tester).length, 5, reason: 'troca #$i perdeu abas');
      }
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pumpAndSettle();
      expect(abasVisiveis(tester).length, 5);
      expect(sessao.destinos, AppDestination.values);
      // Cada página nasceu uma única vez, por maior que seja o vaivém.
      for (final d in ciclo) {
        expect(nascimentos[d], 1, reason: '${d.name} foi recriada');
      }
    },
  );

  testWidgets('o estado da página (scroll, filtros) sobrevive à troca de aba', (
    tester,
  ) async {
    await abrir(tester);
    await tocar(tester, AppDestination.feed);
    await tester.tap(find.byKey(const ValueKey('pagina-feed')));
    await tester.pump();
    expect(find.text('feed:1'), findsOneWidget);
    await tocar(tester, AppDestination.perfil);
    await tocar(tester, AppDestination.inicio);
    await tocar(tester, AppDestination.feed);
    await tester.pumpAndSettle();
    expect(find.text('feed:1'), findsOneWidget);
    expect(nascimentos[AppDestination.feed], 1);
  });

  testWidgets('trocar de aba não dispara consultas de participação', (
    tester,
  ) async {
    await abrir(tester);
    final antes = requisicoes;
    for (var i = 0; i < 12; i++) {
      await tocar(
        tester,
        [AppDestination.feed, AppDestination.perfil, AppDestination.inicio][i %
            3],
      );
    }
    await tester.pumpAndSettle();
    expect(requisicoes, antes);
  });

  testWidgets('consulta lenta ou com falha não reduz a barra', (tester) async {
    await abrir(tester);
    segurar = Completer<void>();
    final lenta = sessao.sincronizarSituacao(forcar: true);
    await tocar(tester, AppDestination.feed);
    await tocar(tester, AppDestination.perfil);
    expect(abasVisiveis(tester).length, 5);
    falhar = true;
    segurar!.complete();
    await tester.runAsync(() => lenta);
    await tester.pumpAndSettle();
    expect(abasVisiveis(tester).length, 5);
    expect(sessao.estadoSituacao, EstadoSituacao.erro);
  });

  testWidgets('a participação encerrada de verdade reduz a barra', (
    tester,
  ) async {
    await abrir(tester);
    await tocar(tester, AppDestination.feed);
    // O servidor passa a dizer que não há participação.
    sessao.configurarApi(
      ParticipacoesApi(
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({'situacao': 'nenhuma'}),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      )..accessToken = 'tk',
    );
    await tester.runAsync(() => sessao.sincronizarSituacao(forcar: true));
    await tester.pumpAndSettle();
    expect(abasVisiveis(tester), ['mapa', 'perfil']);
  });

  testWidgets('logout limpa a participação da conta anterior', (tester) async {
    await abrir(tester);
    sessao.limpar();
    expect(sessao.destinos, [AppDestination.mapa, AppDestination.perfil]);
    expect(sessao.situacao, isNull);
    expect(sessao.estadoSituacao, EstadoSituacao.desconhecido);
  });

  // --- Crossfade -----------------------------------------------------------

  Finder pagina(AppDestination d) =>
      find.byKey(ValueKey('pagina-${d.name}'), skipOffstage: false);

  /// A página existe e está desenhada (não oculta por Offstage).
  bool visivel(AppDestination d) => find
      .ancestor(of: pagina(d), matching: find.byType(Offstage))
      .evaluate()
      .every((e) => !(e.widget as Offstage).offstage);

  /// Opacidade efetiva da página (produto das opacidades dos ancestrais).
  double opacidade(WidgetTester tester, AppDestination d) {
    var o = 1.0;
    for (final e
        in find
            .ancestor(of: pagina(d), matching: find.byType(Opacity))
            .evaluate()) {
      o *= (e.widget as Opacity).opacity;
    }
    return o;
  }

  testWidgets(
    'o crossfade mantém a página anterior opaca por baixo (sem branco)',
    (tester) async {
      await abrir(tester);
      await tocar(tester, AppDestination.feed);
      await tester.pump(const Duration(milliseconds: 60));
      // No meio do fade: as duas visíveis, a nova translúcida e a antiga opaca.
      expect(visivel(AppDestination.inicio), isTrue);
      expect(visivel(AppDestination.feed), isTrue);
      expect(opacidade(tester, AppDestination.inicio), 1);
      final t = opacidade(tester, AppDestination.feed);
      expect(t, greaterThan(0));
      expect(t, lessThan(1));
      await tester.pumpAndSettle();
      expect(visivel(AppDestination.inicio), isFalse);
      expect(visivel(AppDestination.feed), isTrue);
      expect(opacidade(tester, AppDestination.feed), 1);
    },
  );

  testWidgets('em nenhum quadro do fade a tela fica sem conteúdo opaco', (
    tester,
  ) async {
    await abrir(tester);
    await tocar(tester, AppDestination.perfil);
    for (var ms = 0; ms <= 200; ms += 10) {
      await tester.pump(const Duration(milliseconds: 10));
      final opacas = [
        AppDestination.inicio,
        AppDestination.perfil,
      ].where((d) => visivel(d) && opacidade(tester, d) >= 0.999);
      expect(opacas, isNotEmpty, reason: 'quadro em ${ms}ms sem página opaca');
    }
  });

  testWidgets('a nova página fica por cima e só ela recebe toques', (
    tester,
  ) async {
    await abrir(tester);
    await tocar(tester, AppDestination.feed);
    await tester.pump(const Duration(milliseconds: 40));
    await tester.tap(
      find.byKey(const ValueKey('pagina-feed')),
      warnIfMissed: false,
    );
    await tester.pump();
    expect(find.text('feed:1'), findsOneWidget);
    expect(find.text('inicio:0'), findsOneWidget);
  });

  testWidgets('duração do fade fica entre 120 e 180 ms', (tester) async {
    await abrir(tester);
    await tocar(tester, AppDestination.feed);
    await tester.pump(const Duration(milliseconds: 10));
    await tester.pump(const Duration(milliseconds: 100));
    expect(opacidade(tester, AppDestination.feed), lessThan(1));
    await tester.pump(const Duration(milliseconds: 80));
    expect(opacidade(tester, AppDestination.feed), 1);
  });

  testWidgets(
    'trocas rápidas terminam na última aba, sem acumular nem recriar',
    (tester) async {
      await abrir(tester);
      const seq = [
        AppDestination.feed,
        AppDestination.perfil,
        AppDestination.inicio,
        AppDestination.feed,
        AppDestination.perfil,
        AppDestination.feed,
        AppDestination.inicio,
        AppDestination.perfil,
      ];
      for (final d in seq) {
        await tocar(tester, d);
        await tester.pump(const Duration(milliseconds: 20));
        // Sempre existe uma página opaca visível e a última tocada é a que recebe toque.
        expect(
          [
            AppDestination.inicio,
            AppDestination.feed,
            AppDestination.perfil,
          ].any((x) => visivel(x) && opacidade(tester, x) >= 0.999),
          isTrue,
        );
      }
      await tester.pumpAndSettle();
      expect(visivel(AppDestination.perfil), isTrue);
      expect(visivel(AppDestination.inicio), isFalse);
      expect(visivel(AppDestination.feed), isFalse);
      expect(opacidade(tester, AppDestination.perfil), 1);
      expect(sessao.destinos, AppDestination.values);
      for (final d in [
        AppDestination.inicio,
        AppDestination.feed,
        AppDestination.perfil,
      ]) {
        expect(nascimentos[d], 1, reason: '${d.name} foi recriada');
      }
    },
  );

  testWidgets(
    'voltar para a página que ainda está visível por baixo não pisca',
    (tester) async {
      await abrir(tester);
      await tocar(tester, AppDestination.feed);
      await tester.pump(const Duration(milliseconds: 40));
      await tocar(tester, AppDestination.inicio);
      await tester.pump(const Duration(milliseconds: 10));
      expect(visivel(AppDestination.inicio), isTrue);
      expect(opacidade(tester, AppDestination.inicio), 1);
      expect(visivel(AppDestination.feed), isFalse);
    },
  );

  testWidgets('entrar e sair do Mapa é instantâneo, sem duas telas', (
    tester,
  ) async {
    await abrir(tester);
    await tocar(tester, AppDestination.mapa);
    expect(visivel(AppDestination.mapa), isTrue);
    expect(visivel(AppDestination.inicio), isFalse);
    expect(opacidade(tester, AppDestination.mapa), 1);
    await tocar(tester, AppDestination.feed);
    expect(visivel(AppDestination.feed), isTrue);
    expect(opacidade(tester, AppDestination.feed), 1);
    expect(visivel(AppDestination.mapa), isFalse);
    // O mapa não foi recriado pelo vaivém.
    await tocar(tester, AppDestination.mapa);
    expect(nascimentos[AppDestination.mapa], 1);
  });

  testWidgets('fade não dispara requisições de participação', (tester) async {
    await abrir(tester);
    final antes = requisicoes;
    for (final d in [
      AppDestination.feed,
      AppDestination.perfil,
      AppDestination.inicio,
    ]) {
      await tocar(tester, d);
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
    expect(requisicoes, antes);
  });
}
