import 'package:ajuda_ai/models/feed_comment.dart';
import 'package:ajuda_ai/widgets/feed_comments_sheet.dart';
import 'package:ajuda_ai/widgets/app_feedback.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

FeedComment comentario(
  int id, {
  int? paiId,
  bool admin = false,
  bool curtido = false,
  String? foto,
}) => FeedComment(
  id: id,
  texto: 'Texto $id',
  autorId: 'usuario:$id',
  nome: 'Pessoa $id',
  paiId: paiId,
  podeExcluir: admin,
  curtidas: curtido ? 1 : 0,
  curtidoPorMim: curtido,
  fotoUrl: foto,
  criadoEm: DateTime.now(),
);

void main() {
  Future<void> abrir(
    WidgetTester tester,
    List<FeedComment> lista, {
    Future<bool> Function(String, int?)? enviar,
    Future<bool> Function(FeedComment, int)? curtir,
    Future<bool> Function(FeedComment)? excluir,
    ValueNotifier<int>? mudancas,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final notifier = mudancas ?? ValueNotifier(0);
    if (mudancas == null) addTearDown(notifier.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FeedCommentsSheet(
            comentarios: () => lista,
            mudancas: notifier,
            onSubmit: enviar ?? (_, _) async => true,
            onLike: curtir ?? (_, _) async => true,
            onDelete: excluir ?? (_) async => true,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('nome, foto, data e ações vêm do contrato explícito', (
    tester,
  ) async {
    const foto = 'https://storage.test/avatar.jpg?sig=teste';
    await abrir(tester, [comentario(1, foto: foto)]);
    expect(find.text('Pessoa 1'), findsOneWidget);
    expect(find.text('agora'), findsOneWidget);
    expect(
      tester.widget<Image>(find.byType(Image)).image,
      isA<NetworkImage>().having((v) => v.url, 'url', foto),
    );
    expect(find.text('Texto 1'), findsOneWidget);
    expect(find.byIcon(Icons.favorite_border_rounded), findsOneWidget);
    expect(find.text('Curtir'), findsNothing);
    expect(find.text('Responder'), findsOneWidget);
    expect(find.byTooltip('Excluir comentário'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('responde, cancela e mantém respostas na mesma thread', (
    tester,
  ) async {
    final envios = <(String, int?)>[];
    await abrir(
      tester,
      [comentario(1), comentario(2, paiId: 1)],
      enviar: (texto, pai) async {
        envios.add((texto, pai));
        return true;
      },
    );
    await tester.tap(find.text('Responder').first);
    await tester.pumpAndSettle();
    expect(find.text('Respondendo a Pessoa 1'), findsOneWidget);
    await tester.tap(find.byTooltip('Cancelar resposta'));
    await tester.pumpAndSettle();
    expect(find.text('Respondendo a Pessoa 1'), findsNothing);
    await tester.tap(find.text('Responder').last);
    await tester.pumpAndSettle();
    expect(find.text('Respondendo a Pessoa 2'), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      '@Pessoa 2 ',
    );
    await tester.enterText(find.byType(TextField), '@Pessoa 2 Uma resposta');
    await tester.tap(find.byTooltip('Enviar comentário'));
    await tester.pumpAndSettle();
    expect(envios.single, ('@Pessoa 2 Uma resposta', 1));
    expect(find.text('Respondendo a Pessoa 2'), findsNothing);
    final raiz = tester.getTopLeft(find.byKey(const ValueKey('comentario-1')));
    final resposta = tester.getTopLeft(find.text('Texto 2'));
    expect(resposta.dx, greaterThan(raiz.dx + 30));
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'admin confirma exclusão e aluno não tem menu em comentário alheio',
    (tester) async {
      final lista = [comentario(1, admin: true), comentario(2)];
      final notifier = ValueNotifier(0);
      addTearDown(notifier.dispose);
      var excluidos = 0;
      await abrir(
        tester,
        lista,
        mudancas: notifier,
        excluir: (c) async {
          excluidos++;
          lista.removeWhere((v) => v.id == c.id);
          notifier.value++;
          return true;
        },
      );
      expect(find.byTooltip('Excluir comentário'), findsOneWidget);
      await tester.tap(find.byTooltip('Excluir comentário'));
      await tester.pumpAndSettle();
      expect(find.text('Excluir comentário?'), findsOneWidget);
      expect(excluidos, 0);
      await tester.tap(find.text('Excluir'));
      await tester.pumpAndSettle();
      expect(excluidos, 1);
      expect(find.text('Texto 1'), findsNothing);
      expect(find.text('Comentário excluído'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      expect(
        tester.getTopLeft(find.text('Comentário excluído')).dy,
        lessThan(120),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'curtir/descurtir e atualização externa preservam campo digitado',
    (tester) async {
      final lista = [comentario(1)];
      final notifier = ValueNotifier(0);
      addTearDown(notifier.dispose);
      final acoes = <int>[];
      await abrir(
        tester,
        lista,
        mudancas: notifier,
        curtir: (c, delta) async {
          acoes.add(delta);
          lista[0] = comentario(1, curtido: delta == 1);
          notifier.value++;
          return true;
        },
      );
      await tester.enterText(find.byType(TextField), 'Rascunho');
      await tester.tap(find.byTooltip('Curtir comentário'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
      expect(find.byIcon(Icons.favorite_border_rounded), findsNothing);
      expect(find.text('1'), findsOneWidget);
      expect(find.textContaining('Descurtir'), findsNothing);
      await tester.tap(find.byTooltip('Remover curtida'));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite_border_rounded), findsOneWidget);
      expect(acoes, [1, -1]);
      lista.add(comentario(2, paiId: 1));
      notifier.value++;
      await tester.pumpAndSettle();
      expect(find.text('Pessoa 2'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Rascunho',
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('lista longa rola e campo permanece acessível com teclado', (
    tester,
  ) async {
    await abrir(tester, [for (var i = 1; i <= 40; i++) comentario(i)]);
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsOneWidget);
    expect(tester.getBottomRight(find.byType(TextField)).dy, lessThan(544));
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'feedback flutuante é compacto, não bloqueia toque e desaparece',
    (tester) async {
      var toques = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () {
                    toques++;
                    mostrarFeedback(context, 'Imagem salva na galeria');
                  },
                  child: const Text('Salvar'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Salvar'));
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsNothing);
      expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
      // Toast no topo, abaixo da barra de status (SafeArea).
      expect(
        tester.getTopLeft(find.text('Imagem salva na galeria')).dy,
        lessThan(120),
      );
      expect(
        tester.getTopLeft(find.byIcon(Icons.check_circle_rounded)).dy,
        greaterThan(0),
      );
      expect(
        tester.getSize(find.text('Imagem salva na galeria')).width,
        lessThan(320),
      );
      await tester.tap(find.text('Salvar'));
      expect(toques, 2);
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.text('Imagem salva na galeria'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}
