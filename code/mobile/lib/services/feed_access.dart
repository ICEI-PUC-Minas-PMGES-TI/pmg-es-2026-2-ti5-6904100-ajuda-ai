import 'dart:convert';

import 'package:http/http.dart' as http;

/// Revalida permissões sem aplicar respostas de outra sessão ou consulta.
class FeedAccess {
  FeedAccess({
    required this.client,
    required this.baseUrl,
    required this.token,
  });
  final http.Client client;
  final String baseUrl;
  final String? Function() token;
  bool _podeLer = false;
  bool _podePublicar = false;
  bool _podeInteragir = false;
  String? _tokenConfirmado;
  bool get podeLer => _tokenConfirmado == token() && _podeLer;
  bool get podePublicar => podeLer && _podePublicar;
  bool get podeInteragir => podeLer && _podeInteragir;
  String revisao = '';
  int _consulta = 0;

  void invalidar() {
    _consulta++;
    _podeLer = _podePublicar = _podeInteragir = false;
    _tokenConfirmado = null;
    revisao = '';
  }

  Future<bool> atualizar() async {
    final consulta = ++_consulta;
    final jwt = token();
    if (jwt == null || jwt.isEmpty) {
      invalidar();
      return true;
    }
    try {
      final r = await client
          .get(
            Uri.parse('$baseUrl/publicacoes/permissoes'),
            headers: {'Authorization': 'Bearer $jwt'},
          )
          .timeout(const Duration(seconds: 10));
      if (consulta != _consulta || jwt != token()) return false;
      if (r.statusCode == 401 || r.statusCode == 403) {
        invalidar();
        return true;
      }
      if (r.statusCode != 200) {
        throw const FormatException('Permissões indisponíveis.');
      }
      final p = jsonDecode(r.body) as Map<String, dynamic>;
      _tokenConfirmado = jwt;
      _podeLer = p['podeLer'] == true;
      _podePublicar = podeLer && p['podePublicar'] == true;
      _podeInteragir = podeLer && p['podeInteragir'] == true;
      revisao = '${p['revisao'] ?? ''}';
      return true;
    } catch (_) {
      if (consulta == _consulta && jwt == token()) {
        // Falha de rede não equivale a revogação, mas suspende novos comandos.
        _podePublicar = _podeInteragir = false;
      }
      return false;
    }
  }
}
