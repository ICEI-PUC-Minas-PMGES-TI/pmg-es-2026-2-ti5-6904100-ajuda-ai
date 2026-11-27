import 'dart:convert';

import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_entrada_aluno.dart';
import 'package:ajuda_ai/tela_cadastro.dart';
import 'package:ajuda_ai/tela_perfil.dart';
import 'package:ajuda_ai/tela_status_candidatura.dart';
import 'package:ajuda_ai/widgets/app_bottom_navigation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/api_falsa.dart';

const perfil = DadosCadastro(
  nome: 'Aluno Teste',
  email: 'aluno@pucminas.edu.br',
  curso: 'SI',
  periodo: 3,
  turno: 'Noite',
);
void main() {
  late ApiFalsa api;
  setUp(() {
    SessaoUsuario.atual.limpar();
    api = ApiFalsa().instalar();
    SessaoUsuario.atual.assumirSessao(
      accessToken: ApiFalsa.token,
      nome: perfil.nome,
      email: perfil.email,
      curso: perfil.curso,
      periodo: 3,
    );
  });
  tearDown(SessaoUsuario.atual.limpar);
  const estados = {
    'nenhuma': StatusParticipacao.nenhuma,
    'candidatura_pendente': StatusParticipacao.padrinhoPendente,
    'candidatura_em_analise': StatusParticipacao.padrinhoEmAnalise,
    'candidatura_rejeitada': StatusParticipacao.padrinhoRejeitado,
    'candidatura_aprovada_aguardando_matching':
        StatusParticipacao.padrinhoAguardandoMatching,
    'padrinho_ativo': StatusParticipacao.padrinhoAtivo,
    'apadrinhado_pendente': StatusParticipacao.apadrinhadoPendente,
    'apadrinhado_rejeitado': StatusParticipacao.apadrinhadoRejeitado,
    'apadrinhado_aguardando': StatusParticipacao.apadrinhadoAguardandoMatch,
    'apadrinhado_ativo': StatusParticipacao.apadrinhadoAtivo,
    'concluido': StatusParticipacao.concluido,
  };
  for (final estado in estados.entries) {
    test('situação ${estado.key} resolve permissões pela API', () async {
      api.situacao = {'situacao': estado.key, 'registro': null};
      await SessaoUsuario.atual.sincronizarSituacao();
      expect(SessaoUsuario.atual.status, estado.value);
      expect(
        SessaoUsuario.atual.destinos.contains(AppDestination.inicio),
        ['padrinho_ativo', 'apadrinhado_ativo'].contains(estado.key),
      );
    });
  }
  test('nenhuma limpa atividade, vínculo e data do ciclo anterior', () async {
    api.situacao = {
      'situacao': 'padrinho_ativo',
      'grupo': 'Antigo',
      'registro': {'criadoEm': '2026-01-01'},
    };
    await SessaoUsuario.atual.sincronizarSituacao();
    api.situacao = {'situacao': 'nenhuma', 'registro': null};
    await SessaoUsuario.atual.selecionarPrograma('2027/1');
    expect(SessaoUsuario.atual.status, StatusParticipacao.nenhuma);
    expect(SessaoUsuario.atual.grupo, isNull);
    expect(SessaoUsuario.atual.participacao, isNull);
    expect(SessaoUsuario.atual.candidaturaEnviadaEm, isNull);
  });
  test('troca de conta e logout limpam permissões e dados', () async {
    api.situacao = {'situacao': 'padrinho_ativo', 'grupo': 'Antigo'};
    await SessaoUsuario.atual.sincronizarSituacao();
    SessaoUsuario.atual.assumirSessao(
      accessToken: 'outra',
      nome: 'Outra',
      email: 'outra@pucminas.edu.br',
    );
    expect(SessaoUsuario.atual.dados, isNull);
    expect(SessaoUsuario.atual.situacao, isNull);
    expect(SessaoUsuario.atual.ehPadrinhoAtivo, isFalse);
    SessaoUsuario.atual.limpar();
    expect(SessaoUsuario.atual.accessToken, isNull);
    expect(SessaoUsuario.atual.identidade, isNull);
  });
  test(
    'perfil e foto usam contratos próprios e persistem campos autorizados',
    () async {
      await SessaoUsuario.atual.salvarPerfil(
        perfil.copyWith(
          nome: 'Editado',
          turno: 'Tarde',
          interesses: ['Projetos'],
        ),
      );
      await SessaoUsuario.atual.carregarPerfil();
      expect(SessaoUsuario.atual.dados!.nome, 'Editado');
      expect(SessaoUsuario.atual.dados!.turno, 'Tarde');
      expect(SessaoUsuario.atual.dados!.email, perfil.email);
      expect(await SessaoUsuario.atual.participacoesApi.foto(), isNull);
      expect(
        await SessaoUsuario.atual.participacoesApi.enviarFoto([
          137,
          80,
          78,
          71,
        ]),
        contains('storage.test'),
      );
      expect(
        await SessaoUsuario.atual.participacoesApi.foto(),
        contains('storage.test'),
      );
      await SessaoUsuario.atual.participacoesApi.removerFoto();
      expect(await SessaoUsuario.atual.participacoesApi.foto(), isNull);
      expect(
        api.requisicoes.any(
          (r) => r.method == 'DELETE' && r.url.path == '/me/foto',
        ),
        isTrue,
      );
      final foto = api.requisicoes.singleWhere(
        (r) => r.method == 'PUT' && r.url.path == '/me/foto',
      );
      expect(foto.headers['content-type'], startsWith('multipart/form-data'));
      expect(latin1.decode(foto.bodyBytes), contains('name="foto"'));
      final patch = api.requisicoes.singleWhere((r) => r.method == 'PATCH');
      expect((jsonDecode(patch.body) as Map).containsKey('email'), isFalse);
      expect(api.posts('/cadastro'), isEmpty);
    },
  );
  testWidgets('perfil incompleto após login abre completar perfil', (
    tester,
  ) async {
    api.perfilSalvo = {
      'nome': perfil.nome,
      'email': perfil.email,
      'curso': '',
      'periodo': 0,
    };
    await tester.pumpWidget(const MaterialApp(home: EntradaAlunoPage()));
    await tester.pumpAndSettle();
    expect(find.byType(CadastroPage), findsOneWidget);
  });
  testWidgets('perfil completo sem inscrição abre perfil sem atividade', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: EntradaAlunoPage()));
    await tester.pumpAndSettle();
    expect(find.byType(ProfilePage), findsOneWidget);
    expect(find.text('Padrinho ativo'), findsNothing);
  });
  for (final estado in [
    'candidatura_pendente',
    'candidatura_em_analise',
    'candidatura_rejeitada',
    'candidatura_aprovada_aguardando_matching',
  ]) {
    testWidgets('login $estado abre acompanhamento sem atividade', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(600, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      api.situacao = {
        'situacao': estado,
        'programa': {'codigo': '2026/2', 'titulo': 'Programa 2026/2'},
        'registro': {
          'decisao': {'justificativa': 'Requisito acadêmico não atendido'},
        },
      };
      await tester.pumpWidget(const MaterialApp(home: EntradaAlunoPage()));
      await tester.pumpAndSettle();
      expect(find.byType(StatusCandidaturaPage), findsOneWidget);
      expect(find.text('Editar candidatura'), findsNothing);
      expect(SessaoUsuario.atual.ehPadrinhoAtivo, isFalse);
      if (estado == 'candidatura_rejeitada') {
        expect(
          find.textContaining('Requisito acadêmico não atendido'),
          findsOneWidget,
        );
      }
      if (estado == 'candidatura_aprovada_aguardando_matching') {
        expect(find.text('Aguardando definição do seu grupo.'), findsOneWidget);
      }
    });
  }
}
