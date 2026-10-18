import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:campus_map/campus_map.dart';
import 'package:campus_map/src/campus_camera_policy.dart';
import 'package:campus_map/src/campus_content_widgets.dart';
import 'package:campus_map/src/campus_map_lighting.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' hide Size;

void main() {
  group('horário local herdado do PUCMaps', () {
    for (final (hour, minute, expected) in [
      (0, 0, 'night'),
      (5, 29, 'night'),
      (5, 30, 'dawn'),
      (8, 59, 'dawn'),
      (9, 0, 'day'),
      (14, 59, 'day'),
      (15, 0, 'dusk'),
      (17, 58, 'dusk'),
      (18, 39, 'dusk'),
      (18, 40, 'night'),
      (23, 59, 'night'),
    ]) {
      test('$hour:$minute → $expected', () {
        expect(
          CampusLightSchedule.preset(DateTime(2026, 10, 18, hour, minute)),
          expected,
        );
      });
    }
    test(
      'verifica fronteira sem esperar um minuto; percebe saltos de relógio',
      () {
        expect(
          CampusLightSchedule.nextCheck(DateTime(2026, 10, 18, 14, 59, 59)),
          const Duration(seconds: 2),
        );
        expect(
          CampusLightSchedule.nextCheck(DateTime(2026, 10, 18, 23, 59)),
          const Duration(minutes: 1),
        );
      },
    );
    testWidgets(
      'tela aberta atravessa faixa; pausa não altera style e resume atualiza',
      (tester) async {
        await tester.pumpWidget(const SizedBox());
        var now = DateTime(2026, 10, 18, 14, 59, 59);
        final style = _Style();
        final lighting = CampusMapLighting(
          style,
          now: () => now,
          isActive: () => true,
        );
        await lighting.refresh();
        expect(style.config['show3dObjects'], false);
        expect(style.config['lightPreset'], 'day');
        now = DateTime(2026, 10, 18, 15, 0, 1);
        await tester.pump(const Duration(seconds: 2));
        await tester.pump();
        expect(style.config['lightPreset'], 'dusk');
        lighting.pause();
        now = DateTime(2026, 10, 18, 19);
        await tester.pump(const Duration(minutes: 2));
        expect(style.config['lightPreset'], 'dusk');
        await lighting.resume();
        expect(style.config['lightPreset'], 'night');
        lighting.dispose();
        final writes = style.writes;
        await tester.pump(const Duration(minutes: 2));
        expect(style.writes, writes);
      },
    );
    test(
      'style novo reaplica preset; mesmo style evita chamadas duplicadas',
      () async {
        final first = _Style();
        final lighting = CampusMapLighting(
          first,
          now: () => DateTime(2026, 10, 18, 6),
          isActive: () => true,
        );
        await lighting.refresh();
        await lighting.refresh();
        expect(first.writes, 2);
        lighting.dispose();
        final second = _Style();
        final replacement = CampusMapLighting(
          second,
          now: () => DateTime(2026, 10, 18, 6),
          isActive: () => true,
        );
        await replacement.refresh();
        expect(second.config['lightPreset'], 'dawn');
        replacement.dispose();
      },
    );
    test('style sem Standard e falhas não quebram o mapa', () async {
      final style = _Style()..standard = false;
      final lighting = CampusMapLighting(style, isActive: () => true);
      await lighting.refresh();
      expect(style.writes, 0);
      lighting.dispose();
      final failure = _Style()..fail = true;
      final retry = CampusMapLighting(
        failure,
        now: () => DateTime(2026, 10, 18, 19),
        isActive: () => true,
      );
      await retry.refresh();
      failure.fail = false;
      await retry.refresh();
      expect(failure.config['lightPreset'], 'night');
      retry.dispose();
    });
    test('dispose durante leitura dos imports impede escrita tardia', () async {
      final pending = Completer<List<StyleObjectInfo?>>();
      final style = _Style()..imports = pending;
      final lighting = CampusMapLighting(style, isActive: () => true);
      final work = lighting.refresh();
      await Future<void>.delayed(Duration.zero);
      lighting.dispose();
      pending.complete([StyleObjectInfo(id: 'basemap', type: 'style')]);
      await work;
      expect(style.writes, 0);
    });
  });

  group('câmera do campus', () {
    late CampusCameraPolicy policy;
    setUpAll(() {
      policy = CampusCameraPolicy(
        CampusSnapshot.parse(
          File('assets/data/campus_footprints.geojson').readAsStringSync(),
        ),
      );
    });
    test(
      'inclui todos os footprints, grafo/portões da origem e margem de 120 m',
      () {
        expect(policy.extent.north, -19.9176);
        expect(policy.extent.south, -19.9265038);
        final b = policy.navigationBounds;
        expect((b.north - policy.extent.north) * 111195, closeTo(120, .001));
        expect(policy.constrain([-43.9960127, -19.9178023]), [
          -43.9960127,
          -19.9178023,
        ]);
      },
    );
    for (final size in [
      const Size(320, 600),
      const Size(393, 780),
      const Size(800, 360),
      const Size(1024, 768),
    ]) {
      test('minZoom deriva do fit em $size, com/sem card', () {
        for (final p in [
          CampusCameraPolicy.overviewPadding(size),
          CampusCameraPolicy.routePadding(size, bottom: size.height * .5 + 68),
        ]) {
          final z = policy.minZoom(size, p);
          final world = 512 * math.pow(2, z);
          final width = (policy.extent.east - policy.extent.west) / 360 * world;
          double mercator(double lat) {
            final s = math.sin(lat * math.pi / 180);
            return .5 - math.log((1 + s) / (1 - s)) / (4 * math.pi);
          }

          final height =
              (mercator(policy.extent.north) - mercator(policy.extent.south))
                  .abs() *
              world;
          expect(
            width,
            lessThanOrEqualTo(size.width - p.left - p.right + .001),
          );
          expect(
            height,
            lessThanOrEqualTo(size.height - p.top - p.bottom + .001),
          );
          expect(
            size.height - p.top - p.bottom,
            greaterThanOrEqualTo(math.min(160, size.height * .4) - .001),
          );
          expect(z, inInclusiveRange(12, 17));
          final bounds = policy.mapBounds(size, z);
          expect(
            bounds.southwest.coordinates.lng,
            lessThan(policy.navigationBounds.west),
          );
          expect(
            bounds.northeast.coordinates.lat,
            greaterThan(policy.navigationBounds.north),
          );
        }
      });
    }
    test(
      'centro não escapa por norte/sul/leste/oeste, GPS ou foco externo',
      () {
        final b = policy.navigationBounds;
        expect(policy.constrain([b.longitude, b.north + 1]), [
          b.longitude,
          b.north,
        ]);
        expect(policy.constrain([b.longitude, b.south - 1]), [
          b.longitude,
          b.south,
        ]);
        expect(policy.constrain([b.east + 1, b.latitude]), [
          b.east,
          b.latitude,
        ]);
        expect(policy.constrain([b.west - 1, b.latitude]), [
          b.west,
          b.latitude,
        ]);
        expect(policy.constrain([b.west, b.north]), [b.west, b.north]);
      },
    );
    testWidgets('card em landscape deixa a área enquadrada livre ao lado', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(800, 360));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final controller = CampusMapController();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: CampusMapControls(controller: controller)),
        ),
      );
      controller.selectContent(
        CampusEvent(
          id: '00000000-0000-0000-0000-000000000001',
          title: 'Evento na borda',
          start: DateTime(2026, 10, 18),
          end: DateTime(2026, 10, 19),
          status: CampusEventStatus.ongoing,
        ),
      );
      await tester.pumpAndSettle();
      final card = tester.getRect(find.byType(CampusContentCard));
      final padding = CampusCameraPolicy.routePadding(
        const Size(800, 360),
        bottom: 250,
        sideCard: true,
      );
      expect(card.width, lessThanOrEqualTo(360));
      expect(card.right, lessThan(padding.left));
      expect(800 - padding.left - padding.right, greaterThan(300));
      expect(360 - padding.top - padding.bottom, greaterThan(130));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    });
  });
}

class _Style implements StyleManager {
  final config = <String, Object?>{};
  int writes = 0;
  bool standard = true;
  bool fail = false;
  Completer<List<StyleObjectInfo?>>? imports;
  @override
  Future<List<StyleObjectInfo?>> getStyleImports() async =>
      imports?.future ??
      [if (standard) StyleObjectInfo(id: 'basemap', type: 'style')];
  @override
  Future<void> setStyleImportConfigProperty(
    String importId,
    String configName,
    Object value,
  ) async {
    if (fail) throw StateError('Style indisponível');
    expectSync(importId, 'basemap');
    config[configName] = value;
    writes++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
