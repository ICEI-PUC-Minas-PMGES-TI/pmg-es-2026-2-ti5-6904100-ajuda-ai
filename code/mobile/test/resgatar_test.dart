import 'dart:convert';

import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/services/lojinha_api.dart';
import 'package:ajuda_ai/tela_home.dart';
import 'package:ajuda_ai/tela_resgatar.dart';
import 'package:ajuda_ai/tela_resgates.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void telaAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('botão Resgatar da home abre a tela de resgate', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: HomePage()));

    await tester.tap(find.text('Resgatar'));
    await tester.pumpAndSettle();

    expect(find.byType(ResgatarPage), findsOneWidget);
    expect(find.text('0 moedas'), findsOneWidget);
    expect(find.text('Nenhum item disponível ainda'), findsOneWidget);
  });

  testWidgets('item só pode ser resgatado com saldo, estoque e limite', (
    tester,
  ) async {
    telaAlta(tester);
    await tester.pumpWidget(
      const MaterialApp(
        home: ResgatarPage(
          saldoXp: 500,
          itens: [
            ItemResgate(
              id: 1,
              nome: 'Caneca PUC',
              descricao: 'Caneca oficial',
              custoXp: 300,
              estoque: 5,
            ),
            ItemResgate(
              id: 2,
              nome: 'Moletom',
              descricao: 'Moletom do curso',
              custoXp: 2000,
            ),
            ItemResgate(
              id: 3,
              nome: 'Garrafa',
              descricao: 'Garrafa térmica',
              custoXp: 100,
              estoque: 0,
            ),
            ItemResgate(
              id: 4,
              nome: 'Adesivo',
              descricao: 'Adesivo',
              custoXp: 10,
              limitePorAluno: 1,
              resgatesDoAluno: 1,
            ),
          ],
        ),
      ),
    );

    expect(find.text('300 moedas'), findsOneWidget);
    expect(find.text('5 em estoque'), findsOneWidget);
    expect(find.text('Faltam 1.500 moedas'), findsOneWidget);
    expect(find.text('Esgotado'), findsOneWidget);
    expect(find.text('Limite atingido'), findsOneWidget);

    await tester.tap(find.text('Garrafa'));
    await tester.pumpAndSettle();
    final bloqueado = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Resgatar'),
    );
    expect(bloqueado.onPressed, isNull);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Caneca PUC'));
    await tester.pumpAndSettle();
    expect(find.text('5 unidades'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Resgatar'));
    await tester.pumpAndSettle();
    expect(find.byType(TelaRevisaoResgate), findsOneWidget);
    expect(find.text('200 moedas'), findsOneWidget);
    expect(find.text('Confirmar resgate'), findsOneWidget);
  });

  testWidgets('tocar no card abre o detalhe', (tester) async {
    telaAlta(tester);
    await tester.pumpWidget(
      const MaterialApp(
        home: ResgatarPage(
          saldoXp: 50,
          itens: [
            ItemResgate(
              id: 1,
              nome: 'Caneca',
              descricao: 'Caneca oficial',
              custoXp: 30,
              condicoesRetirada: 'Secretaria do ICEI',
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.text('Caneca'));
    await tester.pumpAndSettle();
    expect(find.byType(TelaDetalheRecompensa), findsOneWidget);
    expect(find.text('Secretaria do ICEI'), findsOneWidget);
  });

  testWidgets('revisa, confirma e mostra o comprovante', (tester) async {
    telaAlta(tester);
    SessaoUsuario.atual.assumirSessao(
      accessToken: 'token',
      nome: 'Ana',
      email: 'ana@pucminas.edu.br',
    );
    var estoque = 1;
    var saldo = 100;
    final chaves = <String>[];
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient((req) async {
        if (req.method == 'POST') {
          chaves.add(jsonDecode(req.body)['chaveIdempotencia'] as String);
          estoque = 0;
          saldo = 70;
          return http.Response(
            jsonEncode({
              'id': 'r1',
              'codigo': 'A1B2C3D4E5',
              'nome': 'Caneca',
              'custoXp': 30,
              'condicoesRetirada': 'Secretaria',
              'criadoEm': '2026-11-03T12:00:00.000Z',
              'saldoApos': 70,
              'saldoAtual': 70,
            }),
            201,
          );
        }
        if (req.url.path == '/me/xp') {
          return http.Response(jsonEncode({'saldo': saldo}), 200);
        }
        return http.Response(
          jsonEncode([
            {
              'id': 'item',
              'nome': 'Caneca',
              'descricao': 'Azul',
              'custoXp': 30,
              'estoque': estoque,
              'condicoesRetirada': 'Secretaria',
              'resgatesFeitos': 0,
            },
          ]),
          200,
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(home: ResgatarPage(saldoXp: 0, api: api)),
    );
    await tester.pumpAndSettle();
    expect(find.text('100 moedas'), findsOneWidget);
    await tester.tap(find.text('Caneca'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Resgatar'));
    await tester.pumpAndSettle();
    expect(find.text('70 moedas'), findsOneWidget);
    await tester.tap(find.text('Confirmar resgate'));
    await tester.pumpAndSettle();
    expect(find.byType(TelaComprovante), findsOneWidget);
    expect(find.byType(TelaRevisaoResgate), findsNothing);
    expect(find.byType(TelaDetalheRecompensa), findsNothing);
    expect(find.text('Resgate realizado com sucesso!'), findsOneWidget);
    expect(find.text('A1B2C3D4E5'), findsOneWidget);
    expect(chaves, hasLength(1));
    expect(SessaoUsuario.atual.xp.value, 70);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('70 moedas'), findsOneWidget);
    expect(find.byType(ResgatarPage), findsOneWidget);
    expect(find.text('Esgotado'), findsOneWidget);
  });

  testWidgets('erro de saldo aparece na revisão sem sair da tela', (
    tester,
  ) async {
    telaAlta(tester);
    SessaoUsuario.atual.assumirSessao(
      accessToken: 'token',
      nome: 'Ana',
      email: 'ana@pucminas.edu.br',
    );
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient(
        (req) async => http.Response(
          jsonEncode({
            'statusCode': 409,
            'message': 'Recompensa esgotada.',
            'motivo': 'esgotada',
          }),
          409,
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaRevisaoResgate(
          item: const ItemResgate(
            id: 'item',
            nome: 'Caneca',
            descricao: 'Azul',
            custoXp: 30,
          ),
          saldoXp: 100,
          api: api,
        ),
      ),
    );
    await tester.tap(find.text('Confirmar resgate'));
    await tester.pumpAndSettle();
    expect(find.text('Recompensa esgotada.'), findsOneWidget);
    expect(find.byType(TelaRevisaoResgate), findsOneWidget);
  });

  testWidgets('preço mudou: revisão mostra o novo e reenvia a versão nova', (
    tester,
  ) async {
    telaAlta(tester);
    SessaoUsuario.atual.assumirSessao(
      accessToken: 'token',
      nome: 'Ana',
      email: 'ana@pucminas.edu.br',
    );
    final enviados = <Map<String, dynamic>>[];
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient((req) async {
        if (req.method == 'GET') {
          return http.Response(
            jsonEncode({
              'id': 'item',
              'nome': 'Caneca',
              'descricao': 'Azul',
              'custoXp': 80,
              'versao': 2,
            }),
            200,
          );
        }
        final corpo = jsonDecode(req.body) as Map<String, dynamic>;
        enviados.add(corpo);
        if (corpo['versao'] == 1) {
          return http.Response(
            jsonEncode({
              'statusCode': 409,
              'message': 'Esta recompensa mudou e agora custa 80 XP.',
              'motivo': 'recompensa-alterada',
            }),
            409,
          );
        }
        return http.Response(
          jsonEncode({'id': 'r1', 'codigo': 'ABC', 'saldoAtual': 20}),
          201,
        );
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: TelaRevisaoResgate(
          item: const ItemResgate(
            id: 'item',
            nome: 'Caneca',
            descricao: 'Azul',
            custoXp: 50,
          ),
          saldoXp: 100,
          api: api,
        ),
      ),
    );
    expect(find.text('50 moedas'), findsWidgets);

    await tester.tap(find.text('Confirmar resgate'));
    await tester.pumpAndSettle();
    expect(
      find.text('Esta recompensa mudou e agora custa 80 XP.'),
      findsOneWidget,
    );
    expect(find.text('80 moedas'), findsWidgets);
    expect(find.text('50 moedas'), findsNothing);

    await tester.tap(find.text('Confirmar resgate'));
    await tester.pumpAndSettle();
    expect(enviados.map((c) => [c['versao'], c['custoXp']]).toList(), [
      [1, 50],
      [2, 80],
    ]);
    expect(enviados[0]['chaveIdempotencia'], enviados[1]['chaveIdempotencia']);
    expect(SessaoUsuario.atual.xp.value, 20);
  });

  testWidgets('meus resgates e extrato listam dados da API', (tester) async {
    telaAlta(tester);
    SessaoUsuario.atual.assumirSessao(
      accessToken: 'token',
      nome: 'Ana',
      email: 'ana@pucminas.edu.br',
    );
    final api = LojinhaApi(
      baseUrl: 'http://localhost:3000',
      client: MockClient((req) async {
        if (req.url.path == '/me/lojinha/resgates') {
          return http.Response(
            jsonEncode([
              {
                'id': 'r1',
                'codigo': 'A1B2C3D4E5',
                'nome': 'Caneca',
                'custoXp': 30,
                'criadoEm': '2026-11-03T12:00:00.000Z',
              },
            ]),
            200,
          );
        }
        return http.Response(
          jsonEncode([
            {
              'id': '9',
              'quantidade': -30,
              'descricao': 'Resgate: Caneca',
              'saldoApos': 70,
              'criadoEm': '2026-11-03T12:00:00.000Z',
            },
            {
              'id': '8',
              'quantidade': 100,
              'descricao': 'PucStop Biblioteca',
              'saldoApos': 100,
              'criadoEm': '2026-11-02T12:00:00.000Z',
            },
          ]),
          200,
        );
      }),
    );
    await tester.pumpWidget(MaterialApp(home: TelaMeusResgates(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Caneca'), findsOneWidget);
    expect(find.text('Código: A1B2C3D4E5'), findsOneWidget);
    await tester.tap(find.text('Caneca'));
    await tester.pumpAndSettle();
    expect(find.byType(TelaComprovante), findsOneWidget);

    await tester.pumpWidget(
      MaterialApp(
        key: UniqueKey(),
        home: TelaExtratoXp(api: api),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('-30 moedas'), findsOneWidget);
    expect(find.text('+100 moedas'), findsOneWidget);
    expect(find.text('Carregar mais'), findsNothing);
  });
}
