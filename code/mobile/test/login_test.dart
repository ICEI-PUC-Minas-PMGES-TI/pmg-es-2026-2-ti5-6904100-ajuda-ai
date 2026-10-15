import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ajuda_ai/main.dart';
import 'package:ajuda_ai/tela_cadastro.dart';

void main() {
  testWidgets('o botão Microsoft não abre o cadastro nem usa a Camila', (
    tester,
  ) async {
    await tester.pumpWidget(const AjudaAiApp());
    await tester.tap(find.text('Entrar com a Microsoft'));
    await tester.pumpAndSettle();

    expect(find.text('Login Microsoft indisponível'), findsOneWidget);
    expect(find.byType(CadastroPage), findsNothing);
    expect(find.text('Camila Duarte'), findsNothing);
    expect(find.text('camila@pucminas.edu.br'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tela de login mostra a chamada e o botão', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AjudaAiApp());

    expect(find.text('Bem-vindo!'), findsOneWidget);
    expect(find.text('Entrar com a Microsoft'), findsOneWidget);
  });

  testWidgets('layout em dois tamanhos de tela', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(351, 733);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 24);
    tester.view.viewPadding = const FakeViewPadding(top: 24, bottom: 24);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);

    final inter = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter-Variable.ttf'));
    await inter.load();
    final poppins = FontLoader('Poppins')
      ..addFont(rootBundle.load('assets/fonts/Poppins-ExtraBold.ttf'));
    await poppins.load();
    await tester.pumpWidget(const AjudaAiApp());
    await tester.pumpAndSettle();

    final subtitle = find.textContaining('Entre com sua credencial');
    final paragraph = tester.renderObject<RenderParagraph>(subtitle);
    final painter = TextPainter(
      text: paragraph.text,
      textDirection: paragraph.textDirection,
      textScaler: paragraph.textScaler,
    )..layout(maxWidth: paragraph.size.width);
    expect(painter.computeLineMetrics(), hasLength(2));
    painter.dispose();
    expect(tester.widget<Text>(subtitle).style?.fontFamily, 'Inter');

    final hero = find.byWidgetPredicate(
      (widget) =>
          widget is Image &&
          widget.image is AssetImage &&
          (widget.image as AssetImage).assetName == 'assets/images/imghero.png',
    );
    final heroRect = tester.getRect(hero);
    expect(heroRect.height, inInclusiveRange(175, 205));
    expect(heroRect.top, inInclusiveRange(260, 290));

    final button = tester.getRect(find.byType(FilledButton));
    expect(button.left, inInclusiveRange(21, 23));
    expect(button.width, inInclusiveRange(305, 309));
    expect(button.height, 50);
    expect(button.top, inInclusiveRange(460, 485));
    expect(
      tester
          .widget<Text>(find.text('Entrar com a Microsoft'))
          .style
          ?.fontFamily,
      'Inter',
    );
    expect(tester.takeException(), isNull);

    tester.view.physicalSize = const Size(400, 800);
    await tester.pumpWidget(const AjudaAiApp());
    await tester.pumpAndSettle();
    final widerButton = tester.getRect(find.byType(FilledButton));
    expect(widerButton.height, inInclusiveRange(55, 57));
    expect(widerButton.left, inInclusiveRange(24, 27));
    expect(tester.takeException(), isNull);
  });
}
