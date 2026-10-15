import 'package:ajuda_ai/dados_cadastro.dart';
import 'package:ajuda_ai/sessao_usuario.dart';
import 'package:ajuda_ai/services/api_config.dart';
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
  setUp(() {
    SessaoUsuario.atual.definirIdentidade(
      nome: 'Camila Duarte',
      email: 'camila@pucminas.edu.br',
    );
  });
  tearDown(SessaoUsuario.atual.limpar);

  test('sem identidade o cadastro não é enviado', () async {
    SessaoUsuario.atual.limpar();
    final api = ApiFalsa().instalar();

    await expectLater(
      SessaoUsuario.atual.cadastrarApadrinhado(dadosCadastro: _dados),
      throwsA(isA<ApiException>()),
    );
    expect(api.posts('/cadastro'), isEmpty);
  });

  test('o POST /cadastro usa o e-mail da sessão', () async {
    SessaoUsuario.atual.definirIdentidade(
      nome: 'Ana Souza',
      email: 'ana.souza@pucminas.edu.br',
    );
    final api = ApiFalsa().instalar();

    await SessaoUsuario.atual.cadastrarApadrinhado(dadosCadastro: _dados);

    expect(
      api.corpo(api.posts('/cadastro').single)['email'],
      'ana.souza@pucminas.edu.br',
    );
    expect(SessaoUsuario.atual.dados?.email, 'ana.souza@pucminas.edu.br');
  });

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
    expect(
      statusDaSituacao('apadrinhado_pendente'),
      StatusParticipacao.apadrinhadoPendente,
    );
    expect(
      statusDaSituacao('apadrinhado_rejeitado'),
      StatusParticipacao.apadrinhadoRejeitado,
    );
  });

  test('sincronizar guarda padrinho, grupo, registro e etapas', () async {
    final api = ApiFalsa(situacao: situacaoApadrinhadoAtivo()).instalar();
    final sessao = SessaoUsuario.atual
      ..definir(dadosCadastro: _dados, escolha: Participacao.explorar);

    expect(await sessao.sincronizarSituacao(), isTrue);

    // sem cadastro (login demo 401) → leitura no modo antigo, por e-mail
    final pedido = api.requisicoes.last;
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

  test('sem conexão o cadastro NÃO é dado como enviado', () async {
    SessaoUsuario.atual.configurarApi(
      ParticipacoesApi(
        client: MockClient((_) async => throw http.ClientException('offline')),
      ),
    );

    await expectLater(
      SessaoUsuario.atual.cadastrarApadrinhado(dadosCadastro: _dados),
      throwsA(isA<ApiIndisponivelException>()),
    );
    expect(SessaoUsuario.atual.status, StatusParticipacao.nenhuma);
    expect(SessaoUsuario.atual.accessToken, isNull);
  });

  test('backend recusa (regra de período) e nada muda localmente', () async {
    ApiFalsa(
      erroEnvio: 'A partir do 2º período não é possível se cadastrar como apadrinhado.',
    ).instalar();

    await expectLater(
      SessaoUsuario.atual.cadastrarApadrinhado(dadosCadastro: _dados),
      throwsA(
        isA<ApiException>().having(
          (e) => e.mensagem,
          'mensagem',
          contains('2º período'),
        ),
      ),
    );
    expect(SessaoUsuario.atual.status, StatusParticipacao.nenhuma);
  });

  test(
    'cadastro usa POST /cadastro, fica pendente e passa a usar token',
    () async {
      final api = ApiFalsa(
        situacao: {
          ..._situacao('apadrinhado_pendente'),
          'cadastro': {'status': 'pendente', 'tipoParticipacao': 'apadrinhado'},
        },
      ).instalar();
      final sessao = SessaoUsuario.atual;

      await sessao.cadastrarApadrinhado(dadosCadastro: _dados);
      expect(sessao.status, StatusParticipacao.apadrinhadoPendente);
      expect(sessao.accessToken, ApiFalsa.token);

      await sessao.sincronizarSituacao();
      final leitura = api.requisicoes.last;
      expect(leitura.url.path, '/participacoes/situacao');
      expect(leitura.headers['authorization'], 'Bearer ${ApiFalsa.token}');
      expect(leitura.headers.containsKey('x-user-id'), isFalse);
      expect(api.posts('/auth/login-demo'), isEmpty); // já tinha token
      expect(sessao.cadastro?.pendente, isTrue);
    },
  );

  test('aprovação e rejeição (com motivo) chegam pela sincronização', () async {
    final api = ApiFalsa(
      cadastrado: true,
      situacao: {
        ..._situacao('apadrinhado_rejeitado'),
        'cadastro': {
          'status': 'rejeitado',
          'tipoParticipacao': 'apadrinhado',
          'motivoRejeicao': 'Dados incompletos.',
        },
      },
    ).instalar();
    final sessao = SessaoUsuario.atual
      ..definir(
        dadosCadastro: _dados,
        escolha: Participacao.apadrinhado,
        statusParticipacao: StatusParticipacao.apadrinhadoPendente,
      );

    // aluno já cadastrado: login demo devolve o token antes de ler a situação
    await sessao.sincronizarSituacao();
    expect(api.posts('/auth/login-demo'), hasLength(1));
    expect(
      api.requisicoes.last.headers['authorization'],
      'Bearer ${ApiFalsa.token}',
    );
    expect(sessao.status, StatusParticipacao.apadrinhadoRejeitado);
    expect(sessao.motivoRejeicao, 'Dados incompletos.');

    api.situacao = {
      ..._situacao('apadrinhado_aguardando'),
      'cadastro': {'status': 'aprovado', 'tipoParticipacao': 'apadrinhado'},
    };
    await sessao.sincronizarSituacao();
    expect(sessao.status, StatusParticipacao.apadrinhadoAguardandoMatch);
    expect(sessao.cadastro?.aprovado, isTrue);
  });

  test('requisitos do ciclo vêm do backend (mesmo endpoint do web)', () async {
    final api = ApiFalsa().instalar();
    final lista = await SessaoUsuario.atual.carregarRequisitosPadrinho();
    expect(api.requisicoes.single.url.path, '/formularios/padrinho');
    expect(lista.map((r) => r.descricao), ['Cálculo I', 'AED I']);
    expect(lista.every((r) => r.obrigatorio), isTrue);
  });

  test('transição apadrinhado → padrinho: candidatura pendente, cadastro '
      'segue aprovado; aprovação e rejeição refletidas', () async {
    // 2026/2: apadrinhado aprovado (1º período)
    final api = ApiFalsa(
      cadastrado: true,
      situacao: {
        ..._situacao('apadrinhado_ativo'),
        'cadastro': {'status': 'aprovado', 'tipoParticipacao': 'apadrinhado'},
      },
    ).instalar();
    final sessao = SessaoUsuario.atual
      ..definir(dadosCadastro: _dados, escolha: Participacao.apadrinhado);
    await sessao.sincronizarSituacao();
    expect(sessao.status, StatusParticipacao.apadrinhadoAtivo);

    // novo ciclo: agora no 2º período, declara os requisitos do ciclo
    final noSegundo = _dados
        .copyWith(periodo: 2)
        .comPasso2(
          expectativaPadrinho: 'Quero retribuir.',
          outrasInformacoes: null,
          areasApoio: const ['Projetos'],
          disponibilidade: 'Noite',
          genero: 'Feminino',
          bolsistaProuni: false,
          deOutraCidade: true,
          requisitosCumpridos: const {'calculo-i': true, 'aed-i': true},
        );
    // no 1º período a opção de padrinho não aparece
    expect(sessao.podeCandidatarPadrinho, isFalse);
    // aluno atualiza o período no perfil (tela Perfil → editar)
    sessao.dados = sessao.dados!.copyWith(periodo: 2);
    expect(sessao.podeCandidatarPadrinho, isTrue);
    await sessao.registrarCandidaturaPadrinho(dadosCadastro: noSegundo);

    final envio = api.corpo(api.posts('/cadastro').single);
    expect(envio['tipoParticipacao'], 'padrinho');
    expect(envio['periodo'], 2);
    expect(sessao.status, StatusParticipacao.padrinhoEmAnalise);

    // coordenação rejeita a candidatura do ciclo: cadastro global intacto
    api.situacao = {
      ..._situacao('candidatura_rejeitada'),
      'cadastro': {'status': 'aprovado', 'tipoParticipacao': 'apadrinhado'},
    };
    await sessao.sincronizarSituacao();
    expect(sessao.status, StatusParticipacao.padrinhoRejeitado);
    expect(sessao.cadastro?.aprovado, isTrue);

    // (ou) aprova: vira padrinho ativo, cadastro continua aprovado
    api.situacao = {
      ..._situacao('padrinho_ativo'),
      'cadastro': {'status': 'aprovado', 'tipoParticipacao': 'padrinho'},
    };
    await sessao.sincronizarSituacao();
    expect(sessao.status, StatusParticipacao.padrinhoAtivo);
    expect(sessao.cadastro?.aprovado, isTrue);
  });

  test('transição sem cumprir os requisitos é recusada pelo backend', () async {
    ApiFalsa(cadastrado: true).instalar();
    await expectLater(
      SessaoUsuario.atual.registrarCandidaturaPadrinho(
        dadosCadastro: _dados.copyWith(periodo: 2),
      ),
      throwsA(
        isA<ApiException>().having(
          (e) => e.mensagem,
          'mensagem',
          contains('é preciso cumprir'),
        ),
      ),
    );
    expect(SessaoUsuario.atual.status, StatusParticipacao.nenhuma);
  });
}
