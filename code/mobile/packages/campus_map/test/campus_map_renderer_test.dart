import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_map_layer_ids.dart';
import 'package:campus_map/src/campus_map_renderer.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

void main() {
  late CampusSnapshot snapshot;
  setUpAll(() {
    snapshot = CampusSnapshot.parse(
      File('assets/data/campus_footprints.geojson').readAsStringSync(),
    );
  });

  test('renderer registra duas sources e cinco layers sem duplicar', () async {
    final style = _MemoryStyle();
    final renderer = CampusMapRenderer(style);
    await Future.wait([
      renderer.render(snapshot, isActive: () => true),
      renderer.render(snapshot, isActive: () => true),
    ]);
    await renderer.render(snapshot, isActive: () => true);
    expect(style.sources.keys, [
      CampusMapLayerIds.footprintsSource,
      CampusMapLayerIds.labelsSource,
    ]);
    expect(style.layers.keys, [
      CampusMapLayerIds.fill,
      CampusMapLayerIds.outline,
      CampusMapLayerIds.basemapLabelClip,
      CampusMapLayerIds.selected,
      CampusMapLayerIds.labels,
    ]);
    expect(
      style.sources[CampusMapLayerIds.footprintsSource]!['data']['features'],
      hasLength(82),
    );
    expect(
      style.sources[CampusMapLayerIds.labelsSource]!['data']['features'],
      hasLength(77),
    );

    // Um novo style perde suas sources/layers e precisa de instalação completa.
    style.sources.clear();
    style.layers.clear();
    await renderer.render(snapshot, isActive: () => true);
    expect(style.sources, hasLength(2));
    expect(style.layers, hasLength(5));
  });

  test('ciclo de vida interrompido não registra source/layer', () async {
    final style = _MemoryStyle();
    await CampusMapRenderer(style).render(snapshot, isActive: () => false);
    expect(style.sources, isEmpty);
    expect(style.layers, isEmpty);
    var active = true;
    style.onSourceCheck = () => active = false;
    await CampusMapRenderer(style).render(snapshot, isActive: () => active);
    expect(style.sources, isEmpty);
  });

  test('layers são planas, cores constantes e recorte limitado ao basemap', () {
    final layers = CampusMapRenderer.layers;
    expect(layers.map((layer) => layer['type']), [
      'fill',
      'line',
      'clip',
      'line',
      'symbol',
    ]);
    final fill = jsonEncode(layers.first['paint']);
    expect(fill, isNot(contains('zoom')));
    expect(fill, isNot(contains('height')));
    final clip = layers[2]['layout'] as Map;
    expect(clip['clip-layer-types'], ['symbol']);
    expect(clip['clip-layer-scope'], ['basemap']);
    expect(layers.last['layout']['text-allow-overlap'], isFalse);
  });

  test('labels usam âncoras reais, abreviam nomes e omitem desconhecidos', () {
    final labels =
        CampusMapRenderer.labelCollection(snapshot)['features'] as List;
    expect(labels, hasLength(77));
    for (final label in labels) {
      final feature = snapshot.features.singleWhere((f) => f.id == label['id']);
      expect(label['geometry']['coordinates'], feature.center);
    }
    expect(
      CampusMapRenderer.mapLabel('Prédio 1 - PROGRAD'),
      'Prédio 1\nPROGRAD',
    );
    expect(
      CampusMapRenderer.mapLabel('Laboratórios do IPUC - Prédio 9'),
      'Prédio 9',
    );
    expect(
      CampusMapRenderer.mapLabel('Restaurante Universitário'),
      'Restaurante Universitário',
    );
  });
}

/// Só as quatro operações usadas pelo renderer; nenhum canal nativo.
class _MemoryStyle implements StyleManager {
  final sources = <String, Map<String, dynamic>>{};
  final layers = <String, Map<String, dynamic>>{};
  void Function()? onSourceCheck;

  @override
  Future<bool> styleSourceExists(String id) async {
    onSourceCheck?.call();
    return sources.containsKey(id);
  }

  @override
  Future<bool> styleLayerExists(String id) async => layers.containsKey(id);

  @override
  Future<void> addStyleSource(String id, String properties) async {
    if (sources.containsKey(id)) throw StateError('Source duplicada.');
    sources[id] = jsonDecode(properties) as Map<String, dynamic>;
  }

  @override
  Future<void> addStyleLayer(String properties, LayerPosition? position) async {
    final layer = jsonDecode(properties) as Map<String, dynamic>;
    final id = layer['id'] as String;
    if (layers.containsKey(id)) throw StateError('Layer duplicada.');
    layers[id] = layer;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
