import 'package:flutter/foundation.dart';

import 'dados_cadastro.dart';
import 'models/ciclo_participacao.dart';
import 'models/formulario.dart';
import 'models/situacao_participacao.dart';
import 'services/api_config.dart';
import 'services/participacoes_api.dart';
import 'status_participacao.dart';
import 'tela_participacao.dart';
import 'widgets/app_bottom_navigation.dart';

/// Estado de sessão do aluno — preenchido após o cadastro/escolha.
///
/// Ainda não há login Microsoft: o envio do cadastro (`POST /cadastro`) e o
/// login demo devolvem o token do aluno, que passa a identificar todas as
/// chamadas (sem `x-user-id`). As regras (período × modalidade, aprovação)
/// ficam no backend; o app só reflete o que a API responde.
///
/// O envio só conta quando a API confirma: sem conexão
/// ([ApiIndisponivelException]) ou com erro ([ApiException]) nada muda
/// localmente e a tela mostra o erro para o aluno tentar de novo — o cadastro
/// precisa existir no backend para ir à análise da coordenação.
class SessaoUsuario {
  SessaoUsuario._();

  static final SessaoUsuario atual = SessaoUsuario._();

  /// Controla se as inscrições de apadrinhamento estão abertas.
  static bool inscricoesApadrinhamentoAbertas = true;

  static const preferenciasPadrao = <String, bool>{
    'notificacoesAvisos': true,
    'notificacoesMensagens': true,
    'notificacoesEncontros': true,
    'notificacoesFeed': false,
    'perfilVisivel': true,
    'mostrarCursoPeriodo': true,
    'mostrarInteresses': true,
  };

  DadosCadastro? dados;
  Participacao? participacao;
  StatusParticipacao status = StatusParticipacao.nenhuma;
  DateTime? candidaturaEnviadaEm;
  List<CicloParticipacao> historicoParticipacoes = const [];

  /// Última resposta de `GET /participacoes/situacao` (null = nunca sincronizou).
  SituacaoParticipacao? situacao;

  /// Preferências de notificação e privacidade (apenas em memória).
  final Map<String, bool> preferencias = Map.of(preferenciasPadrao);

  /// Escala extra de texto aplicada no app inteiro (Aparência e acessibilidade).
  final ValueNotifier<double> escalaTexto = ValueNotifier(1.0);

  ParticipacoesApi _api = ParticipacoesApi();

  ParticipacoesApi get participacoesApi => _api;

  /// Permite injetar API nos testes.
  void configurarApi(ParticipacoesApi api) => _api = api;

  bool get ehExplorar => status == StatusParticipacao.explorar;

  bool get ehPadrinhoEmAnalise =>
      status == StatusParticipacao.padrinhoEmAnalise;

  bool get ehPadrinhoAtivo => status == StatusParticipacao.padrinhoAtivo;

  bool get ehApadrinhadoAtivo => status == StatusParticipacao.apadrinhadoAtivo;

  /// Token do aluno (null enquanto não há cadastro/login).
  String? get accessToken => _api.accessToken;

  /// Cadastro global (pendente/aprovado/rejeitado) vindo do backend.
  CadastroSituacao? get cadastro => situacao?.cadastro;

  /// Motivo informado pela coordenação ao rejeitar o cadastro, se houver.
  String? get motivoRejeicao => cadastro?.motivoRejeicao;

  int get periodo => dados?.periodo ?? 1;

  PessoaVinculo? get padrinho => situacao?.padrinho;

  List<PessoaVinculo> get apadrinhados => situacao?.apadrinhados ?? const [];

  String? get grupo => situacao?.grupo;

  Map<String, dynamic>? get registro => situacao?.registro;

  List<EtapaPrograma> get etapas => situacao?.programa?.etapas ?? const [];

  String get programaAtual => situacao?.programa?.codigo ?? '2026/2';

  /// Identificador usado nas APIs de participação (e-mail preferencial).
  String get usuarioIdHistorico => _idDe(dados);

  static String _idDe(DadosCadastro? dados) =>
      (dados?.email.trim().isNotEmpty == true ? dados!.email.trim() : 'anonimo')
          .toLowerCase();

  List<AppDestination> get destinos => ehExplorar
      ? const [AppDestination.mapa, AppDestination.perfil]
      : AppDestination.values;

  bool get podeCandidatarPadrinho =>
      periodo > 1 &&
      status != StatusParticipacao.padrinhoEmAnalise &&
      status != StatusParticipacao.padrinhoAtivo;

  bool get podeCandidatarApadrinhado =>
      periodo == 1 &&
      inscricoesApadrinhamentoAbertas &&
      status != StatusParticipacao.apadrinhadoAtivo &&
      status != StatusParticipacao.apadrinhadoAguardandoMatch &&
      status != StatusParticipacao.apadrinhadoPendente &&
      status != StatusParticipacao.apadrinhadoRejeitado;

  void definir({
    required DadosCadastro dadosCadastro,
    required Participacao escolha,
    StatusParticipacao? statusParticipacao,
    DateTime? enviadaEm,
  }) {
    dados = dadosCadastro;
    participacao = escolha;
    status =
        statusParticipacao ??
        switch (escolha) {
          Participacao.explorar => StatusParticipacao.explorar,
          Participacao.padrinho => StatusParticipacao.padrinhoEmAnalise,
          Participacao.apadrinhado =>
            StatusParticipacao.apadrinhadoAguardandoMatch,
        };
    if (enviadaEm != null) {
      candidaturaEnviadaEm = enviadaEm;
    } else if (status == StatusParticipacao.padrinhoEmAnalise ||
        status == StatusParticipacao.apadrinhadoAguardandoMatch) {
      candidaturaEnviadaEm ??= DateTime.now();
    }
  }

  /// Guarda os dados do passo 1 e a escolha, sem marcar envio: o status só
  /// muda quando o cadastro/candidatura é enviado.
  void iniciarCadastro({
    required DadosCadastro dadosCadastro,
    required Participacao escolha,
  }) {
    dados = dadosCadastro;
    participacao = escolha;
  }

  void atualizarHistorico(List<CicloParticipacao> ciclos) {
    historicoParticipacoes = List.unmodifiable(ciclos);
  }

  void _registrarNoHistorico(CicloParticipacao ciclo) {
    final filtrado = historicoParticipacoes.where((item) {
      if (item.id != null && ciclo.id != null) return item.id != ciclo.id;
      return !(item.semestre == ciclo.semestre && item.papel == ciclo.papel);
    });
    atualizarHistorico([ciclo, ...filtrado]);
  }

  /// Envia (ou reenvia, em "Editar candidatura") o cadastro como padrinho
  /// via `POST /cadastro`. O cadastro fica PENDENTE até a coordenação decidir.
  /// Lança [ApiException] se o backend recusar (ex.: 1º período) e
  /// [ApiIndisponivelException] sem conexão — em ambos, nada muda localmente.
  Future<void> registrarCandidaturaPadrinho({
    required DadosCadastro dadosCadastro,
    DateTime? enviadaEm,
  }) async {
    final jaEnviada =
        status == StatusParticipacao.padrinhoEmAnalise &&
        candidaturaEnviadaEm != null;
    final ciclo = await _enviarCadastro(
      dadosCadastro,
      tipo: 'padrinho',
      respostas: dadosCadastro.respostasPadrinho(),
    );
    definir(
      dadosCadastro: dadosCadastro,
      escolha: Participacao.padrinho,
      statusParticipacao: StatusParticipacao.padrinhoEmAnalise,
      enviadaEm: enviadaEm ?? (jaEnviada ? null : DateTime.now()),
    );
    _registrarNoHistorico(ciclo);
  }

  /// Envia o cadastro do apadrinhado (Revise suas informações → Enviar).
  /// Fica aguardando a aprovação da coordenação. Mesmo contrato de
  /// [registrarCandidaturaPadrinho].
  Future<void> cadastrarApadrinhado({
    required DadosCadastro dadosCadastro,
  }) async {
    final ciclo = await _enviarCadastro(
      dadosCadastro,
      tipo: 'apadrinhado',
      respostas: dadosCadastro.respostasApadrinhado(),
    );
    definir(
      dadosCadastro: dadosCadastro,
      escolha: Participacao.apadrinhado,
      statusParticipacao: ciclo.status == StatusCiclo.emAndamento
          ? StatusParticipacao.apadrinhadoAguardandoMatch
          : StatusParticipacao.apadrinhadoPendente,
      enviadaEm: DateTime.now(),
    );
    _registrarNoHistorico(ciclo);
  }

  /// `POST /cadastro` (mesmo endpoint e regras do web). Guarda o token.
  Future<CicloParticipacao> _enviarCadastro(
    DadosCadastro dadosCadastro, {
    required String tipo,
    required Map<String, dynamic> respostas,
  }) async {
    final resultado = await _api.cadastrar(
      nome: dadosCadastro.nome,
      email: _idDe(dadosCadastro),
      curso: dadosCadastro.curso,
      periodo: dadosCadastro.periodo,
      turno: dadosCadastro.turno,
      interesses: dadosCadastro.interesses,
      tipoParticipacao: tipo,
      respostas: respostas,
    );
    return resultado.participacao;
  }

  /// Garante o token do aluno já cadastrado (login demo por e-mail, no lugar
  /// do Microsoft). Sem cadastro, segue sem token.
  Future<void> _garantirToken() async {
    if (_api.accessToken != null || dados == null) return;
    try {
      await _api.entrar(usuarioIdHistorico);
    } catch (_) {
      // sem rede: a sincronização abaixo também vai falhar e é tratada lá
    }
  }

  /// Busca a situação real no backend e atualiza o estado da sessão.
  ///
  /// Tolerante a falhas: sem dados de cadastro, sem rede ou com erro, mantém o
  /// estado local e devolve `false`. Se o backend disser `nenhuma` mas houver
  /// um envio feito offline nesta sessão, o estado local é preservado.
  Future<bool> sincronizarSituacao() async {
    if (dados == null) return false;
    await _garantirToken();
    try {
      final resposta = await _api.situacao(usuarioIdHistorico);
      situacao = resposta;
      final novo = statusDaSituacao(resposta.situacao);
      if (novo != null) {
        status = novo;
        participacao = switch (novo) {
          StatusParticipacao.padrinhoEmAnalise ||
          StatusParticipacao.padrinhoAtivo ||
          StatusParticipacao.padrinhoRejeitado => Participacao.padrinho,
          StatusParticipacao.apadrinhadoPendente ||
          StatusParticipacao.apadrinhadoRejeitado ||
          StatusParticipacao.apadrinhadoAguardandoMatch ||
          StatusParticipacao.apadrinhadoAtivo => Participacao.apadrinhado,
          _ => participacao,
        };
        candidaturaEnviadaEm = resposta.criadoEm ?? candidaturaEnviadaEm;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Perguntas adicionais publicadas para o formulário (`padrinho` ou
  /// `apadrinhado`). Falha de rede ou formulário não publicado → lista vazia.
  Future<List<PerguntaFormulario>> carregarPerguntasAdicionais(
    String tipo,
  ) async {
    try {
      final formulario = await _api.formulario(tipo);
      if (!formulario.publicado) return const [];
      return formulario.perguntas
          .where((pergunta) => pergunta.enunciado.trim().isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Requisitos para padrinho do ciclo atual, definidos pela coordenação
  /// (mesmo endpoint do web). Lança erro se não carregar — sem eles o app
  /// não deixa enviar, para não fingir uma lista.
  Future<List<RequisitoPadrinho>> carregarRequisitosPadrinho() async {
    final formulario = await _api.formulario('padrinho');
    return formulario.requisitos;
  }

  /// Confirma ingresso efetivo (aprovação / match) — idempotente no backend.
  Future<void> confirmarParticipacaoAtiva({
    required String papel,
    String? programa,
    String? grupo,
    int? apadrinhados,
  }) async {
    try {
      final ciclo = await _api.confirmarIngresso(
        usuarioId: usuarioIdHistorico,
        papel: papel,
        programa: programa,
        grupo: grupo,
        apadrinhados: apadrinhados,
      );
      _registrarNoHistorico(ciclo);
    } catch (_) {
      // Sem backend disponível, só atualiza o status da sessão.
    }
    status = papel == 'padrinho'
        ? StatusParticipacao.padrinhoAtivo
        : StatusParticipacao.apadrinhadoAtivo;
  }

  void limpar() {
    dados = null;
    participacao = null;
    status = StatusParticipacao.nenhuma;
    candidaturaEnviadaEm = null;
    historicoParticipacoes = const [];
    situacao = null;
    preferencias
      ..clear()
      ..addAll(preferenciasPadrao);
    escalaTexto.value = 1.0;
    _api = ParticipacoesApi();
  }
}
