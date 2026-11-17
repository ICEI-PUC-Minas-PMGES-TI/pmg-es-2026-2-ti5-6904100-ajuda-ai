import 'dart:convert';

import 'package:ajuda_ai/coordenacao/tela_totens_coord.dart';
import 'package:ajuda_ai/services/coordenacao_api.dart';
import 'package:campus_map/campus_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, dynamic> _totem({
  String id = '11111111-1111-4111-8111-111111111111',
  String nome = 'Biblioteca',
  int xp = 25,
  double latitude = -19.923,
  double longitude = -43.993,
  bool ativo = true,
}) => {
  'id': id,
  'nome': nome,
  'xp': xp,
  'raioMetros': 30,
  'latitude': latitude,
  'longitude': longitude,
  'ativo': ativo,
  'coletas': 0,
};

void main() {
  test('valida XP e monta PATCH independente de XP e posição', () {
    const ponto = CampusMapPoint(latitude: -19.923, longitude: -43.993);
    expect(
      validarFormularioTotem(nome: 'Totem', xp: '0', raio: '30', ponto: ponto),
      contains('10, 20, 30, 40 ou 50'),
    );
    // Fora das opções (o servidor também recusa).
    for (final xp in ['5', '15', '25', '60', '1000']) {
      expect(
        validarFormularioTotem(nome: 'Totem', xp: xp, raio: '30', ponto: ponto),
        contains('10, 20, 30, 40 ou 50'),
        reason: xp,
      );
    }
    for (final xp in ['10', '20', '30', '40', '50']) {
      expect(
        validarFormularioTotem(nome: 'Totem', xp: xp, raio: '30', ponto: ponto),
        isNull,
        reason: xp,
      );
    }
    expect(
      validarFormularioTotem(
        nome: 'Totem',
        xp: '2.5',
        raio: '30',
        ponto: ponto,
      ),
      contains('10, 20, 30, 40 ou 50'),
    );
    expect(
      validarFormularioTotem(nome: 'Totem', xp: '30', raio: '30', ponto: null),
      contains('posição'),
    );

    final original = _totem();
    expect(
      camposAlteradosTotem(
        original,
        nome: 'Biblioteca',
        xp: '50',
        raio: '30',
        ponto: ponto,
      ),
      {'xp': 50},
    );
    expect(
      camposAlteradosTotem(
        original,
        nome: 'Biblioteca',
        xp: '25',
        raio: '30',
        ponto: const CampusMapPoint(latitude: -19.924, longitude: -43.994),
      ),
      {'latitude': -19.924, 'longitude': -43.994},
    );
  });

  test('API mobile usa as mesmas rotas administrativas da web', () async {
    final pedidos = <http.Request>[];
    final api = CoordenacaoApi(
      accessToken: 'coord-token',
      baseUrl: '',
      client: MockClient((pedido) async {
        pedidos.add(pedido);
        expect(pedido.headers['authorization'], 'Bearer coord-token');
        if (pedido.url.path == '/coordenacao/pucstops/campus') {
          return http.Response(jsonEncode({'centro': {}}), 200);
        }
        if (pedido.method == 'GET') return http.Response('[]', 200);
        return http.Response(jsonEncode(_totem()), 200);
      }),
    );

    await api.pucstops();
    await api.campusPucStops();
    await api.criarPucStop({
      'nome': 'Biblioteca',
      'xp': 25,
      'raioMetros': 30,
      'latitude': -19.923,
      'longitude': -43.993,
    });
    await api.atualizarPucStop('id', {'xp': 50});
    await api.desativarPucStop('id');
    await api.ativarPucStop('id');

    expect(pedidos.map((p) => '${p.method} ${p.url.path}'), [
      'GET /coordenacao/pucstops',
      'GET /coordenacao/pucstops/campus',
      'POST /coordenacao/pucstops',
      'PATCH /coordenacao/pucstops/id',
      'POST /coordenacao/pucstops/id/desativar',
      'POST /coordenacao/pucstops/id/ativar',
    ]);
    expect(jsonDecode(pedidos[2].body)['xp'], 25);
  });

  testWidgets('coordenador cria totem de 40 XP pelo mapa em tela cheia', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    http.Request? criacao;
    final api = CoordenacaoApi(
      accessToken: 'coord-token',
      baseUrl: '',
      client: MockClient((pedido) async {
        criacao = pedido;
        final body = jsonDecode(pedido.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode(
            _totem(
              nome: body['nome'] as String,
              xp: body['xp'] as int,
              latitude: (body['latitude'] as num).toDouble(),
              longitude: (body['longitude'] as num).toDouble(),
            ),
          ),
          201,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: FormularioTotemCoord(
          api: api,
          campus: const {},
          outros: const [],
          seletorBuilder:
              (
                context, {
                required selecionado,
                required onChanged,
                required campus,
                required outros,
              }) => Center(
                child: FilledButton(
                  onPressed: () => onChanged(
                    const CampusMapPoint(latitude: -19.923, longitude: -43.993),
                  ),
                  child: const Text('Selecionar ponto'),
                ),
              ),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField).first, 'Totem da biblioteca');
    // Novo totem já sugere 30 XP + 30 moedas; a coordenação escolhe 40.
    expect(
      find.text('30 XP + 30 moedas para cada aluno, uma vez por semestre.'),
      findsOneWidget,
    );
    final opcao40 = find.byKey(const ValueKey('xp-totem-40'));
    await tester.ensureVisible(opcao40);
    await tester.tap(opcao40);
    await tester.pump();
    expect(
      find.text('40 XP + 40 moedas para cada aluno, uma vez por semestre.'),
      findsOneWidget,
    );
    final abrirMapa = find.byKey(const ValueKey('abrir-mapa-3d-totem'));
    // A lista é preguiçosa: rola até o botão existir.
    await tester.scrollUntilVisible(
      abrirMapa,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(abrirMapa);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Selecionar ponto'));
    await tester.tap(find.text('Selecionar ponto'));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('confirmar-posicao-totem')));
    await tester.pumpAndSettle();
    final salvar = find.byKey(const ValueKey('salvar-totem'));
    await tester.scrollUntilVisible(
      salvar,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(salvar);
    await tester.pumpAndSettle();

    expect(criacao?.method, 'POST');
    final body = jsonDecode(criacao!.body) as Map<String, dynamic>;
    expect(body['xp'], 40);
    expect(body['latitude'], -19.923);
    expect(body['longitude'], -43.993);
  });

  group('impacto no orçamento (informativo)', () {
    test(
      'cadastro soma; edição troca o valor antigo sem contar duas vezes',
      () {
        expect(potencialAposSalvar(potencialAtual: 570, novoXp: 30), 600);
        final ativo = _totem(xp: 50);
        expect(
          potencialAposSalvar(potencialAtual: 570, original: ativo, novoXp: 30),
          550,
        );
        expect(
          potencialAposSalvar(potencialAtual: 570, original: ativo, novoXp: 50),
          570,
        );
        // Inativo não entra no orçamento, antes nem depois.
        final inativo = _totem(xp: 50, ativo: false);
        expect(
          potencialAposSalvar(
            potencialAtual: 570,
            original: inativo,
            novoXp: 40,
          ),
          570,
        );
      },
    );

    testWidgets(
      'formulário mostra antes/depois e avisa acima do teto sem bloquear',
      (tester) async {
        tester.view.physicalSize = const Size(390, 1600);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          MaterialApp(
            home: FormularioTotemCoord(
              api: CoordenacaoApi(
                accessToken: 't',
                baseUrl: '',
                client: MockClient((_) async => http.Response('{}', 200)),
              ),
              campus: const {},
              outros: const [],
              orcamento: const {
                'xpPotencial': 380,
                'limitePorCiclo': 400,
                'ativos': 13,
              },
            ),
          ),
        );
        expect(
          find.text('Recompensa selecionada: 30 XP + 30 moedas.'),
          findsOneWidget,
        );
        expect(
          find.text('XP potencial atual do mapa: 380 XP.'),
          findsOneWidget,
        );
        expect(
          find.text('XP potencial após o cadastro: 410 XP.'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Cada participante poderá receber'),
          findsOneWidget,
        );
        // Só informa: o botão de salvar continua disponível.
        expect(find.byKey(const ValueKey('salvar-totem')), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('xp-totem-10')));
        await tester.pump();
        expect(
          find.text('XP potencial após o cadastro: 390 XP.'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Cada participante poderá receber'),
          findsNothing,
        );
      },
    );
  });
}
