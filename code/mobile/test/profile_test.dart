import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_login.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  testWidgets('perfil exibe informacoes sem idioma', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    expect(find.text('Meu perfil'), findsOneWidget);
    expect(find.text('Perfil'), findsWidgets);
    expect(find.text('Sobre mim'), findsOneWidget);
    expect(find.text('Informações acadêmicas'), findsOneWidget);
    expect(find.text('E-mail institucional'), findsOneWidget);
    expect(find.text('Idioma'), findsNothing);
    expect(find.text('Minha jornada'), findsNothing);
    expect(find.text('Minha participação'), findsNothing);
  });

  testWidgets('perfil com candidatura de padrinho em analise', (tester) async {
    await SessaoUsuario.atual.registrarCandidaturaPadrinho(
      dadosCadastro: const DadosCadastro(
        nome: 'Camila Duarte',
        email: 'camila@pucminas.edu.br',
        curso: 'Engenharia de Software',
        periodo: 3,
        turno: 'Noite',
        areasApoio: ['Projetos'],
        disponibilidade: 'Noite',
        genero: 'Feminino',
        bolsistaProuni: false,
        deOutraCidade: true,
        expectativaPadrinho: 'Quero apoiar calouros.',
      ),
      enviadaEm: DateTime(2026, 3, 15),
    );

    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    expect(find.text('Candidatura de padrinho'), findsOneWidget);
    expect(find.text('Em análise'), findsOneWidget);
    expect(
      find.textContaining('sendo analisada pela coordenação'),
      findsOneWidget,
    );
    expect(find.text('Enviada em: 15/03/2026'), findsOneWidget);
    expect(find.text('Ver candidatura'), findsOneWidget);
    expect(find.text('Apadrinhado ativo'), findsNothing);
    expect(find.text('Padrinho ativo'), findsNothing);
    expect(SessaoUsuario.atual.status, StatusParticipacao.padrinhoEmAnalise);

    await tester.tap(find.text('Ver candidatura'));
    await tester.pumpAndSettle();

    expect(find.text('Minha candidatura'), findsOneWidget);
    expect(find.text('Projetos'), findsOneWidget);
    expect(find.text('Ocultar candidatura'), findsOneWidget);
  });

  testWidgets('editar e confirmar atualiza o perfil', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    await tester.tap(find.text('Editar perfil'));
    await tester.pumpAndSettle();

    expect(find.text('Editar perfil'), findsOneWidget);
    expect(find.text('Confirmar'), findsOneWidget);
    expect(find.text('Cancelar'), findsOneWidget);

    await tester.enterText(find.byType(TextField).at(0), 'Fernanda Soares');
    await tester.enterText(
      find.byType(TextField).at(1),
      'Adoro criar interfaces e ajudar calouros.',
    );
    await tester.enterText(
      find.byType(TextField).at(2),
      'Engenharia de Software',
    );
    await tester.enterText(find.byType(TextField).at(3), '5º período');
    await tester.enterText(
      find.byType(TextField).at(4),
      'fernanda@pucminas.edu.br',
    );

    await tester.scrollUntilVisible(
      find.text('Confirmar'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Confirmar'));
    await tester.pumpAndSettle();

    expect(find.text('Fernanda Soares'), findsOneWidget);
    expect(find.text('Engenharia de Software'), findsWidgets);
    expect(find.text('5º período'), findsWidgets);
    expect(find.text('fernanda@pucminas.edu.br'), findsOneWidget);
    expect(
      find.text('Adoro criar interfaces e ajudar calouros.'),
      findsOneWidget,
    );
    expect(find.text('Perfil atualizado com sucesso.'), findsOneWidget);
  });

  testWidgets('sair da conta retorna para o login', (tester) async {
    SessaoUsuario.atual.definir(
      dadosCadastro: const DadosCadastro(
        nome: 'Ana Clara',
        email: 'ana.clara@pucminas.edu.br',
        curso: 'Engenharia Química',
        periodo: 1,
        turno: 'Manhã',
      ),
      escolha: Participacao.explorar,
    );

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
