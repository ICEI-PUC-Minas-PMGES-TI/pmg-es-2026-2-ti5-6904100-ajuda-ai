import 'package:ajuda_ai/theme/colors.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Barra dentro de um StatefulBuilder para trocar a aba como o app faz.
class _Palco extends StatefulWidget {
  const _Palco({
    required this.inicial,
    this.destinos,
    this.semMovimento = false,
  });
  final AppDestination inicial;
  final List<AppDestination>? destinos;
  final bool semMovimento;

  @override
  State<_Palco> createState() => _PalcoState();
}

class _PalcoState extends State<_Palco> {
  late AppDestination atual = widget.inicial;
  void ir(AppDestination d) => setState(() => atual = d);

  @override
  Widget build(BuildContext context) => MediaQuery(
    data: MediaQuery.of(context)
        .copyWith(disableAnimations: widget.semMovimento),
    child: Scaffold(
      bottomNavigationBar: AppBottomNavigation(
        selected: atual,
        destinations: widget.destinos,
        onSelected: ir,
      ),
    ),
  );
}

void main() {
  const larguraTela = 400.0;

  Future<_PalcoState> montar(
    WidgetTester tester,
    AppDestination inicial, {
    List<AppDestination>? destinos,
    bool semMovimento = false,
  }) async {
    tester.view.physicalSize = const Size(larguraTela, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: _Palco(
          inicial: inicial,
          destinos: destinos,
          semMovimento: semMovimento,
        ),
      ),
    );
    return tester.state<_PalcoState>(find.byType(_Palco));
  }

  // O indicador é a única caixa roxa preenchida com sombra da barra.
  Finder indicador() => find.byWidgetPredicate((w) {
    if (w is! DecoratedBox) return false;
    final d = w.decoration;
    return d is BoxDecoration &&
        d.color == AppColors.primary &&
        (d.boxShadow?.isNotEmpty ?? false);
  });

  double centroX(WidgetTester t) => t.getCenter(indicador()).dx;
  Size tamanho(WidgetTester t) => t.getSize(indicador());

  // Centro esperado do item i: a barra tem 3px de padding em cada lado.
  double centroItem(int i, int n) {
    final util = larguraTela - 6;
    return 3 + util / n * (i + 0.5);
  }

  for (final destino in AppDestination.values) {
    testWidgets('em repouso o indicador é um círculo sobre ${destino.name}', (
      tester,
    ) async {
      await montar(tester, destino);
      expect(centroX(tester), closeTo(centroItem(destino.index, 5), 1));
      expect(tamanho(tester).width, closeTo(tamanho(tester).height, 0.5));
    });
  }

  testWidgets('desliza até a nova aba e se alonga no caminho', (tester) async {
    final palco = await montar(tester, AppDestination.feed);
    palco.ir(AppDestination.inicio);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));
    final x = centroX(tester);
    // No meio do caminho: entre Feed e Início e mais largo que alto.
    expect(x, lessThan(centroItem(3, 5)));
    expect(x, greaterThan(centroItem(2, 5)));
    expect(tamanho(tester).width, greaterThan(tamanho(tester).height + 4));
    await tester.pumpAndSettle();
    expect(centroX(tester), closeTo(centroItem(2, 5), 1));
    expect(tamanho(tester).width, closeTo(tamanho(tester).height, 0.5));
  });

  testWidgets('saltos longos (Mapa para Perfil) terminam no destino', (
    tester,
  ) async {
    final palco = await montar(tester, AppDestination.mapa);
    palco.ir(AppDestination.perfil);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 190));
    // O alongamento é limitado: nunca vira uma faixa.
    expect(tamanho(tester).width, lessThan(larguraTela / 5 * 2.4));
    await tester.pumpAndSettle();
    expect(centroX(tester), closeTo(centroItem(4, 5), 1));
  });

  testWidgets('trocas rápidas não deixam o indicador fora da última aba', (
    tester,
  ) async {
    final palco = await montar(tester, AppDestination.mapa);
    for (final d in [
      AppDestination.feed,
      AppDestination.inicio,
      AppDestination.perfil,
      AppDestination.mapa,
      AppDestination.feed,
    ]) {
      palco.ir(d);
      await tester.pump(const Duration(milliseconds: 60));
    }
    await tester.pumpAndSettle();
    expect(centroX(tester), closeTo(centroItem(3, 5), 1));
    expect(tamanho(tester).width, closeTo(tamanho(tester).height, 0.5));
  });

  testWidgets('movimento reduzido: vai direto para a aba, sem trânsito', (
    tester,
  ) async {
    final palco = await montar(tester, AppDestination.mapa, semMovimento: true);
    palco.ir(AppDestination.perfil);
    await tester.pump();
    expect(centroX(tester), closeTo(centroItem(4, 5), 1));
  });

  testWidgets('respeita os destinos permitidos do perfil', (tester) async {
    final destinos = [AppDestination.mapa, AppDestination.perfil];
    final palco = await montar(
      tester,
      AppDestination.perfil,
      destinos: destinos,
    );
    expect(find.text('Feed'), findsNothing);
    expect(centroX(tester), closeTo(centroItem(1, 2), 1));
    palco.ir(AppDestination.mapa);
    await tester.pumpAndSettle();
    expect(centroX(tester), closeTo(centroItem(0, 2), 1));
  });

  testWidgets('ícone ativo fica branco sobre o indicador; os demais, cinza', (
    tester,
  ) async {
    await montar(tester, AppDestination.feed);
    Color? cor(IconData icone) => tester.widget<Icon>(find.byIcon(icone)).color;
    expect(cor(Icons.feed_outlined), Colors.white);
    expect(cor(Icons.home_outlined), AppAccents.navigationMuted);
  });

  testWidgets('tocar numa aba avisa o chamador', (tester) async {
    final palco = await montar(tester, AppDestination.inicio);
    await tester.tap(find.text('Perfil'));
    await tester.pumpAndSettle();
    expect(palco.atual, AppDestination.perfil);
  });

  testWidgets('só a aba pressionada recebe feedback de toque', (tester) async {
    await montar(tester, AppDestination.feed);
    double opacidade(AppDestination d) => tester
        .widget<AnimatedOpacity>(
          find.descendant(
            of: find.byKey(ValueKey('aba-${d.name}')),
            matching: find.byType(AnimatedOpacity),
          ),
        )
        .opacity;
    final dedo = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('aba-inicio'))),
    );
    await tester.pump(const Duration(milliseconds: 120));
    expect(opacidade(AppDestination.inicio), lessThan(1));
    // Missões (à esquerda de Início) e as demais seguem normais.
    for (final d in AppDestination.values.where(
      (d) => d != AppDestination.inicio,
    )) {
      expect(opacidade(d), 1, reason: d.name);
    }
    await dedo.up();
    await tester.pumpAndSettle();
    for (final d in AppDestination.values) {
      expect(opacidade(d), 1, reason: 'depois do toque: ${d.name}');
    }
  });

  testWidgets('arrastar para fora cancela o feedback e não troca de aba', (
    tester,
  ) async {
    final palco = await montar(tester, AppDestination.feed);
    final dedo = await tester.startGesture(
      tester.getCenter(find.byKey(const ValueKey('aba-inicio'))),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await dedo.moveBy(const Offset(0, -200));
    await dedo.up();
    await tester.pumpAndSettle();
    expect(palco.atual, AppDestination.feed);
  });
}
