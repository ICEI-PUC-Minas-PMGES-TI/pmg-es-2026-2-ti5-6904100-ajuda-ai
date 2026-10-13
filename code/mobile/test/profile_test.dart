import 'package:ajuda_ai/configuracoes/tela_config_aparencia.dart';
import 'package:ajuda_ai/configuracoes/tela_configuracoes.dart';
import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_login.dart';
import 'package:ajuda_ai/tela_padrinho_definido.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/api_falsa.dart';

const _camila = DadosCadastro(
  nome: 'Camila Duarte',
  email: 'camila@pucminas.edu.br',
  curso: 'Engenharia de Software',
  periodo: 1,
  turno: 'Noite',
  interesses: ['Tecnologia', 'Inovação'],
);

void main() {
  late ApiFalsa api;

  setUp(() => api = ApiFalsa().instalar());
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
        requisitosCumpridos: {'calculo-i': true, 'aed-i': true},
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

  testWidgets('engrenagem abre configurações com as seis seções', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));

    await tester.tap(find.byTooltip('Configurações'));
    await tester.pumpAndSettle();

    expect(find.byType(ConfiguracoesPage), findsOneWidget);
    for (final secao in [
      'Notificação e Preferências',
      'Privacidade e Visibilidade',
      'Apadrinhamento',
      'Aparência e Acessibilidade',
      'Dados e Armazenamento',
      'Suporte',
    ]) {
      expect(find.text(secao), findsOneWidget);
    }

    await tester.tap(find.text('Notificação e Preferências'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Novidades do feed'));
    await tester.pumpAndSettle();
    expect(SessaoUsuario.atual.preferencias['notificacoesFeed'], isTrue);
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Aparência e Acessibilidade'));
    await tester.pumpAndSettle();
    expect(find.byType(AparenciaConfigPage), findsOneWidget);
    await tester.tap(find.text('Grande'));
    await tester.pumpAndSettle();
    expect(SessaoUsuario.atual.escalaTexto.value, 1.15);
  });

  testWidgets('perfil de apadrinhado ativo usa a situação do backend', (
    tester,
  ) async {
    api.situacao = situacaoApadrinhadoAtivo();
    SessaoUsuario.atual.definir(
      dadosCadastro: _camila,
      escolha: Participacao.apadrinhado,
    );

    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
    await tester.pumpAndSettle();

    expect(SessaoUsuario.atual.status, StatusParticipacao.apadrinhadoAtivo);
    expect(find.text('Apadrinhado ativo'), findsOneWidget);
    expect(find.text('Padrinho: Thiago Moreira'), findsOneWidget);
    expect(find.text('Grupo 08'), findsWidgets);
    expect(find.text('Tecnologia'), findsOneWidget);
    expect(find.text('Minha jornada'), findsOneWidget);
    expect(find.text('Acessos rápidos'), findsOneWidget);
    expect(find.text('Meu padrinho'), findsOneWidget);

    await tester.tap(find.text('Apadrinhado ativo'));
    await tester.pumpAndSettle();

    expect(find.byType(PadrinhoDefinidoPage), findsOneWidget);
    expect(find.text('Thiago Moreira'), findsOneWidget);
  });

  testWidgets('aguardando padrinho mostra o card e o aviso do mapa', (
    tester,
  ) async {
    SessaoUsuario.atual.definir(
      dadosCadastro: _camila,
      escolha: Participacao.apadrinhado,
    );

    await tester.pumpWidget(const MaterialApp(home: ProfilePage()));
    await tester.pumpAndSettle();

    expect(find.text('Aguardando padrinho'), findsOneWidget);
    expect(find.text('Minha jornada'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Explorar mapa'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Explorar mapa'));
    await tester.pump();

    expect(find.textContaining('app Mapa da PUC'), findsOneWidget);
  });
}
