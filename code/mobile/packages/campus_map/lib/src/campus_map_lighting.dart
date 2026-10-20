import 'dart:async';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'three_d/campus_window_lighting.dart';

/// Mesmas faixas locais do PUCMaps; são presets, não um cálculo solar.
abstract final class CampusLightSchedule {
  static const boundaries = [330, 540, 900, 1120];

  static String preset(DateTime localTime) {
    final minute = localTime.hour * 60 + localTime.minute;
    if (minute >= 1120 || minute < 330) return 'night';
    if (minute >= 900) return 'dusk';
    if (minute >= 540) return 'day';
    return 'dawn';
  }

  static Duration nextCheck(DateTime localTime) {
    final next = [
      for (final minute in boundaries)
        DateTime(
          localTime.year,
          localTime.month,
          localTime.day,
          minute ~/ 60,
          minute % 60,
        ),
      DateTime(localTime.year, localTime.month, localTime.day + 1, 5, 30),
    ].firstWhere((boundary) => boundary.isAfter(localTime));
    final delay = next.difference(localTime) + const Duration(seconds: 1);
    // Também percebe mudança de relógio/fuso com a tela aberta.
    return delay < const Duration(minutes: 1)
        ? delay
        : const Duration(minutes: 1);
  }
}

/// Uma instância por style. Não troca estilo/token nem modifica attribution.
class CampusMapLighting {
  CampusMapLighting(
    this.style, {
    required this.isActive,
    DateTime Function()? now,
    this.onWindowGlow,
  }) : _now = now ?? DateTime.now;

  final StyleManager style;
  final bool Function() isActive;
  final DateTime Function() _now;
  final Future<void> Function(double glow)? onWindowGlow;
  double get windowGlow =>
      CampusWindowLighting.glowFor(CampusLightSchedule.preset(_now()));
  Timer? _timer;
  Future<void> _queue = Future.value();
  String? _applied;
  bool _configured = false;
  bool _supported = false;
  bool _paused = false;
  bool _disposed = false;

  bool get _alive => !_disposed && !_paused && isActive();

  Future<void> refresh() {
    final work = _queue.then((_) async {
      if (!_alive) return;
      try {
        if (!_configured) {
          final imports = await style.getStyleImports();
          if (!_alive) return;
          _supported = imports.any((item) => item?.id == 'basemap');
          if (_supported) {
            // Mantém o contexto 2D, concentrando o volume no campus próprio.
            await style.setStyleImportConfigProperty(
              'basemap',
              'show3dObjects',
              false,
            );
          }
          _configured = true;
        }
        if (!_alive) return;
        final preset = CampusLightSchedule.preset(_now());
        if (_supported && preset != _applied) {
          await style.setStyleImportConfigProperty(
            'basemap',
            'lightPreset',
            preset,
          );
          if (_alive) _applied = preset;
        }
        if (_alive) {
          await onWindowGlow?.call(CampusWindowLighting.glowFor(preset));
        }
      } catch (_) {
        // Um style customizado/sem Standard continua utilizável.
      } finally {
        _schedule();
      }
    });
    _queue = work;
    return work;
  }

  void _schedule() {
    _timer?.cancel();
    if (!_alive || (_configured && !_supported && onWindowGlow == null)) return;
    _timer = Timer(
      CampusLightSchedule.nextCheck(_now()),
      () => unawaited(refresh()),
    );
  }

  void pause() {
    _paused = true;
    _timer?.cancel();
  }

  Future<void> resume() {
    _paused = false;
    return refresh();
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
  }
}
