import 'dart:convert';
import 'dart:io';

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/three_d/campus_3d_controller.dart';
import 'package:campus_map/src/three_d/campus_3d_layers.dart';
import 'package:campus_map/src/three_d/campus_asset_resolver.dart';
import 'package:campus_map/src/three_d/campus_environment.dart';
import 'package:campus_map/src/three_d/campus_environment_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

void main() {
  const base = 'https://assets.example.invalid/map-assets';
  late String text;
  late CampusModelManifest manifest;
  late CampusAssetResolver resolver;

  setUpAll(() {
    text = File('assets/data/campus_models.json').readAsStringSync();
    manifest = CampusModelManifest.parse(text);
    resolver = CampusAssetResolver.tryCreate(base, manifest.version)!;
  });

  /// Manifesto real com uma seção alterada.
  CampusModelManifest withSection(
    String name,
    void Function(Map<String, dynamic> section) change,
  ) {
    final json = jsonDecode(text) as Map<String, dynamic>;
    change(json[name] as Map<String, dynamic>);
    return CampusModelManifest.parse(jsonEncode(json));
  }

  group('manifesto ambiental', () {
    test('versão nova; prédios iguais aos da r1 publicada', () {
      expect(manifest.version, '2026-09-30-r2');
      expect(manifest.lod0, hasLength(12));
      expect(manifest.lod1, hasLength(4));
      expect(manifest.buildings, hasLength(82));
    });

    test('vegetação válida: 4 árvores do PUCMaps em 16 pontos', () {
      final set = manifest.vegetation!;
      expect(set.name, 'vegetation');
      expect(set.models.map((m) => m.id), [
        'tree_round',
        'tree_round_b',
        'tree_cone',
        'tree_cone_b',
      ]);
      expect(set.kinds, ['tree']);
      expect(set.instances, hasLength(16));
      expect(set.bytes, 58688);
    });

    test('props válidos: área esportiva + 7 carros em 84 vagas', () {
      final set = manifest.props!;
      expect(set.kinds, ['sports', 'vehicle']);
      expect(set.models, hasLength(8));
      expect(set.instances, hasLength(85));
      expect(
        set.instances.where((i) => set.model(i.model).kind == 'vehicle'),
        hasLength(84),
      );
      expect(set.bytes, 93036);
    });

    test('caminhos relativos e dentro da pasta da seção', () {
      for (final set in [manifest.vegetation!, manifest.props!]) {
        for (final model in set.models) {
          expect(model.path, startsWith('models/${set.name}/'));
          expect(model.path, endsWith('.glb'));
          expect(Uri.parse(model.path).hasScheme, isFalse);
          expect(model.sha256, matches(RegExp(r'^[0-9a-f]{64}$')));
        }
      }
    });

    test('ids únicos e escala/giro razoáveis', () {
      for (final set in [manifest.vegetation!, manifest.props!]) {
        final ids = set.instances.map((i) => i.id).toList();
        expect(ids.toSet(), hasLength(ids.length));
        final models = set.models.map((m) => m.id).toList();
        expect(models.toSet(), hasLength(models.length));
        for (final i in set.instances) {
          expect(i.scale, inInclusiveRange(0.8, 1.2));
          expect(i.rotation, inInclusiveRange(0, 360));
        }
      }
    });

    test('nenhum debug, totem ou PucStop no manifesto publicado', () {
      final json = text.toLowerCase();
      for (final banned in [
        'debug',
        'totem',
        'pucstop',
        'torre',
        'ss_g',
        'nowin_',
        'ind_p',
      ]) {
        expect(json, isNot(contains(banned)), reason: banned);
      }
    });

    test('seção com debug, totem ou tipo desconhecido é recusada', () {
      for (final (path, kind) in [
        ('models/props/ss_g0.glb', 'vehicle'),
        ('models/props/ind_p43.glb', 'vehicle'),
        ('models/props/torre_pucstop.glb', 'vehicle'),
        ('models/props/campus_sports.glb', 'totem'),
        ('models/debug/campus_sports.glb', 'sports'),
        ('models/vegetation/campus_sports.glb', 'sports'),
        ('https://x.invalid/a.glb', 'sports'),
      ]) {
        final changed = withSection('props', (section) {
          final model = (section['models'] as List).first as Map;
          model['path'] = path;
          model['kind'] = kind;
        });
        expect(changed.props, isNull, reason: path);
        expect(changed.vegetation, isNotNull, reason: 'outra seção intacta');
        expect(changed.buildings, hasLength(82), reason: 'prédios intactos');
      }
    });

    test('ids duplicados, modelo sem uso e ponto fora do campus', () {
      final duplicated = withSection('vegetation', (section) {
        final list = section['instances'] as List;
        (list[1] as Map)['id'] = (list[0] as Map)['id'];
      });
      expect(duplicated.vegetation, isNull);

      final unused = withSection('vegetation', (section) {
        (section['models'] as List).add({
          'id': 'tree_old',
          'kind': 'tree',
          'path': 'models/vegetation/tree_old.glb',
          'bytes': 1,
          'sha256': '0' * 64,
        });
      });
      expect(unused.vegetation, isNull, reason: 'variante sem uso');

      final far = withSection('vegetation', (section) {
        ((section['instances'] as List).first as Map)['position'] = [
          -43.9,
          -19.9,
        ];
      });
      expect(far.vegetation, isNull);
    });

    test('manifesto sem seções ambientais (formato r1) segue válido', () {
      final json = jsonDecode(text) as Map<String, dynamic>
        ..remove('vegetation')
        ..remove('props');
      final r1 = CampusModelManifest.parse(jsonEncode(json));
      expect(r1.vegetation, isNull);
      expect(r1.props, isNull);
      expect(r1.lod0, hasLength(12));
    });
  });

  group('camadas ambientais', () {
    test('limiares centralizados e sem tocar nos prédios', () {
      expect(Campus3dLod.lod1MinZoom, 16.5);
      expect(Campus3dLod.lod0MinZoom, 17.8);
      expect(Campus3dLod.environmentMinZoom('tree'), 16.8);
      expect(Campus3dLod.environmentMinZoom('sports'), 15.5);
      expect(Campus3dLod.environmentMinZoom('vehicle'), 17.0);
      expect(
        () => Campus3dLod.environmentMinZoom('totem'),
        throwsArgumentError,
      );
    });

    test('uma camada por tipo, instanciada, sem sombra e sem cor própria', () {
      final layers = Campus3dLayers.environmentLayers(manifest.props!);
      expect(layers.map((l) => l['id']), [
        'campus-map-3d-props-sports',
        'campus-map-3d-props-vehicle',
      ]);
      for (final layer in layers) {
        expect(layer['type'], 'model');
        expect(layer['slot'], 'middle');
        expect((layer['layout'] as Map)['model-id'], ['get', 'model']);
        final paint = layer['paint'] as Map;
        expect(paint['model-cast-shadows'], isFalse);
        expect(paint.keys.where((k) => k.contains('color')), isEmpty);
      }
      expect(layers.first['minzoom'], Campus3dLod.sportsMinZoom);
      expect(layers.last['minzoom'], Campus3dLod.vehicleMinZoom);
    });

    test('GeoJSON: escala/giro do PUCMaps e modelo com prefixo próprio', () {
      final geo = Campus3dLayers.environmentGeoJson(manifest.vegetation!);
      final features = geo['features'] as List;
      expect(features, hasLength(16));
      final first = (features.first as Map)['properties'] as Map;
      expect(first['model'], startsWith('campus-map-3d-vegetation-tree_'));
      expect(first['scale3'], hasLength(3));
      expect((first['rot3'] as List).take(2), [0, 0]);
    });
  });

  group('flags', () {
    test('ambiente só com 3D; subflags desligam cada seção', () {
      List<String> names(CampusMapFeatures f) => [
        for (final set in CampusEnvironmentController.enabledSets(f, manifest))
          set.name,
      ];
      expect(names(const CampusMapFeatures()), isEmpty);
      expect(names(const CampusMapFeatures(enable3d: true)), [
        'vegetation',
        'props',
      ]);
      expect(
        names(const CampusMapFeatures(enable3d: true, vegetation: false)),
        ['props'],
      );
      expect(names(const CampusMapFeatures(enable3d: true, props: false)), [
        'vegetation',
      ]);
      expect(const CampusMapFeatures(enable3d: true).diagnostics, isFalse);
    });
  });

  group('controller ambiental', () {
    CampusEnvironmentController controllerFor(
      _FakeMap map,
      CampusEnvironmentSet set, {
      bool Function()? isActive,
    }) => CampusEnvironmentController(
      map: map,
      set: set,
      resolver: resolver,
      isActive: isActive ?? () => true,
    );

    test(
      'URLs remotas da versão; instalação concorrente não duplica',
      () async {
        final map = _FakeMap();
        final vegetation = controllerFor(map, manifest.vegetation!);
        await Future.wait([vegetation.install(), vegetation.install()]);
        expect(vegetation.installed, isTrue);
        expect(map.memoryStyle.sources.keys, ['campus-map-3d-vegetation']);
        expect(map.memoryStyle.layers.keys, ['campus-map-3d-vegetation-tree']);
        expect(map.memoryStyle.models, hasLength(4));
        for (final uri in map.memoryStyle.models.values) {
          expect(
            uri,
            matches(
              RegExp(
                r'^https://assets\.example\.invalid/map-assets/campus/versions/'
                r'2026-09-30-r2/models/vegetation/tree_[a-z_]+\.glb$',
              ),
            ),
          );
        }
      },
    );

    test(
      'reentrada no mesmo style não recria sources, modelos ou camadas',
      () async {
        final map = _FakeMap();
        await controllerFor(map, manifest.props!).install();
        final models = map.memoryStyle.modelAdds;
        final again = controllerFor(map, manifest.props!);
        await again.install();
        expect(again.installed, isTrue);
        expect(again.failed, isFalse);
        expect(map.memoryStyle.modelAdds, models, reason: 'sem addStyleModel');
        expect(map.memoryStyle.layers, hasLength(2));
      },
    );

    test('falha da vegetação não derruba prédios nem props', () async {
      final map = _FakeMap()..memoryStyle.failModelsWith = 'vegetation';
      final buildings = Campus3dController(
        map: map,
        manifest: manifest,
        resolver: resolver,
        isActive: () => true,
      );
      await buildings.install();
      final vegetation = controllerFor(map, manifest.vegetation!);
      final props = controllerFor(map, manifest.props!);
      await vegetation.install();
      await props.install();
      expect(vegetation.failed, isTrue);
      expect(vegetation.installed, isFalse);
      expect(props.installed, isTrue);
      expect(
        map.memoryStyle.layers.keys,
        containsAll([
          Campus3dLayerIds.lod2,
          Campus3dLayerIds.pendingLod1,
          Campus3dLayerIds.pendingLod0,
          'campus-map-3d-props-sports',
          'campus-map-3d-props-vehicle',
        ]),
      );
      expect(
        map.memoryStyle.layers.keys,
        isNot(contains('campus-map-3d-vegetation-tree')),
      );
    });

    test('falha de props não lança e mantém vegetação', () async {
      final map = _FakeMap()..memoryStyle.failModelsWith = 'props';
      final vegetation = controllerFor(map, manifest.vegetation!);
      final props = controllerFor(map, manifest.props!);
      await expectLater(props.install(), completes);
      await vegetation.install();
      expect(props.failed, isTrue);
      expect(vegetation.installed, isTrue);
    });

    test('erro de carregamento é reconhecido pela seção dona', () {
      final map = _FakeMap();
      final vegetation = controllerFor(map, manifest.vegetation!);
      final props = controllerFor(map, manifest.props!);
      final treeUrl = resolver
          .resolve(manifest.vegetation!.models.first.path)
          .toString();
      expect(vegetation.owns(null, 'Failed to load model $treeUrl'), isTrue);
      expect(props.owns(null, 'Failed to load model $treeUrl'), isFalse);
      expect(props.owns('campus-map-3d-props', ''), isTrue);
      expect(vegetation.owns('composite', 'tile error'), isFalse);
    });

    test('controller inativo ou descartado não toca no style', () async {
      final map = _FakeMap();
      await controllerFor(
        map,
        manifest.vegetation!,
        isActive: () => false,
      ).install();
      final disposed = controllerFor(map, manifest.props!)..dispose();
      await disposed.install();
      expect(map.memoryStyle.sources, isEmpty);
      expect(map.memoryStyle.layers, isEmpty);
      expect(map.memoryStyle.models, isEmpty);
    });

    test('A/B do diagnóstico só muda visibilidade', () async {
      final map = _FakeMap();
      final props = controllerFor(map, manifest.props!);
      await props.install();
      await props.setVisible(false);
      expect(props.visible, isFalse);
      expect(map.memoryStyle.visibility.values.toSet(), {'none'});
      await props.setVisible(true);
      expect(map.memoryStyle.visibility.values.toSet(), {'visible'});
    });
  });
}

class _FakeMap implements MapboxMap {
  final memoryStyle = _MemoryStyle();

  @override
  StyleManager get style => memoryStyle;

  @override
  Future<CameraState> getCameraState() async => CameraState(
    center: Point(coordinates: Position(-43.9919927, -19.92402)),
    padding: MbxEdgeInsets(top: 0, left: 0, bottom: 0, right: 0),
    zoom: 15.2,
    bearing: 0,
    pitch: 45,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Só as operações usadas pelos controllers; nenhum canal nativo. Duplicatas
/// lançam, como no Mapbox.
class _MemoryStyle implements StyleManager {
  final sources = <String, Map<String, dynamic>>{};
  final layers = <String, Map<String, dynamic>>{};
  final models = <String, String>{};
  final visibility = <String, Object>{};
  int modelAdds = 0;

  /// Simula GLB/modelo recusado para os ids que contêm este texto.
  String? failModelsWith;

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
  Future<void> addStyleModel(String modelId, String modelUri) async {
    final fail = failModelsWith;
    if (fail != null && modelId.contains(fail)) {
      throw StateError('Modelo indisponível.');
    }
    if (models.containsKey(modelId)) throw StateError('Modelo duplicado.');
    modelAdds++;
    models[modelId] = modelUri;
  }

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
    if (property == 'visibility') visibility[layerId] = value;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
