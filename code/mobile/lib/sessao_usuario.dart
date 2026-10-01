import 'models/ciclo_participacao.dart';
import 'dados_cadastro.dart';
import 'services/participacoes_api.dart';
import 'status_participacao.dart';
import 'tela_participacao.dart';
import 'widgets/app_bottom_navigation.dart';

/// Estado de sessão do protótipo — preenchido após o cadastro/escolha.
class SessaoUsuario {
  SessaoUsuario._();

  static final SessaoUsuario atual = SessaoUsuario._();

  /// Controla se as inscrições de apadrinhamento estão abertas.
  static bool inscricoesApadrinhamentoAbertas = true;

  DadosCadastro? dados;
  Participacao? participacao;
  StatusParticipacao status = StatusParticipacao.nenhuma;
  DateTime? candidaturaEnviadaEm;
  List<CicloParticipacao> historicoParticipacoes = const [];

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

  /// Identificador usado nas APIs de participação (e-mail preferencial).
  String get usuarioIdHistorico =>
      (dados?.email.trim().isNotEmpty == true
              ? dados!.email.trim()
              : 'anonimo')
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

  void atualizarHistorico(List<CicloParticipacao> ciclos) {
    historicoParticipacoes = List.unmodifiable(ciclos);
  }

  Future<void> registrarCandidaturaPadrinho({
    required DadosCadastro dadosCadastro,
    DateTime? enviadaEm,
  }) async {
    definir(
      dadosCadastro: dadosCadastro,
      escolha: Participacao.padrinho,
      statusParticipacao: StatusParticipacao.padrinhoEmAnalise,
      enviadaEm: enviadaEm ?? DateTime.now(),
    );

    try {
      final ciclo = await _api.registrarCandidaturaPadrinho(
        usuarioId: usuarioIdHistorico,
      );
      final atualizado = [
        ciclo,
        ...historicoParticipacoes.where(
          (item) =>
              !(item.semestre == ciclo.semestre &&
                  item.papel == PapelCiclo.candidato),
        ),
      ];
      atualizarHistorico(atualizado);
    } catch (_) {
      // Mantém o estado local do perfil mesmo se a API estiver indisponível.
      // O histórico será sincronizado na próxima abertura da tela.
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
      final filtrado = historicoParticipacoes.where((item) {
        if (item.id != null && ciclo.id != null) {
          return item.id != ciclo.id;
        }
        return !(item.semestre == ciclo.semestre && item.papel == ciclo.papel);
      });
      atualizarHistorico([ciclo, ...filtrado]);
      status = papel == 'padrinho'
          ? StatusParticipacao.padrinhoAtivo
          : StatusParticipacao.apadrinhadoAtivo;
    } catch (_) {
      // Sem backend disponível, só atualiza o status da sessão.
      status = papel == 'padrinho'
          ? StatusParticipacao.padrinhoAtivo
          : StatusParticipacao.apadrinhadoAtivo;
    }
  }

  void limpar() {
    dados = null;
    participacao = null;
    status = StatusParticipacao.nenhuma;
    candidaturaEnviadaEm = null;
    historicoParticipacoes = const [];
    _api = ParticipacoesApi();
  }
}
