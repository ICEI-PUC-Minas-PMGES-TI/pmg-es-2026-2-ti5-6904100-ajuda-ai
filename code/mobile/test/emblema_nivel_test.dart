import 'package:ajuda_ai/models/resumo_gamificacao.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/widgets/progresso_gamificacao.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(() => SessaoUsuario.atual.limpar());

  test('os dez PNGs de emblema estão no bundle', () async {
    for (var nivel = 1; nivel <= 10; nivel++) {
      final caminho = assetEmblemaNivel(nivel);
      expect(caminho, 'assets/gamificacao/nivel_${nivel.toString().padLeft(2, '0')}.png');
      final bytes = await rootBundle.load(caminho!);
      expect(bytes.lengthInBytes, greaterThan(1000), reason: caminho);
    }
    expect(assetEmblemaNivel(0), isNull);
    expect(assetEmblemaNivel(11), isNull);
  });

  testWidgets('cada nível aponta para o próprio asset, sem corte', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Column(
              children: [
                for (var nivel = 1; nivel <= 10; nivel++)
                  EmblemaNivel(numero: nivel, nome: 'Nível $nivel'),
              ],
            ),
          ),
        ),
      ),
    );

    for (var nivel = 1; nivel <= 10; nivel++) {
      final caixa = find.byKey(ValueKey('emblema-nivel-$nivel'));
      final imagem = tester.widget<Image>(
        find.descendant(of: caixa, matching: find.byType(Image)),
      );
      expect(imagem.fit, BoxFit.contain);
      expect(imagem.filterQuality, FilterQuality.none);
      expect(
        (imagem.image as AssetImage).assetName,
        assetEmblemaNivel(nivel),
      );
      expect(tester.getSize(caixa), const Size(104, 104));
    }
  });

  testWidgets('nível 10 cabe na home estreita e com fonte maior', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SessaoUsuario.atual.gamificacao.value = ResumoGamificacao.fromJson({
      'moedas': 800,
      'xpAcumulado': 3200,
      'nivel': {
        'numero': 10,
        'nome': 'Lenda da PUC',
        'xpMinimo': 2500,
        'proximoXp': null,
        'proximoNome': null,
        'xpNoNivel': 700,
        'xpDoNivel': null,
        'xpRestante': 0,
        'progresso': 100,
        'maximo': true,
      },
    });

    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(1.4)),
          child: Scaffold(body: CartaoProgresso()),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Nível 10 · Lenda da PUC'), findsOneWidget);
    expect(find.text('3.200 XP acumulado'), findsOneWidget);
    expect(find.text('Nível máximo alcançado'), findsOneWidget);
    expect(find.text('800 moedas'), findsOneWidget);
    expect(tester.takeException(), isNull);

    final caixa = find.byKey(const ValueKey('emblema-nivel-10'));
    expect(tester.getSize(caixa), const Size(104, 104));
    final imagem = tester.widget<Image>(
      find.descendant(of: caixa, matching: find.byType(Image)),
    );
    expect(
      (imagem.image as AssetImage).assetName,
      'assets/gamificacao/nivel_10.png',
    );
  });

  testWidgets('perfil mostra o emblema do nível ao lado do resumo', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SessaoUsuario.atual.gamificacao.value = ResumoGamificacao.fromJson({
      'moedas': 120,
      'xpAcumulado': 40,
      'nivel': {
        'numero': 1,
        'nome': 'Primeiro passo',
        'xpMinimo': 0,
        'proximoXp': 50,
        'proximoNome': 'Curiosidade',
        'xpNoNivel': 40,
        'xpDoNivel': 50,
        'xpRestante': 10,
        'progresso': 80,
        'maximo': false,
      },
    });

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ResumoProgressoCompacto()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Nível 1 · Primeiro passo'), findsOneWidget);
    expect(find.text('40 XP acumulado'), findsOneWidget);
    expect(find.text('120 moedas'), findsOneWidget);
    expect(tester.getSize(find.byKey(const ValueKey('emblema-nivel-1'))), const Size(88, 88));
    expect(tester.takeException(), isNull);
  });
}
