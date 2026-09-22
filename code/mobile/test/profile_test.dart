import 'package:ajuda_ai/tela_login.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('perfil exibe informacoes sem idioma', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    expect(find.text('Perfil'), findsWidgets);
    expect(find.text('Sobre mim'), findsOneWidget);
    expect(find.text('Informações acadêmicas'), findsOneWidget);
    expect(find.text('E-mail institucional'), findsOneWidget);
    expect(find.text('Idioma'), findsNothing);
  });

  testWidgets('sair da conta retorna para o login', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
    await tester.scrollUntilVisible(
      find.text('Sair da conta'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Sair da conta'));
    await tester.pumpAndSettle();

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Entrar com a Microsoft'), findsOneWidget);
  });
}
