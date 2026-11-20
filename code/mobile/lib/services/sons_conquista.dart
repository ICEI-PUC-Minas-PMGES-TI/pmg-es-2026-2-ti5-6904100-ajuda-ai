import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Efeitos sonoros da animação de novo nível. Os WAVs (gerados por
/// `code/front/scripts/gerar-sons-conquista.mjs`) são os mesmos da web.
enum SomConquista {
  giro('gamificacao/sons/giro.wav'),
  conquista('gamificacao/sons/conquista.wav'),
  brilho('gamificacao/sons/brilho.wav');

  const SomConquista(this.asset);

  /// Caminho relativo a `assets/` (convenção do `AssetSource`).
  final String asset;
}

/// Toca os efeitos da conquista. Falhas de áudio (sem plugin nos testes,
/// aparelho sem saída) nunca interrompem a animação.
class SonsConquista {
  SonsConquista._();

  /// Instância usada pelo app; os testes trocam por [SonsConquista.silenciosos].
  static SonsConquista instancia = SonsConquista._();

  /// Sem áudio nenhum (testes de widget).
  factory SonsConquista.silenciosos() = _SonsSilenciosos;

  /// Opção "silenciar" (vale para a animação real e para o painel de QA).
  static final ValueNotifier<bool> silenciado = ValueNotifier(false);

  final Map<SomConquista, AudioPlayer> _players = {};

  AudioPlayer _player(SomConquista som) => _players.putIfAbsent(som, () {
    final player = AudioPlayer();
    // Efeitos curtos: modo de baixa latência, sem foco de áudio exclusivo
    // (não pausa a música do usuário).
    player.setPlayerMode(PlayerMode.lowLatency).catchError((_) {});
    player.setReleaseMode(ReleaseMode.stop).catchError((_) {});
    player
        .setAudioContext(
          AudioContextConfig(
            focus: AudioContextConfigFocus.mixWithOthers,
            respectSilence: true,
          ).build(),
        )
        .catchError((_) {});
    return player;
  });

  Future<void> tocar(SomConquista som, {double volume = 1}) async {
    if (silenciado.value) return;
    try {
      final player = _player(som);
      await player.stop();
      await player.play(AssetSource(som.asset), volume: volume);
    } catch (e) {
      if (kDebugMode) debugPrint('[sons] $som indisponível: $e');
    }
  }

  Future<void> pararTodos() async {
    for (final player in _players.values) {
      try {
        await player.stop();
      } catch (_) {}
    }
  }
}

class _SonsSilenciosos extends SonsConquista {
  _SonsSilenciosos() : super._();

  final List<SomConquista> tocados = [];

  @override
  Future<void> tocar(SomConquista som, {double volume = 1}) async {
    if (SonsConquista.silenciado.value) return;
    tocados.add(som);
  }

  @override
  Future<void> pararTodos() async {}
}

/// Para inspecionar, nos testes, o que teria tocado.
List<SomConquista> sonsTocadosEmTeste() {
  final sons = SonsConquista.instancia;
  return sons is _SonsSilenciosos ? sons.tocados : const [];
}
