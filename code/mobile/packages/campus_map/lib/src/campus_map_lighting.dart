import 'dart:async';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'three_d/campus_window_lighting.dart';

/// Opções do botão "Luz" do PUCMaps (`_lightTestOptions`): `null` segue o
/// horário; as demais fixam um preset do Mapbox Standard.
enum CampusLightMode {
  auto(null, 'Auto'),
  dawn('dawn', 'Amanhecer'),
  day('day', 'Dia'),
  dusk('dusk', 'Entardecer'),
  night('night', 'Noite');

  const CampusLightMode(this.preset, this.label);

  /// Preset fixo; `null` = pelo horário local.
  final String? preset;
  final String label;

  /// Mesma sequência do PUCMaps: Auto → Amanhecer → Dia → Entardecer → Noite.
  CampusLightMode get next => values[(index + 1) % values.length];

  /// Rótulo do botão: no automático, mostra o período em vigor.
  String labelAt(DateTime localTime) => switch (this) {
    auto => 'Auto (${forPreset(CampusLightSchedule.preset(localTime)).label})',
    _ => label,
  };

  static CampusLightMode forPreset(String preset) =>
      values.firstWhere((mode) => mode.preset == preset, orElse: () => auto);
}

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
    CampusLightMode mode = CampusLightMode.auto,
  }) : _now = now ?? DateTime.now,
       // Parâmetro nomeado não pode ser privado (`this._mode`).
       // ignore: prefer_initializing_formals
       _mode = mode;

  final StyleManager style;
  final bool Function() isActive;
  final DateTime Function() _now;
  final Future<void> Function(double glow)? onWindowGlow;
  CampusLightMode _mode;

  /// Preset em vigor: o fixado pelo usuário ou o do horário.
  String get preset => _mode.preset ?? CampusLightSchedule.preset(_now());
  double get windowGlow => CampusWindowLighting.glowFor(preset);
  CampusLightMode get mode => _mode;

  /// Troca o modo (botão "Luz") e aplica na hora; só o preset muda, sem
  /// recarregar o style.
  Future<void> setMode(CampusLightMode mode) {
    _mode = mode;
    return refresh();
  }

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
            // Contexto 2D: o volume fica só no campus próprio (o PUCMaps liga
            // o 3D do Standard, que duplicaria os prédios sob os GLBs). Como
            // no PUCMaps, POIs e transporte genéricos ficam desligados para
            // não competir com os marcadores do campus.
            for (final (key, value) in [
              ('show3dObjects', false),
              ('showPointOfInterestLabels', false),
              ('showTransitLabels', false),
            ]) {
              await style.setStyleImportConfigProperty('basemap', key, value);
              if (!_alive) return;
            }
          }
          _configured = true;
        }
        if (!_alive) return;
        final preset = this.preset;
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
