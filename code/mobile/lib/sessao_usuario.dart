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

/// Estado de sessão do protótipo — preenchido após o cadastro/escolha.
///
/// Não há login real: a identidade do aluno é o e-mail institucional do
/// cadastro, usado como `usuarioId` nas rotas `/participacoes`.
///
/// Envio sem backend: se a API não responder ([ApiIndisponivelException]),
/// o cadastro/candidatura fica salvo só nesta sessão (estado local) e o fluxo
/// segue — mesmo comportamento que o app já tinha para o padrinho. Quando a
/// API responde com erro ([ApiException]), nada muda localmente e a tela
/// mostra o erro para o aluno tentar de novo.
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
      status != StatusParticipacao.apadrinhadoAguardandoMatch;

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

  /// Envia (ou reenvia, em "Editar candidatura") a candidatura de padrinho.
  ///
  /// Retorna `true` se o backend recebeu e `false` se ficou só no estado
  /// local por falta de conexão. Lança [ApiException] se o backend recusar.
  Future<bool> registrarCandidaturaPadrinho({
    required DadosCadastro dadosCadastro,
    DateTime? enviadaEm,
  }) async {
    final jaEnviada =
        status == StatusParticipacao.padrinhoEmAnalise &&
        candidaturaEnviadaEm != null;
    void aplicarLocal() => definir(
      dadosCadastro: dadosCadastro,
      escolha: Participacao.padrinho,
      statusParticipacao: StatusParticipacao.padrinhoEmAnalise,
      enviadaEm: enviadaEm ?? (jaEnviada ? null : DateTime.now()),
    );

    try {
      final ciclo = await _api.registrarCandidaturaPadrinho(
        usuarioId: _idDe(dadosCadastro),
        respostas: dadosCadastro.respostasPadrinho(),
      );
      aplicarLocal();
      _registrarNoHistorico(ciclo);
      return true;
    } on ApiIndisponivelException {
      // Mantém o estado local do perfil mesmo se a API estiver indisponível.
      aplicarLocal();
      return false;
    }
  }

  /// Envia o cadastro do apadrinhado (Revise suas informações → Enviar).
  ///
  /// Mesmo contrato de [registrarCandidaturaPadrinho].
  Future<bool> cadastrarApadrinhado({
    required DadosCadastro dadosCadastro,
  }) async {
    void aplicarLocal() => definir(
      dadosCadastro: dadosCadastro,
      escolha: Participacao.apadrinhado,
      statusParticipacao: StatusParticipacao.apadrinhadoAguardandoMatch,
      enviadaEm: DateTime.now(),
    );

    try {
      final ciclo = await _api.cadastrarApadrinhado(
        usuarioId: _idDe(dadosCadastro),
        respostas: dadosCadastro.respostasApadrinhado(),
      );
      aplicarLocal();
      _registrarNoHistorico(ciclo);
      return true;
    } on ApiIndisponivelException {
      aplicarLocal();
      return false;
    }
  }

  /// Busca a situação real no backend e atualiza o estado da sessão.
  ///
  /// Tolerante a falhas: sem dados de cadastro, sem rede ou com erro, mantém o
  /// estado local e devolve `false`. Se o backend disser `nenhuma` mas houver
  /// um envio feito offline nesta sessão, o estado local é preservado.
  Future<bool> sincronizarSituacao() async {
    if (dados == null) return false;
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
