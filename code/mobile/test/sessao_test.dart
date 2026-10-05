import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/services/participacoes_api.dart';
import 'package:ajuda_ai/status_participacao.dart';
import 'package:ajuda_ai/tela_participacao.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'helpers/api_falsa.dart';

const _dados = DadosCadastro(
  nome: 'Camila Duarte',
  email: 'Camila@PUCMinas.edu.br',
  curso: 'Engenharia de Software',
  periodo: 1,
  turno: 'Noite',
);

Map<String, dynamic> _situacao(String situacao) => {
  'usuarioId': 'camila@pucminas.edu.br',
  'situacao': situacao,
  'registro': null,
  'grupo': null,
  'padrinho': null,
  'apadrinhados': const [],
};

void main() {
  tearDown(SessaoUsuario.atual.limpar);

  test('situação do backend vira o status do app', () {
    expect(statusDaSituacao('nenhuma'), isNull);
    expect(
      statusDaSituacao('candidatura_pendente'),
      StatusParticipacao.padrinhoEmAnalise,
    );
    expect(
      statusDaSituacao('candidatura_em_analise'),
      StatusParticipacao.padrinhoEmAnalise,
    );
    expect(
      statusDaSituacao('candidatura_rejeitada'),
      StatusParticipacao.padrinhoRejeitado,
    );
    expect(
      statusDaSituacao('padrinho_ativo'),
      StatusParticipacao.padrinhoAtivo,
    );
    expect(
      statusDaSituacao('apadrinhado_aguardando'),
      StatusParticipacao.apadrinhadoAguardandoMatch,
    );
    expect(
      statusDaSituacao('apadrinhado_ativo'),
      StatusParticipacao.apadrinhadoAtivo,
    );
    expect(statusDaSituacao('concluido'), StatusParticipacao.concluido);
  });

  test('sincronizar guarda padrinho, grupo, registro e etapas', () async {
    final api = ApiFalsa(situacao: situacaoApadrinhadoAtivo()).instalar();
    final sessao = SessaoUsuario.atual
      ..definir(dadosCadastro: _dados, escolha: Participacao.explorar);

    expect(await sessao.sincronizarSituacao(), isTrue);

    final pedido = api.requisicoes.single;
    expect(pedido.url.path, '/participacoes/situacao');
    expect(pedido.url.queryParameters['usuarioId'], 'camila@pucminas.edu.br');
    expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);
    expect(sessao.participacao, Participacao.apadrinhado);
    expect(sessao.padrinho?.nome, 'Thiago Moreira');
    expect(sessao.grupo, 'Grupo 08');
    expect(sessao.registro?['papel'], 'apadrinhado');
    expect(sessao.situacao?.programa?.codigo, '2026/2');
  });

  test('"nenhuma" no backend não apaga escolha local de explorar', () async {
    ApiFalsa(situacao: _situacao('nenhuma')).instalar();
    final sessao = SessaoUsuario.atual
      ..definir(dadosCadastro: _dados, escolha: Participacao.explorar);

    expect(await sessao.sincronizarSituacao(), isTrue);
    expect(sessao.status, StatusParticipacao.explorar);
  });

  test('candidatura rejeitada no backend atualiza o status', () async {
    ApiFalsa(situacao: _situacao('candidatura_rejeitada')).instalar();
    final sessao = SessaoUsuario.atual
      ..definir(dadosCadastro: _dados, escolha: Participacao.padrinho);

    await sessao.sincronizarSituacao();
    expect(sessao.status, StatusParticipacao.padrinhoRejeitado);
  });

  test('falha de rede mantém o estado local', () async {
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(
        client: MockClient((_) async => throw http.ClientException('offline')),
      ),
    );
    final sessao = SessaoUsuario.atual
      ..definir(dadosCadastro: _dados, escolha: Participacao.apadrinhado);

    expect(await sessao.sincronizarSituacao(), isFalse);
    expect(sessao.status, StatusParticipacao.apadrinhadoAguardandoMatch);
  });

  test('cadastro do apadrinhado sem conexão fica salvo localmente', () async {
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(
        client: MockClient((_) async => throw http.ClientException('offline')),
      ),
    );

    final enviado = await SessaoUsuario.atual.cadastrarApadrinhado(
      dadosCadastro: _dados,
    );

    expect(enviado, isFalse);
    expect(
      SessaoUsuario.atual.status,
      StatusParticipacao.apadrinhadoAguardandoMatch,
    );
    expect(SessaoUsuario.atual.dados, same(_dados));
  });
}
