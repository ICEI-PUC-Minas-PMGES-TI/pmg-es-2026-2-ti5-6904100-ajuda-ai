import 'dart:async';
import 'dart:io' show ProcessInfo;

import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_3d_controller.dart';
import 'campus_3d_layers.dart';
import 'campus_environment_controller.dart';
import 'campus_model_manifest.dart';

/// Medições técnicas do campus 3D. Só existe com
/// `CampusMapFeatures.diagnostics`; adaptado de `campus_3d_diagnostics.dart`
/// do PUCMaps sem os A/B de debug (cores, variantes, luz, sombras, GLBs
/// individuais), que dependiam de assets descartados.
///
/// Origem de cada número (ver docs/tecnico/mapa/renderizacao-3d.md):
/// * MEDIDO pelo Mapbox (`PerformanceStatistics`, API experimental): draw
///   calls, tempo de render (mediana/máx), memória de vértices e texturas.
/// * MEDIDO pelo Mapbox (`onResourceRequest`): downloads dos assets da versão,
///   bytes, origem (rede/cache), erros e duração.
/// * MEDIDO no app: marcos de tempo desde a criação do mapa e RSS do processo.
/// * ESTIMADO: FPS = frames que o Mapbox terminou de renderizar no último
///   segundo (0 com o mapa parado, porque ele não redesenha).
class Campus3dDiagnostics implements PerformanceStatisticsListener {
  CampusModelManifest? _manifest;

  /// `<base>/campus/versions/<versão>/`: só requisições abaixo dela contam.
  String? _versionRoot;

  final Map<String, int> _expected = {};
  final Stopwatch _clock = Stopwatch()..start();
  final Map<String, int> marks = {};
  final ValueNotifier<String> status = ValueNotifier('diagnóstico: aguardando');

  MapboxMap? _map;
  Campus3dController? buildings;
  final List<CampusEnvironmentController> environment = [];

  PerformanceStatistics? _last;
  int _frames = 0;
  double _fps = 0;
  Timer? _fpsTimer;
  bool _running = false;
  bool _busy = false;
  String _ab = '';
  String _scene = '';

  final Map<String, Set<String>> _downloaded = {};

  /// Bytes por arquivo vindo da rede (um arquivo repetido conta uma vez).
  final Map<String, int> _networkBytes = {};
  int _network = 0;
  int _cache = 0;
  int _cacheMiss = 0;
  int _errors = 0;
  int _cancelled = 0;
  int _slowestMs = 0;

  /// O manifesto chega depois do style; antes disso só há marcos de tempo.
  void bind(CampusModelManifest manifest, String versionRoot) {
    _manifest = manifest;
    _versionRoot = versionRoot;
    _expected
      ..clear()
      ..addAll({
        'lod1': manifest.lod1.length,
        'lod0': manifest.lod0.length,
        if (manifest.vegetation case final set?)
          'vegetation': set.models.length,
        if (manifest.props case final set?) 'props': set.models.length,
      });
  }

  /// Primeiro instante (ms desde a criação do mapa) de cada marco.
  void mark(String name) {
    if (marks.containsKey(name)) return;
    final ms = _clock.elapsedMilliseconds;
    marks[name] = ms;
    debugPrint('[campus3d] diag t=$ms ms: $name');
  }

  /// Mapa novo (nova tela/geração). A coleta começa no primeiro frame.
  void attach(MapboxMap map) {
    if (identical(map, _map)) return;
    stop();
    _map = map;
  }

  /// O Mapbox exige um render antes de coletar estatísticas.
  void _start() {
    final map = _map;
    if (_running || map == null) return;
    _running = true;
    // API experimental do Mapbox; usada só neste modo de medição.
    // ignore: experimental_member_use
    map.startPerformanceStatisticsCollection(
      PerformanceStatisticsOptions(
        samplerOptions: [
          PerformanceSamplerOptions.CUMULATIVE,
          PerformanceSamplerOptions.PER_FRAME,
        ],
        samplingDurationMillis: 2000,
      ),
      this,
    );
    _fpsTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _fps = _frames.toDouble();
      _frames = 0;
    });
  }

  void stop() {
    _fpsTimer?.cancel();
    _fpsTimer = null;
    if (_running) {
      // ignore: experimental_member_use
      _map?.stopPerformanceStatisticsCollection();
    }
    _running = false;
  }

  void dispose() {
    stop();
    status.dispose();
  }

  /// Ligar em `MapWidget.onRenderFrameFinishedListener`.
  void onFrame(RenderFrameFinishedEventData event) {
    _frames++;
    _start();
    if (event.renderMode == RenderMode.FULL) {
      mark('mapa: primeiro frame completo');
    }
  }

  /// Ligar em `MapWidget.onResourceRequestListener`. Só URLs da versão; nada
  /// do SDK (que pode trazer tokens) é registrado.
  void onResource(ResourceEventData event) {
    final root = _versionRoot;
    final url = event.request.url;
    if (root == null || !url.startsWith(root)) return;
    final path = Uri.parse(url).path;
    final relative = path.substring(Uri.parse(root).path.length);
    final parts = relative.split('/');
    final category = parts.length > 2 && parts.first == 'models'
        ? parts[1]
        : parts.first;
    // O ResourceLoader repete o mesmo evento da camada de rede (mesmo
    // arquivo, mesmo download): conta-se só a origem real.
    if (event.dataSource == DataSourceType.RESOURCE_LOADER) return;
    final response = event.response;
    // O Mapbox cancela e repete pedidos ao reprocessar o style: não é erro.
    if (event.cancelled || response == null) {
      _cancelled++;
      return;
    }
    if (response.error case final error?) {
      // Consulta ao cache local antes da rede: ausência não é falha.
      if (event.dataSource != DataSourceType.NETWORK &&
          error.reason == ResponseErrorReason.NOT_FOUND) {
        _cacheMiss++;
        return;
      }
      _errors++;
      debugPrint('[campus3d] diag erro ${error.reason.name}: $relative');
      return;
    }
    final ms = event.timeInterval.end
        .difference(event.timeInterval.begin)
        .inMilliseconds;
    if (ms > _slowestMs) _slowestMs = ms;
    if (response.source == ResponseSourceType.NETWORK) {
      _network++;
      _networkBytes[relative] = response.size;
      debugPrint(
        '[campus3d] diag rede $relative ${response.size} B $ms ms '
        '(${event.dataSource.name})',
      );
    } else {
      _cache++;
    }
    final done = _downloaded.putIfAbsent(category, () => {})..add(relative);
    mark('$category:primeiro download');
    if (done.length == _expected[category]) {
      mark('$category:downloads completos');
    }
  }

  @override
  void onPerformanceStatisticsCollected(PerformanceStatistics statistics) {
    _last = statistics;
    final c = statistics.cumulativeStatistics;
    final render = statistics.mapRenderDurationStatistics;
    final top =
        statistics.perFrameStatistics?.topRenderLayers
            .take(4)
            .map((l) => '${l.name} ${l.durationMillis.toStringAsFixed(2)}')
            .join(', ') ??
        '-';
    final rss = ProcessInfo.currentRss / (1024 * 1024);
    final perf =
        'fps≈${_fps.toStringAsFixed(0)} | render med ${render.medianMillis.toStringAsFixed(1)} '
        'máx ${render.maxMillis.toStringAsFixed(1)} ms | draws ${c?.drawCalls ?? '?'}\n'
        'vtx ${_mb(c?.vertexBytes)} MB | tex ${_mb(c?.textureBytes)} MB | RSS ${rss.toStringAsFixed(0)} MB';
    final net =
        'assets: rede ${_networkBytes.length} arq. (${_networkBytes.values.fold(0, (a, b) => a + b)} B, '
        '$_network respostas) | cache $_cache (miss $_cacheMiss) | erros $_errors | '
        'cancelados $_cancelled | '
        'mais lento $_slowestMs ms\n'
        '${_expected.keys.map((k) => '$k ${_downloaded[k]?.length ?? 0}/${_expected[k]}').join(' | ')}';
    final b = buildings;
    final env = environment
        .map(
          (e) =>
              '${e.set.name} ${e.failed
                  ? 'FALHOU'
                  : e.installed
                  ? (e.visible ? 'ON' : 'OFF')
                  : '-'} (${e.set.instances.length})',
        )
        .join(' | ');
    final lods = b == null
        ? '3D: -'
        : 'LOD1 ${b.lod1Requested ? 'pedido' : '-'} | LOD0 ${b.lod0Requested.length}/${_manifest?.lod0.length}'
              '${env.isEmpty ? '' : ' | $env'}';
    debugPrint(
      '[campus3d] diag ${perf.replaceAll('\n', ' | ')} | ${net.replaceAll('\n', ' | ')} | $lods | top: $top',
    );
    unawaited(_refreshScene());
    status.value = [
      perf,
      net,
      lods,
      if (_scene.isNotEmpty) _scene,
      if (_ab.isNotEmpty) _ab,
    ].join('\n');
  }

  /// Zoom → LOD esperado e instâncias ambientais desenhadas agora.
  Future<void> _refreshScene() async {
    final map = _map;
    if (map == null || _busy) return;
    _busy = true;
    try {
      final zoom = (await map.getCameraState()).zoom;
      final lod = zoom >= Campus3dLod.lod0MinZoom
          ? 'LOD0'
          : zoom >= Campus3dLod.lod1MinZoom
          ? 'LOD1'
          : 'LOD2 (extrusão)';
      final drawn = <String>[];
      for (final env in environment) {
        if (!env.installed) continue;
        drawn.add('${env.set.name} ${await _rendered(map, env.layerIds)}');
      }
      _scene =
          'zoom ${zoom.toStringAsFixed(2)} → $lod'
          '${drawn.isEmpty ? '' : ' | na tela: ${drawn.join(', ')}'}';
    } catch (_) {
      _scene = '';
    } finally {
      _busy = false;
    }
  }

  static Future<int> _rendered(MapboxMap map, List<String> layers) async {
    final size = await map.getSize();
    final hits = await map.queryRenderedFeatures(
      RenderedQueryGeometry.fromScreenBox(
        ScreenBox(
          min: ScreenCoordinate(x: 0, y: 0),
          max: ScreenCoordinate(x: size.width, y: size.height),
        ),
      ),
      RenderedQueryOptions(layerIds: layers),
    );
    return hits.length;
  }

  /// Mesma câmera: draw calls e render (mediana) com o ambiente ligado e
  /// desligado. Mede quanto vegetação/props custam naquele enquadramento.
  Future<void> environmentAB() async {
    await _ab2('ambiente', (visible) async {
      for (final env in environment) {
        await env.setVisible(visible);
      }
    });
    // Cada seção sozinha: separa o custo das árvores e dos props.
    for (final env in [...environment]) {
      await _ab2(env.set.name, env.setVisible);
    }
  }

  /// Mesmo teste para os GLBs de prédios (LOD1 + chunks LOD0 pedidos): o
  /// gargalo histórico de draw calls do PUCMaps.
  Future<void> buildingsAB() => _ab2('prédios GLB', (visible) async {
    final b = buildings;
    final map = _map;
    if (b == null || map == null) return;
    for (final id in [
      Campus3dLayerIds.lod1Layer,
      for (final chunk in b.lod0Requested) Campus3dLayerIds.lod0Layer(chunk),
    ]) {
      if (!await map.style.styleLayerExists(id)) continue;
      await map.style.setStyleLayerProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }
  });

  Future<void> _ab2(
    String label,
    Future<void> Function(bool visible) setVisible,
  ) async {
    if (_map == null || _busy) return;
    _busy = true;
    try {
      Future<(int?, double?)> sample() async {
        await _settle();
        return (
          _last?.cumulativeStatistics?.drawCalls,
          _last?.mapRenderDurationStatistics.medianMillis,
        );
      }

      await setVisible(true);
      final on = await sample();
      await setVisible(false);
      final off = await sample();
      await setVisible(true);
      final delta = on.$1 != null && off.$1 != null ? on.$1! - off.$1! : null;
      final zoom = (await _map!.getCameraState()).zoom.toStringAsFixed(2);
      _ab =
          'A/B $label (z $zoom): draws ON ${on.$1} OFF ${off.$1} (Δ $delta) | '
          'render med ON ${on.$2?.toStringAsFixed(1)} OFF ${off.$2?.toStringAsFixed(1)} ms';
      debugPrint('[campus3d] diag $_ab');
    } finally {
      _busy = false;
    }
  }

  /// Duas janelas de amostragem: a primeira pode misturar o estado anterior.
  /// O Mapbox só amostra quando renderiza; parado, não redesenha. Pede
  /// repintura (mesma câmera) até a amostra chegar.
  Future<void> _settle() async {
    for (var i = 0; i < 2; i++) {
      _last = null;
      final deadline = DateTime.now().add(const Duration(seconds: 6));
      while (_last == null && DateTime.now().isBefore(deadline)) {
        await _map?.triggerRepaint();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    }
  }

  /// Resumo dos marcos para o log (`[campus3d] diag marcos ...`).
  String timeline() =>
      (marks.entries.toList()..sort((a, b) => a.value.compareTo(b.value)))
          .map((e) => '${e.key}=${e.value}ms')
          .join(' | ');

  static String _mb(int? bytes) =>
      bytes == null ? '?' : (bytes / (1024 * 1024)).toStringAsFixed(1);
}

/// Painel técnico sobre o mapa. Só é montado com `diagnostics=true`.
class Campus3dDiagnosticsPanel extends StatelessWidget {
  const Campus3dDiagnosticsPanel({super.key, required this.diagnostics});

  final Campus3dDiagnostics diagnostics;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xcc000000),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            IgnorePointer(
              child: ValueListenableBuilder<String>(
                valueListenable: diagnostics.status,
                builder: (_, text, _) => Text(
                  text,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),
            Row(
              children: [
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: diagnostics.environmentAB,
                  child: const Text('A/B ambiente'),
                ),
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: diagnostics.buildingsAB,
                  child: const Text('A/B prédios'),
                ),
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: () => debugPrint(
                    '[campus3d] diag marcos ${diagnostics.timeline()}',
                  ),
                  child: const Text('Marcos'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
