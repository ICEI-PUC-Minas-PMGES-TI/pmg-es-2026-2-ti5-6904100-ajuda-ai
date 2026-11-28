import 'dart:async';

import 'package:flutter/material.dart';

/// Atualização em segundo plano que conserva os widgets e rascunhos da tela.
class RevalidarParticipacao extends StatefulWidget {
  const RevalidarParticipacao({
    super.key,
    required this.atualizar,
    required this.child,
  });
  final Future<Object?> Function() atualizar;
  final Widget child;
  @override
  State<RevalidarParticipacao> createState() => _RevalidarParticipacaoState();
}

class _RevalidarParticipacaoState extends State<RevalidarParticipacao>
    with WidgetsBindingObserver {
  Timer? _timer;
  bool _ocupado = false, _primeiroPlano = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _consultar());
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _consultar());
  }

  Future<void> _consultar() async {
    if (!mounted ||
        _ocupado ||
        !_primeiroPlano ||
        !(ModalRoute.of(context)?.isCurrent ?? true)) {
      return;
    }
    _ocupado = true;
    try {
      await widget.atualizar();
    } catch (_) {
      /* O dono dos dados apresenta a falha. */
    } finally {
      _ocupado = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _primeiroPlano = state == AppLifecycleState.resumed;
    if (_primeiroPlano) unawaited(_consultar());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
