import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_map_layer_ids.dart';
import 'package:campus_map/src/campus_map_renderer.dart';
import 'package:campus_map/src/three_d/campus_3d_controller.dart';
import 'package:campus_map/src/three_d/campus_3d_layers.dart';
import 'package:campus_map/src/three_d/campus_asset_resolver.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

void main() {
  const base = 'https://assets.example.invalid/map-assets';
  late CampusModelManifest manifest;
  late CampusAssetResolver resolver;

  setUpAll(() {
    manifest = CampusModelManifest.parse(
      File('assets/data/campus_models.json').readAsStringSync(),
    );
    resolver = CampusAssetResolver.tryCreate(base, manifest.version)!;
  });

  group('decisão de ligar o 3D', () {
    test('enable3d=false não cria resolver mesmo com base válida', () {
      const config = CampusMapConfig(
        mapboxAccessToken: 'pk.test',
        mapAssetsBaseUrl: base,
      );
      expect(Campus3dController.resolverFor(config, manifest), isNull);
    });

    test('3D ligado sem base pública fica indisponível, sem exceção', () {
      const config = CampusMapConfig(
        mapboxAccessToken: 'pk.test',
        features: CampusMapFeatures(enable3d: true),
      );
      expect(Campus3dController.resolverFor(config, manifest), isNull);
    });

    test('3D ligado com base HTTPS resolve pela versão do manifesto', () {
      const config = CampusMapConfig(
        mapboxAccessToken: 'pk.test',
        mapAssetsBaseUrl: base,
        features: CampusMapFeatures(enable3d: true),
      );
      final resolved = Campus3dController.resolverFor(config, manifest)!;
      expect(
        resolved.versionRoot.toString(),
        '$base/campus/versions/${manifest.version}/',
      );
    });
  });

  group('camadas e LOD', () {
    test('limiares centralizados e em ordem', () {
      expect(Campus3dLod.lod1PrefetchZoom, lessThan(Campus3dLod.lod1MinZoom));
      expect(Campus3dLod.lod1MinZoom, lessThan(Campus3dLod.lod0PrefetchZoom));
      expect(Campus3dLod.lod0PrefetchZoom, lessThan(Campus3dLod.lod0MinZoom));
      expect(Campus3dLod.lod1MinZoom, 16.5);
      expect(Campus3dLod.lod0MinZoom, 17.8);
    });

    test('extrusões cobrem faixas sem sobreposição e sem subsolo', () {
      final layers = Campus3dLayers.extrusions(manifest);
      expect(layers.map((l) => l['id']), [
        Campus3dLayerIds.lod2,
        Campus3dLayerIds.pendingLod1,
        Campus3dLayerIds.pendingLod0,
      ]);
      expect(layers[0]['maxzoom'], Campus3dLod.lod1MinZoom);
      expect(layers[1]['minzoom'], Campus3dLod.lod1MinZoom);
      expect(layers[1]['maxzoom'], Campus3dLod.lod0MinZoom);
      expect(layers[2]['minzoom'], Campus3dLod.lod0MinZoom);
      for (final layer in layers) {
        expect(layer['source'], CampusMapLayerIds.footprintsSource);
        final paint = layer['paint'] as Map;
        expect(paint['fill-extrusion-base'], ['get', 'minHeight']);
        expect(paint['fill-extrusion-height'], ['get', 'height']);
      }
    });

    test('cores fixas por prédio: sem zoom, categoria ou paleta antiga', () {
      final json = jsonEncode([
        ...Campus3dLayers.extrusions(manifest),
        ...CampusMapRenderer.layersFor(clipBasemapModels: true),
      ]).toLowerCase();
      expect(json, isNot(contains('zoom"]')));
      expect(json, isNot(contains('interpolate')));
      for (final legacy in [
        '#3388ff',
        '#7b6bb2',
        '#6f58a8',
        '#ff00ff',
        '#00e5ff',
        '#a6ff00',
        '#ffe1ac',
      ]) {
        expect(json, isNot(contains(legacy)), reason: legacy);
      }
      final color = Campus3dLayers.wallColor(manifest);
      expect(color.take(2), [
        'match',
        ['get', 'id'],
      ]);
      expect(jsonEncode(color), isNot(contains('"type"')));
    });

    test('recorte do basemap inclui modelos só com 3D ligado', () {
      List<dynamic> types(bool models) =>
          (CampusMapRenderer.layersFor(clipBasemapModels: models)[2]['layout']
                  as Map)['clip-layer-types']
              as List;
      expect(types(false), ['symbol']);
      expect(types(true), ['symbol', 'model']);
    });

    test('LOD0 pede chunks da vista, mais próximo primeiro, sem repetir', () {
      final target = manifest.lod0.firstWhere((m) => m.id == 'c09');
      final view = target.bounds;
      final wanted = Campus3dLayers.lod0Wanted(
        manifest,
        view: view,
        centerLongitude: view.longitude,
        centerLatitude: view.latitude,
        skip: const {},
      );
      expect(wanted.first.id, 'c09');
      final skipped = Campus3dLayers.lod0Wanted(
        manifest,
        view: view,
        centerLongitude: view.longitude,
        centerLatitude: view.latitude,
        skip: {'c09'},
      );
      expect(skipped.map((m) => m.id), isNot(contains('c09')));
    });
  });

  group('controller', () {
    test('instalação idempotente, LOD por zoom e URLs remotas', () async {
      final map = _FakeMap(zoom: 15.2);
      final controller = Campus3dController(
        map: map,
        manifest: manifest,
        resolver: resolver,
        isActive: () => true,
      );
      await Future.wait([controller.install(), controller.install()]);
      expect(map.memoryStyle.layers.keys, [
        Campus3dLayerIds.lod2,
        Campus3dLayerIds.pendingLod1,
        Campus3dLayerIds.pendingLod0,
      ]);
      expect(map.memoryStyle.sources, isEmpty, reason: 'visão geral = LOD2');

      map.zoom = 16.0;
      await controller.onCameraIdle();
      expect(map.memoryStyle.sources.keys, [Campus3dLayerIds.lod1Source]);
      final models =
          map.memoryStyle.sources[Campus3dLayerIds.lod1Source]!['models']
              as Map;
      expect(models, hasLength(4));
      for (final model in models.values.cast<Map>()) {
        expect(model['uri'], startsWith('$base/campus/versions/'));
        expect(model['uri'], endsWith('.glb'));
        expect(model['orientation'], [0, 0, 0]);
        expect(model.containsKey('materialOverrideNames'), isFalse);
      }
      final lod1 = map.memoryStyle.layers[Campus3dLayerIds.lod1Layer]!;
      expect(lod1['minzoom'], Campus3dLod.lod1MinZoom);
      expect(lod1['maxzoom'], Campus3dLod.lod0MinZoom);
      expect(jsonEncode(lod1['paint']), isNot(contains('model-color')));

      map.zoom = 18.0;
      await controller.onCameraIdle();
      await controller.onCameraIdle();
      expect(controller.lod0Requested, isNotEmpty);
      final chunkSources = map.memoryStyle.sources.keys
          .where((id) => id.contains('-lod0-'))
          .toList();
      expect(chunkSources.toSet(), hasLength(chunkSources.length));
      expect(
        chunkSources.length,
        controller.lod0Requested.length,
        reason: 'uma source por chunk, sem duplicar',
      );
    });

    test('falha de um GLB devolve a região à extrusão pendente', () async {
      final map = _FakeMap(zoom: 18.0);
      final controller = Campus3dController(
        map: map,
        manifest: manifest,
        resolver: resolver,
        isActive: () => true,
      );
      await controller.install();
      await Future<void>.delayed(const Duration(milliseconds: 400));
      await controller.onCameraIdle();
      final failed = controller.lod0Requested.first;
      controller.onSourceError(Campus3dLayerIds.lod0Source(failed));
      await controller.onCameraIdle();
      final filter = map.memoryStyle.properties[Campus3dLayerIds.pendingLod0]!;
      final ids = ((filter as List)[2] as List)[1] as List;
      final chunk = manifest.lod0.firstWhere((m) => m.id == failed);
      expect(ids, containsAll(chunk.buildingIds));
    });

    test('controller descartado ou inativo não toca no style', () async {
      final map = _FakeMap(zoom: 18.0);
      final controller = Campus3dController(
        map: map,
        manifest: manifest,
        resolver: resolver,
        isActive: () => false,
      );
      await controller.install();
      expect(map.memoryStyle.layers, isEmpty);

      final disposed = Campus3dController(
        map: map,
        manifest: manifest,
        resolver: resolver,
        isActive: () => true,
      )..dispose();
      await disposed.install();
      await disposed.onCameraIdle();
      expect(map.memoryStyle.layers, isEmpty);
      expect(map.memoryStyle.sources, isEmpty);
    });
  });
}

class _FakeMap implements MapboxMap {
  _FakeMap({required this.zoom});

  double zoom;
  final memoryStyle = _MemoryStyle();

  @override
  StyleManager get style => memoryStyle;

  // c09: centro do campus (Prédio 1).
  static final _center = Point(coordinates: Position(-43.9919927, -19.92402));

  @override
  Future<CameraState> getCameraState() async => CameraState(
    center: _center,
    padding: MbxEdgeInsets(top: 0, left: 0, bottom: 0, right: 0),
    zoom: zoom,
    bearing: 0,
    pitch: 45,
  );

  @override
  Future<CoordinateBounds> coordinateBoundsForCamera(
    CameraOptions camera,
  ) async => CoordinateBounds(
    southwest: Point(coordinates: Position(-43.9928, -19.9248)),
    northeast: Point(coordinates: Position(-43.9912, -19.9232)),
    infiniteBounds: false,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Só as operações usadas pelo controller; nenhum canal nativo.
class _MemoryStyle implements StyleManager {
  final sources = <String, Map<String, dynamic>>{};
  final layers = <String, Map<String, dynamic>>{};
  final properties = <String, Object>{};

  @override
  Future<bool> styleSourceExists(String id) async => sources.containsKey(id);

  @override
  Future<bool> styleLayerExists(String id) async => layers.containsKey(id);

  @override
  Future<void> addStyleSource(String id, String value) async {
    if (sources.containsKey(id)) throw StateError('Source duplicada.');
    sources[id] = jsonDecode(value) as Map<String, dynamic>;
  }

  @override
  Future<void> setStyleSourceProperties(String id, String value) async {}

  @override
  Future<void> addStyleLayer(String value, LayerPosition? position) async {
    final layer = jsonDecode(value) as Map<String, dynamic>;
    final id = layer['id'] as String;
    if (layers.containsKey(id)) throw StateError('Layer duplicada.');
    layers[id] = layer;
  }

  @override
  Future<void> setStyleLayerProperty(
    String layerId,
    String property,
    Object value,
  ) async {
    if (property == 'filter') properties[layerId] = value;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
