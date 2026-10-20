import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_place_layer.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final repository = LocalCampusPlaceRepository(
    loadSnapshot: () async => CampusSnapshot.parse(
      File('assets/data/campus_footprints.geojson').readAsStringSync(),
    ),
  );

  testWidgets(
    'source/layer únicos, sprites locais, troca, reload e reentrada',
    (tester) async {
      await tester.runAsync(() async {
        final controller = CampusMapController(placeRepository: repository);
        final style = _Style();
        Future<void> paint() => CampusPlaceLayer.show(
          style,
          controller.categoryFilter.value,
          isActive: () => true,
        );
        await paint();
        expect(style.points, isEmpty);
        expect(
          style.images.keys.toSet(),
          CampusPlaceCategory.values.map(CampusPlaceLayer.iconId).toSet(),
        );
        for (final image in style.images.values) {
          // O bridge Android usa BitmapFactory.decodeByteArray, exige PNG.
          expect(image.data.take(8), [137, 80, 78, 71, 13, 10, 26, 10]);
          final codec = await ui.instantiateImageCodec(image.data);
          final frame = await codec.getNextFrame();
          expect(frame.image.width, image.width);
          expect(frame.image.height, image.height);
          frame.image.dispose();
          codec.dispose();
        }
        for (final (category, count) in [
          (CampusPlaceCategory.academic, 53),
          (CampusPlaceCategory.lab, 3),
          (CampusPlaceCategory.library, 1),
          (CampusPlaceCategory.sports, 1),
        ]) {
          await controller.toggleCategory(category);
          await paint();
          await paint(); // atualização repetida não cria recursos
          expect(style.points, hasLength(count));
          expect(style.points.map((p) => p['id']).toSet(), hasLength(count));
          expect(
            style.points.every(
              (p) =>
                  p['properties']['icon'] == CampusPlaceLayer.iconId(category),
            ),
            isTrue,
          );
          expect(
            style.points.map((p) => p['geometry']['coordinates']),
            controller.categoryFilter.value.places.map((p) => p.center),
          );
        }
        expect(style.addSources, 1);
        expect(style.addLayers, 1);
        expect(style.addImages, 4);
        expect(style.layers[CampusPlaceLayer.symbols]!['slot'], 'top');
        // Style recarregado: os mesmos IDs são instalados uma única vez.
        style.sources.clear();
        style.layers.clear();
        style.images.clear();
        await paint();
        await paint();
        expect(style.points.single['id'], 'P65');
        expect(style.addSources, 2);
        expect(style.addLayers, 2);
        controller.dispose();
        // Perfil -> Mapa com um controller novo não herda o filtro anterior.
        final next = CampusMapController(placeRepository: repository);
        await CampusPlaceLayer.show(
          style,
          next.categoryFilter.value,
          isActive: () => true,
        );
        expect(style.points, isEmpty);
        expect(style.sources, hasLength(1));
        expect(style.layers, hasLength(1));
        next.dispose();
      });
    },
  );
  test('style descartado durante await não recebe novos recursos', () async {
    var active = true;
    final style = _Style()..onImageCheck = () => active = false;
    await CampusPlaceLayer.show(
      style,
      const CampusPlaceFilter(),
      isActive: () => active,
    );
    expect(style.sources, isEmpty);
    expect(style.layers, isEmpty);
    expect(style.images, isEmpty);
  });
}

class _Style implements StyleManager {
  final sources = <String, Map<String, dynamic>>{};
  final layers = <String, Map<String, dynamic>>{};
  final images = <String, MbxImage>{};
  int addSources = 0, addLayers = 0, addImages = 0;
  void Function()? onImageCheck;
  List<dynamic> get points =>
      (sources[CampusPlaceLayer.source]!['data'] as Map)['features'] as List;
  @override
  Future<bool> hasStyleImage(String id) async {
    onImageCheck?.call();
    return images.containsKey(id);
  }

  @override
  Future<void> addStyleImage(
    String id,
    double scale,
    MbxImage image,
    bool sdf,
    List<ImageStretches?> stretchX,
    List<ImageStretches?> stretchY,
    ImageContent? content,
  ) async {
    if (images.containsKey(id)) throw StateError('Sprite duplicado');
    images[id] = image;
    addImages++;
  }

  @override
  Future<bool> styleSourceExists(String id) async => sources.containsKey(id);
  @override
  Future<bool> styleLayerExists(String id) async => layers.containsKey(id);
  @override
  Future<void> addStyleSource(String id, String json) async {
    if (sources.containsKey(id)) throw StateError('Source duplicada');
    sources[id] = jsonDecode(json) as Map<String, dynamic>;
    addSources++;
  }

  @override
  Future<void> setStyleSourceProperty(
    String id,
    String property,
    Object value,
  ) async {
    sources[id]![property] = property == 'data'
        ? jsonDecode(value as String)
        : value;
  }

  @override
  Future<void> addStyleLayer(String json, LayerPosition? position) async {
    final layer = jsonDecode(json) as Map<String, dynamic>;
    final id = layer['id'] as String;
    if (layers.containsKey(id)) throw StateError('Layer duplicada');
    layers[id] = layer;
    addLayers++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
