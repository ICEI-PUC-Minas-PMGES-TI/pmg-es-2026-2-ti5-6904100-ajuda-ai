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

  Future<Notificacoes> listar(String token, {int limite = 20}) async {
    final resposta = await executarRequisicao(
      () => _client.get(
        Uri.parse('$baseUrl/me/notificacoes?limite=$limite'),
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

  Future<void> marcarTodas(String token) async {
    await executarRequisicao(
      () => _client.patch(
        Uri.parse('$baseUrl/me/notificacoes/lidas'),
        headers: _cabecalhos(token),
      ),
      erroPadrao: 'Não foi possível marcar as notificações como lidas',
    );
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
    );
    try {
      final naoLidas = await api.marcarLida(token, id);
      if (!_mesmaConta(conta, token)) return;
      estado.value = Notificacoes(
        naoLidas: naoLidas,
        itens: estado.value.itens,
      );
    } catch (_) {
      if (_mesmaConta(conta, token)) await atualizar();
    }
  }

  Future<void> marcarTodas() async {
    final token = SessaoUsuario.atual.accessToken;
    if (token == null) return;
    final conta = _conta;
    estado.value = Notificacoes(
      naoLidas: 0,
      itens: [for (final n in estado.value.itens) n.lida ? n : n.comoLida()],
    );
    try {
      await api.marcarTodas(token);
    } catch (_) {
      if (_mesmaConta(conta, token)) await atualizar();
    }
  }

  void limpar() {
    _conta++;
    _emVoo = null;
    estado.value = Notificacoes.vazias;
    falhou.value = false;
  }
}
