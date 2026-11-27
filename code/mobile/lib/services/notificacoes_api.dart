import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/notificacao.dart';
import '../sessao_usuario.dart';
import 'api_config.dart';

class NotificacoesApi {
  NotificacoesApi({http.Client? client, this.baseUrl = apiBaseUrl})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  Map<String, String> _cabecalhos(String token) => {
    'accept': 'application/json',
    'authorization': 'Bearer $token',
  };

  /// [antes]: id da última notificação carregada, para buscar as mais antigas.
  Future<Notificacoes> listar(
    String token, {
    int limite = 20,
    String? antes,
  }) async {
    final consulta = antes == null
        ? 'limite=$limite'
        : 'limite=$limite&antes=${Uri.encodeQueryComponent(antes)}';
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/notificacoes?$consulta'),
        headers: _cabecalhos(token),
      ),
      erroPadrao: 'Não foi possível carregar as notificações',
    );
    final dados = Notificacoes.fromJson(decodificarJson(resposta));
    if (dados == null) {
      throw const FormatException('Resposta inválida das notificações.');
    }
    return dados;
  }

  Future<int> marcarLida(String token, String id) async {
    final resposta = await executarRequisicao(
      () => _client.patch(
        Uri.parse('$baseUrl/me/notificacoes/${Uri.encodeComponent(id)}/lida'),
        headers: _cabecalhos(token),
      ),
      erroPadrao: 'Não foi possível marcar a notificação como lida',
    );
    final corpo = decodificarJson(resposta);
    return corpo is Map && corpo['naoLidas'] is int ? corpo['naoLidas'] : 0;
  }

  /// Marca como lidas [ateId] e as anteriores; devolve as não lidas que
  /// sobraram (avisos que chegaram depois da última leitura).
  Future<int> marcarTodas(String token, {String? ateId}) async {
    final resposta = await executarRequisicao(
      () => _client.patch(
        Uri.parse('$baseUrl/me/notificacoes/lidas'),
        headers: {..._cabecalhos(token), 'content-type': 'application/json'},
        body: jsonEncode(ateId == null ? {} : {'ateId': ateId}),
      ),
      erroPadrao: 'Não foi possível marcar as notificações como lidas',
    );
    final corpo = decodificarJson(resposta);
    return corpo is Map && corpo['naoLidas'] is int ? corpo['naoLidas'] : 0;
  }
}

class CentralNotificacoes {
  CentralNotificacoes._();

  static final CentralNotificacoes atual = CentralNotificacoes._();

  NotificacoesApi api = NotificacoesApi();

  final ValueNotifier<Notificacoes> estado = ValueNotifier(Notificacoes.vazias);
  final ValueNotifier<bool> falhou = ValueNotifier(false);

  Future<void>? _emVoo;
  int _conta = 0;

  Future<void> atualizar() {
    final emVoo = _emVoo;
    if (emVoo != null) return emVoo;
    late final Future<void> leitura;
    leitura = _ler(_conta).whenComplete(() {
      if (identical(_emVoo, leitura)) _emVoo = null;
    });
    return _emVoo = leitura;
  }

  bool _mesmaConta(int conta, String token) =>
      conta == _conta && SessaoUsuario.atual.accessToken == token;

  Future<void> _ler(int conta) async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) {
      estado.value = Notificacoes.vazias;
      return;
    }
    try {
      final dados = await api.listar(token);
      if (!_mesmaConta(conta, token)) return;
      estado.value = dados;
      falhou.value = false;
    } on ApiException catch (erro) {
      if (!_mesmaConta(conta, token)) return;
      if (erro.statusCode == 401 || erro.statusCode == 403) {
        estado.value = Notificacoes.vazias;
        falhou.value = false;
      } else {
        falhou.value = true;
      }
    } catch (_) {
      if (_mesmaConta(conta, token)) falhou.value = true;
    }
  }

  Future<void> marcarLida(String id) async {
    final token = SessaoUsuario.atual.accessToken;
    final conta = _conta;
    final atual = estado.value;
    final alvo = atual.itens.where((n) => n.id == id).firstOrNull;
    if (token == null || alvo == null || alvo.lida) return;
    estado.value = Notificacoes(
      naoLidas: (atual.naoLidas - 1).clamp(0, atual.naoLidas),
      itens: [for (final n in atual.itens) n.id == id ? n.comoLida() : n],
      temMais: atual.temMais,
    );
    try {
      final naoLidas = await api.marcarLida(token, id);
      if (!_mesmaConta(conta, token)) return;
      estado.value = Notificacoes(
        naoLidas: naoLidas,
        itens: estado.value.itens,
        temMais: estado.value.temMais,
      );
    } catch (_) {
      if (_mesmaConta(conta, token)) await atualizar();
    }
  }

  /// Marca até a notificação mais recente que está na tela: um aviso que
  /// chegou depois da última leitura continua não lido.
  Future<void> marcarTodas() async {
    final token = SessaoUsuario.atual.accessToken;
    final atual = estado.value;
    if (token == null || atual.itens.isEmpty) return;
    final conta = _conta;
    estado.value = Notificacoes(
      naoLidas: 0,
      itens: [for (final n in atual.itens) n.lida ? n : n.comoLida()],
      temMais: atual.temMais,
    );
    try {
      final restantes = await api.marcarTodas(
        token,
        ateId: atual.itens.first.id,
      );
      if (_mesmaConta(conta, token) && restantes > 0) await atualizar();
    } catch (_) {
      if (_mesmaConta(conta, token)) await atualizar();
    }
  }

  bool _carregandoMais = false;

  /// Busca a próxima página (mais antigas) e junta à lista.
  Future<void> carregarMais() async {
    final token = SessaoUsuario.atual.accessToken;
    final atual = estado.value;
    if (token == null || _carregandoMais || !atual.temMais) return;
    if (atual.itens.isEmpty) return;
    final conta = _conta;
    _carregandoMais = true;
    try {
      final pagina = await api.listar(token, antes: atual.itens.last.id);
      if (_mesmaConta(conta, token)) {
        estado.value = estado.value.comPagina(pagina);
      }
    } catch (_) {
      if (_mesmaConta(conta, token)) falhou.value = true;
    } finally {
      _carregandoMais = false;
    }
  }

  void limpar() {
    _conta++;
    _emVoo = null;
    estado.value = Notificacoes.vazias;
    falhou.value = false;
  }
}
