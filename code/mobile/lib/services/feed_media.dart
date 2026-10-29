import 'package:flutter/foundation.dart';

/// A referência do blob é a identidade; a SAS é somente um endereço temporário.
class FeedMedia extends ValueNotifier<String> {
  FeedMedia(this.referencia, String url, this.renovar)
    : _recebida = url,
      super(url);

  final String referencia;
  final Future<void> Function() renovar;
  String _recebida;
  bool _invalida = false;
  Future<void>? _renovando;
  DateTime? _ultimaTentativa;
  bool _ativa = true;

  @override
  void dispose() {
    _ativa = false;
    super.dispose();
  }

  static bool valida(String url) {
    if (url.isEmpty) return false;
    final uri = Uri.tryParse(url);
    if (uri == null) return false;
    if ((uri.scheme == 'http' || uri.scheme == 'https') && uri.host.isEmpty) {
      return false;
    }
    final expira = uri.queryParameters['se'];
    if (expira == null) return true;
    final data = DateTime.tryParse(expira);
    return data != null && data.isAfter(DateTime.now().toUtc());
  }

  void receber(String url) {
    if (!_ativa) return;
    _recebida = url;
    if (_invalida || !valida(value)) {
      _invalida = false;
      value = url;
    }
  }

  Future<void> garantirValida({bool erro = false, String? urlComErro}) async {
    if (!_ativa) return;
    if (urlComErro != null && urlComErro != value) return;
    if (!erro && !_invalida && valida(value)) return;
    _invalida = true;
    if (_recebida != value && valida(_recebida)) {
      _invalida = false;
      value = _recebida;
      return;
    }
    if (_renovando != null) return _renovando;
    // Um blob removido/indisponível não pode provocar um loop de requisições.
    final agora = DateTime.now();
    if (_ultimaTentativa != null &&
        agora.difference(_ultimaTentativa!) < const Duration(seconds: 30)) {
      return;
    }
    _ultimaTentativa = agora;
    final trabalho = renovar();
    _renovando = trabalho;
    try {
      await trabalho;
    } finally {
      _renovando = null;
    }
  }
}
