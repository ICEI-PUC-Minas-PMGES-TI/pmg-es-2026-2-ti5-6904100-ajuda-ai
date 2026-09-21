import 'package:ajuda_ai/tela_feed.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget app() => const MaterialApp(home: FeedPage());

  testWidgets('feed exibe filtros e criacao de post', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    expect(find.text('Feed'), findsWidgets);
    expect(find.text('Dicas acadêmicas'), findsWidgets);
    expect(find.text('Criar'), findsWidgets);
    expect(find.text('1/3'), findsOneWidget);
    expect(find.text('Mapa'), findsOneWidget);
    expect(find.text('Missões'), findsOneWidget);
    expect(find.text('Perfil'), findsOneWidget);
    expect(find.text('Chat'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('usuario abre compositor e publica texto', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Compartilhe algo com a comunidade...'));
    await tester.pumpAndSettle();

    expect(find.text('Criar publicação'), findsOneWidget);
    await tester.enterText(
      find.byType(TextField).first,
      'Minha primeira dica para a turma.',
    );
    await tester.pump();
    await tester.tap(find.text('Publicar'));
    await tester.pumpAndSettle();

    expect(find.text('Minha primeira dica para a turma.'), findsOneWidget);
    expect(find.text('Camila Andrade'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
