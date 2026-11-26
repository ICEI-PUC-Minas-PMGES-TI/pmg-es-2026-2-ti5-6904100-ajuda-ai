import 'package:ajuda_ai/services/missoes_api.dart';
import 'package:ajuda_ai/tela_missoes.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'missoes_test.dart' as fixture;

void main() {
  const exemplos = [
    (
      'totem',
      'Visite 3 totens do campus',
      'Explore o campus e registre sua visita em três pontos diferentes.',
      'UNICA',
      40,
    ),
    (
      'evento',
      'Participe da Semana do Calouro',
      'Escolha uma atividade da programação e participe do encontro.',
      'UNICA',
      30,
    ),
    (
      'conversa',
      'Ajude um calouro',
      'Responda a uma dúvida de quem está chegando à universidade.',
      'SEMANAL',
      20,
    ),
    (
      'estudo',
      'Estude em grupo',
      'Combine uma sessão de estudo e revise o conteúdo com colegas.',
      'SEMANAL',
      20,
    ),
    (
      'campus',
      'Explore o campus',
      'Conheça um novo espaço da universidade e planeje como chegar até lá.',
      'UNICA',
      25,
    ),
    (
      'perfil',
      'Atualize seu perfil',
      'Adicione uma foto e conte um pouco sobre seus interesses.',
      'UNICA',
      15,
    ),
    (
      'semanal',
      'Acompanhe seu progresso',
      'Revise o que você realizou e escolha uma meta para a próxima semana.',
      'SEMANAL',
      20,
    ),
    (
      'ciclo',
      'Avalie o programa',
      'Compartilhe o que funcionou bem e sugira uma melhoria para o próximo semestre.',
      'UNICA',
      30,
    ),
  ];

  testWidgets('captura a aba e os cards das categorias de missão', (
    tester,
  ) async {
    final inter = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter-Variable.ttf'));
    await inter.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();

    final missoes = [
      for (final (categoria, titulo, descricao, tipo, xp) in exemplos)
        {
          ...fixture.missao(categoria, titulo: titulo, tipo: tipo, xp: xp),
          'descricao': descricao,
        },
    ];
    final servidor = await fixture.abrir(tester, missoes.take(3).toList());
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;

    Future<void> renderizar(String chave) async {
      await tester.pumpWidget(
        MaterialApp(
          key: ValueKey(chave),
          theme: ThemeData(fontFamily: 'Inter'),
          home: MissoesPage(
            api: MissoesApi(client: servidor.client, baseUrl: ''),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await renderizar('carrossel');
    await expectLater(
      find.byType(MissoesPage),
      matchesGoldenFile('goldens/missoes-implementada.png'),
    );

    servidor.missoes = [
      ...missoes,
      {
        ...fixture.missao(
          'estudo-limitada',
          titulo: 'Revise o conteúdo da semana',
          tipo: 'SEMANAL',
          xp: 30,
          xpPrevisto: 10,
          status: 'limitada',
        ),
      },
    ];
    await renderizar('lista');
    await tester.ensureVisible(find.text('Suas missões'));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MissoesPage),
      matchesGoldenFile('goldens/missoes-lista.png'),
    );

    for (final missao in missoes) {
      final id = missao['id'] as String;
      servidor.missoes = [missao];
      await renderizar(id);
      if (id == 'campus') {
        final contexto = tester.element(find.byType(MissoesPage));
        await tester.runAsync(() async {
          await precacheImage(
            const AssetImage('assets/images/pucjardim.png'),
            contexto,
          );
        });
        await tester.pumpAndSettle();
      }
      final cartao = find.byKey(Key('destaque-$id'));
      expect(
        find.descendant(
          of: cartao,
          matching: find.byWidgetPredicate(
            (widget) =>
                widget.key is ValueKey<String> &&
                (widget.key as ValueKey<String>).value.startsWith('arte-$id-'),
          ),
        ),
        findsOneWidget,
      );
      await expectLater(
        find.ancestor(of: cartao, matching: find.byType(RepaintBoundary)).first,
        matchesGoldenFile('goldens/categorias/$id.png'),
      );
    }

    const tituloLongo =
        'Participe da Semana do Calouro e conheça as atividades de recepção da universidade';
    const descricaoLonga =
        'Escolha uma atividade da programação, confira o local do encontro '
        'e aproveite para conversar com colegas e conhecer os espaços da universidade.';
    tester.view.physicalSize = const Size(320, 844);
    servidor.missoes = [
      {
        ...fixture.missao('evento-longo', titulo: tituloLongo, xp: 30),
        'descricao': descricaoLonga,
      },
    ];
    await renderizar('evento-longo');
    final longo = find.byKey(const Key('destaque-evento-longo'));
    final titulo = find.descendant(of: longo, matching: find.text(tituloLongo));
    final descricao = find.descendant(
      of: longo,
      matching: find.text(descricaoLonga),
    );
    final recompensa = find.descendant(of: longo, matching: find.text('30 XP'));
    expect(tester.getSize(titulo).height, greaterThan(66));
    expect(
      tester.getBottomLeft(descricao).dy,
      lessThan(tester.getTopLeft(recompensa).dy),
    );
    expect(tester.getSize(longo).height, greaterThan(222));
  });
}
