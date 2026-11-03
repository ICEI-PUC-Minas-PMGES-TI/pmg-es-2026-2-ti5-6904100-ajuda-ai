import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/colors.dart';

final _feedbacks = Expando<OverlayEntry>();

void mostrarFeedback(BuildContext context, String texto, {bool erro = false}) {
  final overlay = Overlay.of(context, rootOverlay: true);
  _feedbacks[overlay]?.remove();
  _feedbacks[overlay]?.dispose();
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _FeedbackFlutuante(
      texto: texto,
      erro: erro,
      fechar: () {
        if (_feedbacks[overlay] != entry) return;
        _feedbacks[overlay] = null;
        entry.remove();
        entry.dispose();
      },
    ),
  );
  _feedbacks[overlay] = entry;
  overlay.insert(entry);
}

class _FeedbackFlutuante extends StatefulWidget {
  const _FeedbackFlutuante({
    required this.texto,
    required this.erro,
    required this.fechar,
  });
  final String texto;
  final bool erro;
  final VoidCallback fechar;
  @override
  State<_FeedbackFlutuante> createState() => _FeedbackFlutuanteState();
}

class _FeedbackFlutuanteState extends State<_FeedbackFlutuante>
    with SingleTickerProviderStateMixin {
  late final _animacao = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 180),
  );
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _animacao.forward();
    _timer = Timer(const Duration(milliseconds: 2400), () async {
      await _animacao.reverse();
      if (mounted) widget.fechar();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _animacao.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cor = widget.erro ? const Color(0xFFB4233C) : AppAccents.success;
    return Positioned.fill(
      child: IgnorePointer(
        child: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: FadeTransition(
                opacity: _animacao,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(0, -.35),
                    end: Offset.zero,
                  ).animate(_animacao),
                  child: Semantics(
                    liveRegion: true,
                    child: Material(
                      color: Colors.transparent,
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 320),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: widget.erro
                              ? const Color(0xFFFFEFF2)
                              : AppAccents.successBg,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: cor.withValues(alpha: .2)),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x22000000),
                              blurRadius: 18,
                              offset: Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              widget.erro
                                  ? Icons.error_outline_rounded
                                  : Icons.check_circle_rounded,
                              color: cor,
                              size: 22,
                            ),
                            const SizedBox(width: 10),
                            Flexible(
                              child: Text(
                                widget.texto,
                                style: TextStyle(
                                  fontFamily: 'Inter',
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: cor,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
