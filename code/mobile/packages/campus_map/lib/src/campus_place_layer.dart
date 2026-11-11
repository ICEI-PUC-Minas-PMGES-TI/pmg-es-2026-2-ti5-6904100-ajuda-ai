import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_place_category.dart';
import 'campus_place_category_style.dart';
import 'campus_place_filter.dart';

/// Uma source e uma SymbolLayer para todos os prédios pedidos pelo usuário.
/// Quatro sprites locais, renderizados uma vez por style, sem widgets por local.
abstract final class CampusPlaceLayer {
  static const source = 'campus-map-category-places';
  static const symbols = 'campus-map-category-symbols';

  static String iconId(CampusPlaceCategory category) =>
      'campus-category-${category.name}';

  static Map<String, dynamic> geoJson(CampusPlaceFilter filter) => {
    'type': 'FeatureCollection',
    'features': [
      if (filter.category case final category?)
        for (final place in filter.places)
          {
            'type': 'Feature',
            'id': place.id,
            'geometry': {'type': 'Point', 'coordinates': place.center},
            'properties': {
              'id': place.id,
              'icon': iconId(category),
              'name': place.displayName,
            },
          },
    ],
  };

  static Map<String, dynamic> get layer => {
    'id': symbols,
    'type': 'symbol',
    'source': source,
    'slot': 'top',
    'layout': {
      'icon-image': ['get', 'icon'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-pitch-alignment': 'viewport',
    },
    'paint': {'icon-emissive-strength': 1.0},
  };

  static Future<MbxImage> _icon(CampusPlaceCategory category) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)..scale(2);
    const center = Offset(15, 15);
    canvas.drawCircle(center, 14, Paint()..color = Colors.white);
    canvas.drawCircle(center, 12, Paint()..color = category.markerColor);
    final icon = category.icon;
    final painter = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(icon.codePoint),
        style: TextStyle(
          fontFamily: icon.fontFamily,
          package: icon.fontPackage,
          fontSize: 16.5,
          color: Colors.white,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(
      canvas,
      center - Offset(painter.width / 2, painter.height / 2),
    );
    painter.dispose();
    final picture = recorder.endRecording();
    final image = await picture.toImage(60, 60);
    picture.dispose();
    // O plugin Android decodifica os bytes como bitmap comprimido (PNG),
    // antes de enviá-los como RGBA ao Mapbox nativo.
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return MbxImage(width: 60, height: 60, data: data!.buffer.asUint8List());
  }

  /// Chamadas serializadas pela view; cada await revalida o style e a seleção.
  static Future<void> show(
    StyleManager style,
    CampusPlaceFilter filter, {
    required bool Function() isActive,
  }) async {
    if (!isActive()) return;
    for (final category in CampusPlaceCategory.values) {
      final exists = await style.hasStyleImage(iconId(category));
      if (!isActive()) return;
      if (!exists) {
        final image = await _icon(category);
        if (!isActive()) return;
        await style.addStyleImage(
          iconId(category),
          2,
          image,
          false,
          [],
          [],
          null,
        );
      }
    }
    final exists = await style.styleSourceExists(source);
    if (!isActive()) return;
    final data = geoJson(filter);
    if (exists) {
      await style.setStyleSourceProperty(source, 'data', jsonEncode(data));
    } else {
      await style.addStyleSource(
        source,
        jsonEncode({'type': 'geojson', 'data': data}),
      );
    }
    if (!isActive()) return;
    final installed = await style.styleLayerExists(symbols);
    if (!isActive()) return;
    if (!installed) await style.addStyleLayer(jsonEncode(layer), null);
  }
}
