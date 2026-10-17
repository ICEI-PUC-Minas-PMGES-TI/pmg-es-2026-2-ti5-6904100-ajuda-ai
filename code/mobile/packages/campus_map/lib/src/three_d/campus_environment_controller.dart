import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import '../campus_map_features.dart';
import 'campus_3d_layers.dart';
import 'campus_asset_resolver.dart';
import 'campus_environment.dart';
import 'campus_model_manifest.dart';

/// Vegetação ou props do campus em um style carregado. Adaptado de
/// `CampusVegetationController` e `CampusPropsController` do PUCMaps (mesmo
/// padrão nos dois: source GeoJSON de pontos + modelos do style + ModelLayer),
/// sem `rootBundle`, sem camada-sonda `asset://` e sem toggles de debug.
///
/// Uma instância por seção e por style. Nunca lança: qualquer falha deixa
/// prédios e mapa como estão. Tudo é idempotente.
class CampusEnvironmentController {
  CampusEnvironmentController({
    required this.map,
    required this.set,
    required this.resolver,
    required this.isActive,
    this.onEvent,
  });

  /// Seções a instalar, na ordem (vegetação, depois props). Exige [enable3d]
  /// e a subflag da seção; seção ausente ou inválida no manifesto fica fora.
  static List<CampusEnvironmentSet> enabledSets(
    CampusMapFeatures features,
    CampusModelManifest manifest,
  ) => [
    if (features.enable3d && features.vegetation) ?manifest.vegetation,
    if (features.enable3d && features.props) ?manifest.props,
  ];

  final MapboxMap map;
  final CampusEnvironmentSet set;
  final CampusAssetResolver resolver;
  final bool Function() isActive;

  /// Marcos de tempo para o diagnóstico (`installed`, `failed`).
  final void Function(String event)? onEvent;

  StyleManager get _style => map.style;

  bool _disposed = false;
  bool _installed = false;
  bool _failed = false;
  bool _visible = true;
  Future<void>? _installing;

  bool get _alive => !_disposed && isActive();
  bool get installed => _installed;
  bool get failed => _failed;
  bool get visible => _visible;

  List<String> get layerIds => [
    for (final kind in set.kinds)
      Campus3dLayerIds.environmentLayer(set.name, kind),
  ];

  /// URLs públicas dos GLBs desta seção (diagnóstico de downloads).
  Set<String> get modelUrls => {
    for (final model in set.models) resolver.resolve(model.path).toString(),
  };

  void dispose() => _disposed = true;

  /// Erro de carregamento do Mapbox que pertence a esta seção: a source de
  /// pontos ou um dos GLBs (URL pública da versão, sem credencial). A mensagem
  /// só é comparada, nunca exibida ou registrada.
  bool owns(String? sourceId, String message) =>
      sourceId == Campus3dLayerIds.environmentSource(set.name) ||
      modelUrls.any(message.contains);

  /// Um GLB indisponível some sozinho; o resto da seção e os prédios seguem.
  void onLoadError() {
    _log('${set.name}: falha de carregamento; restante mantido');
    onEvent?.call('load-error');
  }

  /// Chamadas concorrentes compartilham a mesma instalação.
  Future<void> install() => _installing ??= _install();

  Future<void> _install() async {
    if (_installed || !_alive) return;
    try {
      final sourceId = Campus3dLayerIds.environmentSource(set.name);
      final layers = Campus3dLayers.environmentLayers(set);
      // Camadas existentes = seção já instalada neste style (modelos inclusos):
      // não há consulta de modelo do style na API, então a camada é o marco.
      final existing = [
        for (final layer in layers)
          await _style.styleLayerExists(layer['id'] as String),
      ];
      if (!_alive) return;
      if (existing.every((exists) => exists)) {
        _installed = true;
        return;
      }
      if (!await _style.styleSourceExists(sourceId) && _alive) {
        await _style.addStyleSource(
          sourceId,
          jsonEncode({
            'type': 'geojson',
            'data': Campus3dLayers.environmentGeoJson(set),
          }),
        );
      }
      for (final model in set.models) {
        if (!_alive) return;
        await _style.addStyleModel(
          Campus3dLayerIds.environmentModel(set.name, model.id),
          resolver.resolve(model.path).toString(),
        );
      }
      for (final (index, layer) in layers.indexed) {
        if (!_alive) return;
        if (existing[index]) continue;
        await _style.addStyleLayer(jsonEncode(layer), null);
      }
      if (!_alive) return;
      _installed = true;
      _log(
        '${set.name}: ${set.instances.length} instâncias, '
        '${set.models.length} modelos (${set.bytes} B)',
      );
      onEvent?.call('installed');
    } catch (error) {
      // Ambiente é decorativo: prédios, 2D e câmera seguem intactos.
      _failed = true;
      _log('${set.name} desativado: ${error.runtimeType}');
      onEvent?.call('failed');
    }
  }

  /// Só para medição A/B no diagnóstico.
  Future<void> setVisible(bool visible) async {
    _visible = visible;
    for (final id in layerIds) {
      if (!_alive || !await _style.styleLayerExists(id)) continue;
      await _style.setStyleLayerProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }
  }

  void _log(String message) {
    if (kDebugMode || kProfileMode) debugPrint('[campus3d] $message');
  }
}
