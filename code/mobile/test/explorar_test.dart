import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/tela_mapa.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

DadosCadastro _dados({required int periodo}) => DadosCadastro(
  nome: 'Camila Duarte',
  email: 'camila@pucminas.edu.br',
  curso: 'Engenharia de Software',
  periodo: periodo,
  turno: 'Noite',
);

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('explorar abre o mapa só com Mapa e Perfil', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: ParticipacaoPage(dados: _dados(periodo: 1))),
    );

    await tester.tap(find.text('Quero apenas explorar o campus'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Continuar'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();

    expect(find.byType(MapaPage), findsOneWidget);
    expect(find.text('Mapa'), findsOneWidget);
    expect(find.text('Perfil'), findsOneWidget);
    expect(find.text('Início'), findsNothing);
    expect(find.text('Feed'), findsNothing);
    expect(find.text('Missões'), findsNothing);
    expect(SessaoUsuario.atual.destinos, [
      AppDestination.mapa,
      AppDestination.perfil,
    ]);
  });

  testWidgets('perfil explorar mostra apadrinhado no 1º período', (
    tester,
  ) async {
    SessaoUsuario.inscricoesApadrinhamentoAbertas = true;
    SessaoUsuario.atual.definir(
      dadosCadastro: _dados(periodo: 1),
      escolha: Participacao.explorar,
    );

    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    expect(find.text('Quero ser apadrinhado'), findsOneWidget);
    expect(find.text('Quero ser padrinho'), findsNothing);
    expect(find.text('Editar perfil'), findsOneWidget);
    // A engrenagem de Configurações fica no topo do perfil para todos.
    expect(find.byTooltip('Configurações'), findsOneWidget);
    expect(find.text('Apadrinhado ativo'), findsNothing);
  });

  testWidgets('perfil explorar mostra padrinho a partir do 2º período', (
    tester,
  ) async {
    SessaoUsuario.atual.definir(
      dadosCadastro: _dados(periodo: 3),
      escolha: Participacao.explorar,
    );

    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    expect(find.text('Quero ser padrinho'), findsOneWidget);
    expect(find.text('Quero ser apadrinhado'), findsNothing);
  });
}
