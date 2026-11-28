import 'dart:math';

import 'package:flutter/foundation.dart';

import 'dados_cadastro.dart';
import 'models/ciclo_participacao.dart';
import 'models/formulario.dart';
import 'models/resumo_gamificacao.dart';
import 'models/situacao_participacao.dart';
import 'services/api_config.dart';
import 'services/notificacoes_api.dart';
import 'services/participacoes_api.dart';
import 'services/pucstops_api.dart';
import 'status_participacao.dart';
import 'models/participacao.dart';
import 'models/app_destination.dart';
import 'services/diagnostico_navegacao.dart';

/// Estado da consulta de participação, separado do valor dela. Um valor nulo,
/// uma consulta em andamento ou uma falha nunca significam "sem participação".
enum EstadoSituacao {
  /// Nunca consultou nesta conta.
  desconhecido,

  /// Primeira consulta, ainda sem valor para mostrar.
  carregando,

  /// Revalidando em segundo plano; o último valor confirmado continua valendo.
  atualizando,

  /// Resposta do servidor aplicada.
  confirmada,

  /// A última consulta falhou; o último valor confirmado (se houver) fica.
  erro,
}

class _Mudancas extends ChangeNotifier {
  void avisar() => notifyListeners();
}

/// Conta institucional já autenticada. O cadastro não inventa esse par.
class IdentidadeAutenticada {
  const IdentidadeAutenticada({required this.nome, required this.email});

  final String nome;
  final String email;
}

/// Estado de sessão do aluno — preenchido após o cadastro/escolha.
///
/// [identidade] só existe depois do login Microsoft ou da escolha de um
/// usuário demo. O envio do cadastro (`POST /cadastro`) usa o e-mail dessa
/// identidade. O login demo não passa pela Microsoft e devolve o token
/// usado nas chamadas seguintes.
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
  IdentidadeAutenticada? identidade;

  /// JWT curto para completar o perfil; não acessa consultas de participação.
  String? onboardingToken;
  String? fotoUrl;
  int _versaoConta = 0;
  bool inscricoesDisponiveis = false;
  List<Map<String, dynamic>> programas = const [];
  Participacao? participacao;
  StatusParticipacao status = StatusParticipacao.nenhuma;
  DateTime? candidaturaEnviadaEm;
  List<CicloParticipacao> historicoParticipacoes = const [];

  /// Última resposta de `GET /participacoes/situacao` (null = nunca sincronizou).
  SituacaoParticipacao? situacao;

  /// Onde está a consulta de participação (ver [EstadoSituacao]).
  EstadoSituacao estadoSituacao = EstadoSituacao.desconhecido;
  String? erroSituacao;
  DateTime? _ultimaSincronizacao;
  Future<bool>? _emVoo;
  int _emVooVersao = -1;
  String? _emVooCiclo;
  int _seqSituacao = 0;
  final _mudancas = _Mudancas();

  /// Avisa quando situação, abas ou programa mudam (a casca de navegação ouve).
  Listenable get mudancas => _mudancas;

  /// Dados de participação sincronizados há pouco: telas não precisam consultar
  /// de novo só porque o usuário trocou de aba.
  bool get contextoFresco =>
      _ultimaSincronizacao != null &&
      DateTime.now().difference(_ultimaSincronizacao!) <
          const Duration(seconds: 30);

  /// Preferências de notificação e privacidade (apenas em memória).
  final Map<String, bool> preferencias = Map.of(preferenciasPadrao);

  /// Escala extra de texto aplicada no app inteiro (Aparência e acessibilidade).
  final ValueNotifier<double> escalaTexto = ValueNotifier(1.0);

  ParticipacoesApi _api = ParticipacoesApi();

  ParticipacoesApi get participacoesApi => _api;

  /// Permite injetar API nos testes.
  void configurarApi(ParticipacoesApi api) => _api = api;

  /// Saldo de MOEDAS (lojinha): `GET /me/xp` → `saldo`, ou o total devolvido
  /// por uma coleta/resgate. Nome histórico: antes do BL-50 era "o XP".
  /// `null` = ainda não lido nesta sessão (ou sem login).
  final ValueNotifier<int?> xp = ValueNotifier(null);

  /// Progresso completo (nível, XP acumulado, moedas, tetos do ciclo).
  /// `null` = ainda não carregado. Uma falha mantém o último valor válido.
  final ValueNotifier<ResumoGamificacao?> gamificacao = ValueNotifier(null);

  /// A última leitura do progresso falhou (o valor anterior, se houver, fica).
  final ValueNotifier<bool> gamificacaoFalhou = ValueNotifier(false);

  XpApi _xpApi = XpApi();

  /// API de XP (também usada pelo painel de QA).
  XpApi get xpApi => _xpApi;

  /// Permite injetar a API de XP nos testes.
  void configurarXpApi(XpApi api) => _xpApi = api;

  /// Conquista de nível a celebrar (valor do servidor). A casca do app ouve
  /// e mostra a animação; [confirmarConquista] encerra.
  final ValueNotifier<ConquistaNivel?> conquistaPendente = ValueNotifier(null);

  /// Maior nível já exibido nesta sessão: a mesma conquista não aparece duas
  /// vezes, mesmo se a confirmação ainda não chegou ao servidor.
  int _nivelExibido = 0;

  /// Identifica este aparelho (esta execução do app) perante o servidor na
  /// reivindicação da celebração; dois aparelhos nunca compartilham o id.
  final String _idDispositivo = _novoIdDispositivo();

  static String _novoIdDispositivo() {
    final aleatorio = Random.secure();
    return List.generate(
      16,
      (_) => aleatorio.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
  }

  /// Confirmação que falhou (sem rede): reenviada na próxima leitura.
  int? _confirmacaoPendente;

  /// Painel de testes da gamificação liberado PELO SERVIDOR para esta conta.
  final ValueNotifier<bool> qaGamificacao = ValueNotifier(false);
  int _qaConferidoNaVersao = -1;

  /// Pergunta à API se esta conta pode abrir o painel de QA (uma vez por
  /// conta). Qualquer falha = sem acesso: o atalho simplesmente não aparece.
  Future<void> verificarQaGamificacao() async {
    final token = accessToken;
    if (token == null || _qaConferidoNaVersao == _versaoConta) return;
    final versao = _versaoConta;
    _qaConferidoNaVersao = versao;
    try {
      await _xpApi.qaAcesso(token);
      if (versao == _versaoConta) qaGamificacao.value = true;
    } catch (_) {
      if (versao == _versaoConta) qaGamificacao.value = false;
    }
  }

  /// Pede ao servidor a vez de exibir a animação do nível [nivel]. Só um
  /// aparelho por vez recebe; qualquer falha (sem rede, conta trocada, servidor
  /// sem a reserva) vale como "não": a conquista segue pendente no servidor e
  /// é tentada de novo na próxima leitura, sem animação duplicada.
  Future<bool> reivindicarConquista(int nivel) async {
    final token = accessToken;
    if (token == null) return false;
    final versao = _versaoConta;
    try {
      final vez = await _xpApi.reivindicarCelebracao(
        token,
        nivel,
        _idDispositivo,
      );
      return vez && versao == _versaoConta && accessToken == token;
    } catch (_) {
      return false;
    }
  }

  /// A animação do nível [nivel] foi exibida: marca e avisa o servidor (que
  /// só avança e nunca concede nada). Sem rede, tenta de novo depois.
  Future<void> confirmarConquista(int nivel) async {
    if (nivel > _nivelExibido) _nivelExibido = nivel;
    if (conquistaPendente.value?.para == nivel) conquistaPendente.value = null;
    _confirmacaoPendente = _nivelExibido;
    await _enviarConfirmacao();
  }

  Future<void> _enviarConfirmacao() async {
    final token = accessToken;
    final nivel = _confirmacaoPendente;
    if (token == null || nivel == null) return;
    final versao = _versaoConta;
    try {
      await _xpApi.confirmarCelebracao(token, nivel);
      if (versao == _versaoConta && _confirmacaoPendente == nivel) {
        _confirmacaoPendente = null;
      }
    } on ApiException catch (e) {
      // 4xx: não adianta insistir (ex.: servidor sem a migration).
      final codigo = e.statusCode ?? 0;
      if (codigo >= 400 && codigo < 500 && versao == _versaoConta) {
        _confirmacaoPendente = null;
      }
    } catch (_) {
      // Sem rede: fica pendente para a próxima leitura.
    }
  }

  Future<void>? _xpEmVoo;

  /// Relê progresso e moedas (`GET /me/xp`). Sem login ou sem rede mantém o
  /// último valor válido e marca [gamificacaoFalhou]; nunca zera.
  /// Chamadas simultâneas compartilham a mesma requisição.
  Future<void> atualizarXp() => _xpEmVoo ??= _lerXp().whenComplete(() {
    _xpEmVoo = null;
  });

  Future<void> _lerXp() async {
    final token = accessToken;
    if (token == null) return;
    final versao = _versaoConta;
    // Confirmação que ficou pendente (offline) vai antes da leitura.
    await _enviarConfirmacao();
    try {
      final resumo = await _xpApi.resumo(token);
      if (versao != _versaoConta || accessToken != token) return;
      gamificacao.value = resumo;
      xp.value = resumo.moedas;
      gamificacaoFalhou.value = false;
      final conquista = resumo.celebracao;
      if (conquista != null && conquista.para > _nivelExibido) {
        conquistaPendente.value = conquista;
      }
    } catch (_) {
      if (versao != _versaoConta || accessToken != token) return;
      // Servidor antigo (sem nível) ainda informa o saldo de moedas.
      try {
        final saldo = await _xpApi.saldo(token);
        if (versao == _versaoConta && accessToken == token) xp.value = saldo;
      } catch (_) {}
      gamificacaoFalhou.value = true;
    }
  }

  /// Nome vindo da autenticação ou, depois, do cadastro em andamento.
  String? get nomeExibicao {
    final autenticado = dados?.nome.trim() ?? identidade?.nome.trim();
    if (autenticado != null && autenticado.isNotEmpty) return autenticado;
    final informado = dados?.nome.trim();
    if (informado != null && informado.isNotEmpty) return informado;
    return null;
  }

  /// Define a conta que pode completar o perfil. Não aceita nome ou e-mail vazio.
  void definirIdentidade({required String nome, required String email}) {
    final nomeLimpo = nome.trim();
    final emailLimpo = email.trim().toLowerCase();
    if (nomeLimpo.isEmpty || !emailLimpo.contains('@')) {
      throw ArgumentError('Identidade institucional inválida.');
    }
    identidade = IdentidadeAutenticada(nome: nomeLimpo, email: emailLimpo);
  }

  void iniciarOnboarding({
    required String nome,
    required String email,
    required String token,
  }) {
    _limparConta();
    definirIdentidade(nome: nome, email: email);
    onboardingToken = token;
    _api.accessToken = null;
  }

  void assumirSessao({
    required String accessToken,
    required String nome,
    required String email,
    String? curso,
    int? periodo,
    String? turno,
    List<String>? interesses,
  }) {
    _limparConta();
    definirIdentidade(nome: nome, email: email);
    onboardingToken = null;
    _api.accessToken = accessToken;
    if (curso != null && curso.isNotEmpty) {
      dados = DadosCadastro(
        nome: nome,
        email: email,
        curso: curso,
        periodo: periodo ?? 1,
        turno: turno ?? '',
        interesses: interesses ?? const [],
      );
    }
  }

  bool get ehExplorar => status.semInscricao;

  bool get ehPadrinhoEmAnalise => status.candidatura;

  bool get ehPadrinhoAtivo => status == StatusParticipacao.padrinhoAtivo;

  bool get ehApadrinhadoAtivo => status == StatusParticipacao.apadrinhadoAtivo;

  /// Token do aluno (null enquanto não há cadastro/login).
  String? get accessToken => _api.accessToken;

  /// Cadastro global (pendente/aprovado/rejeitado) vindo do backend.
  CadastroSituacao? get cadastro => situacao?.cadastro;

  /// Motivo informado pela coordenação ao rejeitar o cadastro, se houver.
  String? get motivoRejeicao =>
      (registro?['decisao'] as Map?)?['justificativa'] as String? ??
      cadastro?.motivoRejeicao;

  int get periodo => dados?.periodo ?? 1;

  PessoaVinculo? get padrinho => situacao?.padrinho;
  List<PessoaVinculo> get padrinhos => situacao?.padrinhosAtuais ?? const [];

  List<PessoaVinculo> get apadrinhados => situacao?.apadrinhados ?? const [];

  String? get grupo => situacao?.grupo;

  Map<String, dynamic>? get registro => situacao?.registro;

  List<EtapaPrograma> get etapas => situacao?.programa?.etapas ?? const [];

  String get programaAtual => _api.programa ?? situacao?.programa?.codigo ?? '';

  /// Identificador usado nas APIs de participação (e-mail preferencial).
  String get usuarioIdHistorico => _idDe(dados);

  static String _idDe(DadosCadastro? dados) =>
      (dados?.email.trim().isNotEmpty == true ? dados!.email.trim() : 'anonimo')
          .toLowerCase();

  List<AppDestination> get destinos => status.ativo
      ? AppDestination.values
      : status.participante
      ? const [
          AppDestination.mapa,
          AppDestination.missoes,
          AppDestination.feed,
          AppDestination.perfil,
        ]
      : const [AppDestination.mapa, AppDestination.perfil];

  bool get podeCandidatarPadrinho =>
      periodo > 1 && status.semInscricao && inscricoesDisponiveis;
  bool get podeCandidatarApadrinhado =>
      periodo == 1 && status.semInscricao && inscricoesDisponiveis;
  bool get perfilCompleto =>
      dados != null &&
      dados!.nome.trim().isNotEmpty &&
      dados!.curso.trim().isNotEmpty &&
      dados!.curso != 'Curso não informado' &&
      dados!.periodo > 0;

  void _limparConta() {
    erroSituacao = null;
    _versaoConta++;
    gamificacao.value = null;
    gamificacaoFalhou.value = false;
    conquistaPendente.value = null;
    _nivelExibido = 0;
    _confirmacaoPendente = null;
    qaGamificacao.value = false;
    _xpEmVoo = null;
    estadoSituacao = EstadoSituacao.desconhecido;
    _ultimaSincronizacao = null;
    _emVoo = null;
    xp.value = null;
    dados = null;
    participacao = null;
    status = StatusParticipacao.nenhuma;
    situacao = null;
    candidaturaEnviadaEm = null;
    historicoParticipacoes = const [];
    fotoUrl = null;
    programas = const [];
    inscricoesDisponiveis = false;
    _api.programa = null;
    preferencias
      ..clear()
      ..addAll(preferenciasPadrao);
    _mudancas.avisar();
  }

  void _aplicarPerfil(Map<String, dynamic> perfil) {
    // "Sobre mim" ainda não é salvo no servidor: mantém o texto local da conta.
    final sobreLocal = dados?.email == identidade!.email ? dados?.sobre : null;
    dados = DadosCadastro(
      nome: '${perfil['nome'] ?? identidade?.nome ?? ''}',
      email: identidade!.email,
      curso: '${perfil['curso'] ?? ''}',
      periodo: (perfil['periodo'] as num?)?.toInt() ?? 0,
      turno: '${perfil['turno'] ?? ''}',
      interesses: (perfil['interesses'] as List? ?? [])
          .whereType<String>()
          .toList(),
      sobre: sobreLocal,
    );
  }

  Future<void> carregarPerfil() async {
    final versao = _versaoConta;
    final perfil = await _api.perfil();
    if (versao == _versaoConta) _aplicarPerfil(perfil);
  }

  Future<void> salvarPerfil(DadosCadastro perfil) async {
    final versao = _versaoConta;
    final onboarding = onboardingToken;
    final resposta = await _api.salvarPerfil({
      'nome': perfil.nome,
      'curso': perfil.curso,
      'periodo': perfil.periodo,
      'turno': perfil.turno,
      'interesses': perfil.interesses,
    }, onboarding: onboarding);
    if (versao != _versaoConta) {
      throw const ApiException('A conta mudou. Entre novamente.');
    }
    if (onboarding != null) {
      _api.accessToken = resposta['accessToken'] as String;
      _aplicarPerfil(Map<String, dynamic>.from(resposta['usuario'] as Map));
    } else {
      _aplicarPerfil(resposta);
    }
    dados = dados?.copyWith(
      sobre: perfil.sobre,
      limparSobre: perfil.sobre == null,
    );
    onboardingToken = null;
  }

  /// Carrega perfil, ciclos e situação. NÃO zera a situação anterior: o que já
  /// foi confirmado continua valendo enquanto a revalidação roda. Quem zera é
  /// a troca de conta ou de programa.
  Future<void> carregarContexto() async {
    final versao = _versaoConta;
    await carregarPerfil();
    if (versao != _versaoConta) throw const ApiException('A conta mudou.');
    final ciclos = await _api.programas();
    if (versao != _versaoConta) throw const ApiException('A conta mudou.');
    programas = ciclos;
    final atuais = programas.where((p) => p['atual'] == true).toList();
    if (_api.programa == null && atuais.length == 1) {
      _api.programa = atuais.single['codigo'] as String;
    }
    if (_api.programa == null && programas.length == 1) {
      _api.programa = programas.single['codigo'] as String;
    }
    if (_api.programa != null || programas.isEmpty) {
      if (!await sincronizarSituacao()) {
        throw const ApiException(
          'Não foi possível consultar sua situação. Tente novamente.',
        );
      }
    }
    inscricoesDisponiveis = programas.any(
      (p) => p['codigo'] == _api.programa && p['inscricoesDisponiveis'] == true,
    );
    _mudancas.avisar();
  }

  Future<void> selecionarPrograma(String codigo) async {
    // Outro programa é outra participação: aqui sim o valor anterior sai.
    status = StatusParticipacao.nenhuma;
    situacao = null;
    participacao = null;
    candidaturaEnviadaEm = null;
    inscricoesDisponiveis = false;
    estadoSituacao = EstadoSituacao.carregando;
    _emVoo = null;
    _api.programa = codigo;
    _mudancas.avisar();
    if (!await sincronizarSituacao()) {
      throw const ApiException('Falha ao consultar o ciclo.');
    }
    inscricoesDisponiveis = programas.any(
      (p) => p['codigo'] == codigo && p['inscricoesDisponiveis'] == true,
    );
  }

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

  /// Envia a candidatura após a revisão; o backend impede duplicação.
  /// via `POST /cadastro`. O cadastro fica PENDENTE até a coordenação decidir.
  /// Lança [ApiException] se o backend recusar (ex.: 1º período) e
  /// [ApiIndisponivelException] sem conexão — em ambos, nada muda localmente.
  Future<void> registrarCandidaturaPadrinho({
    required DadosCadastro dadosCadastro,
    DateTime? enviadaEm,
  }) async {
    final daSessao = _dadosDaSessao(dadosCadastro);
    final jaEnviada =
        status == StatusParticipacao.padrinhoEmAnalise &&
        candidaturaEnviadaEm != null;
    final ciclo = await _enviarCadastro(
      daSessao,
      tipo: 'padrinho',
      respostas: daSessao.respostasPadrinho(),
    );
    definir(
      dadosCadastro: daSessao,
      escolha: Participacao.padrinho,
      statusParticipacao: switch (ciclo.status) {
        StatusCiclo.emAnalise => StatusParticipacao.padrinhoEmAnalise,
        StatusCiclo.aprovado => StatusParticipacao.padrinhoAguardandoMatching,
        _ => StatusParticipacao.padrinhoPendente,
      },
      enviadaEm: enviadaEm ?? (jaEnviada ? null : DateTime.now()),
    );
    _registrarNoHistorico(ciclo);
    await sincronizarSituacao();
  }

  /// Envia o cadastro do apadrinhado (Revise suas informações → Enviar).
  /// Fica aguardando a aprovação da coordenação. Mesmo contrato de
  /// [registrarCandidaturaPadrinho].
  Future<void> cadastrarApadrinhado({
    required DadosCadastro dadosCadastro,
  }) async {
    final daSessao = _dadosDaSessao(dadosCadastro);
    final ciclo = await _enviarCadastro(
      daSessao,
      tipo: 'apadrinhado',
      respostas: daSessao.respostasApadrinhado(),
    );
    definir(
      dadosCadastro: daSessao,
      escolha: Participacao.apadrinhado,
      statusParticipacao: ciclo.status == StatusCiclo.emAndamento
          ? StatusParticipacao.apadrinhadoAguardandoMatch
          : StatusParticipacao.apadrinhadoPendente,
      enviadaEm: DateTime.now(),
    );
    _registrarNoHistorico(ciclo);
    await sincronizarSituacao();
  }

  /// O e-mail enviado é o da identidade autenticada, nunca um padrão da tela.
  DadosCadastro _dadosDaSessao(DadosCadastro dadosCadastro) {
    final autenticado = identidade;
    if (autenticado == null) {
      throw const ApiException(
        'Entre com a conta institucional antes de enviar o cadastro.',
      );
    }
    if (dadosCadastro.email.trim().toLowerCase() == autenticado.email) {
      return dadosCadastro;
    }
    return dadosCadastro.copyWith(email: autenticado.email);
  }

  /// `POST /cadastro` (mesmo endpoint e regras do web). Guarda o token.
  Future<CicloParticipacao> _enviarCadastro(
    DadosCadastro dadosCadastro, {
    required String tipo,
    required Map<String, dynamic> respostas,
  }) async {
    final token = _api.accessToken ?? onboardingToken;
    if (token == null) {
      throw const ApiException(
        'Conclua o login Microsoft antes de enviar o cadastro.',
      );
    }
    final versao = _versaoConta;
    final resultado = await _api.cadastrar(
      autorizacao: token,
      nome: dadosCadastro.nome,
      email: _idDe(dadosCadastro),
      curso: dadosCadastro.curso,
      periodo: dadosCadastro.periodo,
      turno: dadosCadastro.turno,
      interesses: dadosCadastro.interesses,
      tipoParticipacao: tipo,
      respostas: respostas,
    );
    if (versao != _versaoConta) {
      throw const ApiException('A conta mudou durante o envio.');
    }
    onboardingToken = null;
    return resultado.participacao;
  }

  /// Consulta `GET /participacoes/situacao` e aplica a resposta.
  ///
  /// - Consultas simultâneas compartilham a mesma requisição (a menos de
  ///   [forcar], usado após uma ação que muda a situação).
  /// - Só a consulta mais recente é aplicada: resposta antiga não sobrescreve
  ///   uma mais nova, nem a de outra conta ou programa.
  /// - Falha de rede ou do servidor mantém o último valor confirmado e marca
  ///   [estadoSituacao] como erro; só uma resposta confirmada muda a
  ///   participação. O backend continua decidindo as operações protegidas.
  Future<bool> sincronizarSituacao({bool forcar = false}) {
    if (_api.accessToken == null) return Future.value(false);
    final existente = _emVoo;
    if (!forcar &&
        existente != null &&
        _emVooVersao == _versaoConta &&
        _emVooCiclo == _api.programa) {
      return existente;
    }
    final consulta = _consultarSituacao();
    _emVoo = consulta;
    _emVooVersao = _versaoConta;
    _emVooCiclo = _api.programa;
    consulta.whenComplete(() {
      if (identical(_emVoo, consulta)) _emVoo = null;
    });
    return consulta;
  }

  Future<bool> _consultarSituacao() async {
    final versao = _versaoConta;
    final ciclo = _api.programa;
    final seq = ++_seqSituacao;
    diagNav('situacao: consulta #$seq (valor atual: ${status.name})');
    estadoSituacao = situacao != null
        ? EstadoSituacao.atualizando
        : EstadoSituacao.carregando;
    _mudancas.avisar();
    try {
      final resposta = await _api.situacao(usuarioIdHistorico);
      // Conta ou programa mudou: descarta. Consulta mais nova: ela aplica.
      if (versao != _versaoConta || ciclo != _api.programa) return false;
      if (seq != _seqSituacao) return true;
      situacao = resposta;
      status = statusDaSituacao(resposta.situacao);
      participacao =
          status.candidatura || status == StatusParticipacao.padrinhoAtivo
          ? Participacao.padrinho
          : resposta.situacao.startsWith('apadrinhado')
          ? Participacao.apadrinhado
          : null;
      if (status.semInscricao && dados != null) {
        final perfil = dados!;
        dados = DadosCadastro(
          nome: perfil.nome,
          email: perfil.email,
          curso: perfil.curso,
          periodo: perfil.periodo,
          turno: perfil.turno,
          interesses: perfil.interesses,
        );
      } else if (resposta.respostas != null) {
        dados = dados?.comRespostas(
          resposta.respostas!,
          padrinho:
              status.candidatura || status == StatusParticipacao.padrinhoAtivo,
        );
      }
      candidaturaEnviadaEm = resposta.criadoEm;
      estadoSituacao = EstadoSituacao.confirmada;
      erroSituacao = null;
      _ultimaSincronizacao = DateTime.now();
      _mudancas.avisar();
      return true;
    } catch (erro) {
      if (versao != _versaoConta ||
          ciclo != _api.programa ||
          seq != _seqSituacao) {
        return false;
      }
      if (erro is ApiException && [401, 403].contains(erro.statusCode)) {
        limpar();
        erroSituacao = 'Sessão expirada ou sem acesso. Entre novamente.';
        estadoSituacao = EstadoSituacao.erro;
        _mudancas.avisar();
        return false;
      }
      // Mantém o último valor confirmado; sem nenhum, segue sem situação.
      estadoSituacao = EstadoSituacao.erro;
      erroSituacao =
          'Não foi possível atualizar sua participação. Tente novamente.';
      _mudancas.avisar();
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
    } on FormularioNaoSuportado {
      rethrow;
    } on ApiException catch (erro) {
      if (erro.statusCode == 400 &&
          erro.mensagem.toLowerCase().contains(
            'tipo de pergunta não suportado',
          )) {
        throw FormularioNaoSuportado(erro.mensagem);
      }
      rethrow;
    } catch (_) {
      rethrow;
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
    if (!await sincronizarSituacao(forcar: true) || !status.ativo) {
      throw const ApiException(
        'A participação ativa depende de vínculo confirmado pela coordenação.',
      );
    }
  }

  void limpar() {
    CentralNotificacoes.atual.limpar();
    _limparConta();
    dados = null;
    identidade = null;
    onboardingToken = null;
    participacao = null;
    status = StatusParticipacao.nenhuma;
    candidaturaEnviadaEm = null;
    historicoParticipacoes = const [];
    situacao = null;
    estadoSituacao = EstadoSituacao.desconhecido;
    preferencias
      ..clear()
      ..addAll(preferenciasPadrao);
    escalaTexto.value = 1.0;
    _api = ParticipacoesApi();
    _xpApi = XpApi();
  }
}
