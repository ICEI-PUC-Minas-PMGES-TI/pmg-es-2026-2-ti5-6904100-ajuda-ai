import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

import 'campus_place_category.dart';
import 'campus_place_category_style.dart';

/// Um ícone de marcador do mapa: id da imagem no style, cor e ícone Material.
class CampusMarkerIcon {
  const CampusMarkerIcon(this.id, this.icon, this.color);

  final String id;
  final IconData icon;
  final Color color;
}

/// Pinos do PUCMaps (`MapRenderer._renderPin`): círculo de 30 pontos lógicos
/// desenhado a 3×, anel branco de 2 px, disco na cor da categoria e o ícone
/// Material branco com 55 % do diâmetro. Gerados uma vez por style, sem
/// widgets por local.
abstract final class CampusMapIcons {
  static const pixelRatio = 3.0;
  static const logicalSize = 30.0;

  /// Portaria: mesmo ícone e azul do PUCMaps.
  static const gate = CampusMarkerIcon(
    'campus-poi-gate',
    Icons.door_front_door_outlined,
    Color(0xFF1D4ED8),
  );

  /// Alimentação (`PoiCategory.food` do PUCMaps).
  static const food = CampusMarkerIcon(
    'campus-poi-food',
    Icons.restaurant,
    Colors.orange,
  );

  /// Eventos da coordenação: roxo que o Ajuda-aí já usava nos pontos.
  static const event = CampusMarkerIcon(
    'campus-poi-event',
    Icons.event,
    Color(0xFF7C3AED),
  );

  /// Local salvo pelo usuário: laranja de "Salvar local" com o marcador.
  static const saved = CampusMarkerIcon(
    'campus-poi-saved',
    Icons.bookmark,
    Color(0xFFF57C00),
  );

  static CampusMarkerIcon category(CampusPlaceCategory category) =>
      CampusMarkerIcon(
        'campus-category-${category.name}',
        category.icon,
        category.markerColor,
      );

  static List<CampusMarkerIcon> get all => [
    gate,
    food,
    event,
    for (final value in CampusPlaceCategory.values) category(value),
  ];

  /// Tamanho pelo zoom, igual à camada `campus-symbol` do PUCMaps: pequeno
  /// na vista do campus, maior de perto.
  static const List<Object> iconSize = [
    'interpolate',
    ['linear'],
    ['zoom'],
    15,
    0.6,
    18,
    0.85,
    21,
    1.1,
  ];

  /// Layout comum dos marcadores (PUCMaps): centralizado, sempre visível e
  /// elevado sobre o 3D (`symbol-z-elevate`).
  static Map<String, Object> layout({Object image = const ['get', 'icon']}) => {
    'icon-image': image,
    'icon-size': iconSize,
    'icon-allow-overlap': true,
    'icon-anchor': 'center',
    'symbol-z-elevate': true,
  };

  /// Atrás de um prédio o pino fica translúcido; a luz do mapa não o apaga.
  static const Map<String, Object> paint = {
    'icon-occlusion-opacity': 0.6,
    'icon-emissive-strength': 1.0,
  };

  static Future<MbxImage> render(CampusMarkerIcon marker) async {
    const logical = logicalSize;
    final size = (logical * pixelRatio).round();
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)..scale(pixelRatio);
    const center = Offset(logical / 2, logical / 2);
    canvas.drawCircle(center, logical / 2 - 1, Paint()..color = Colors.white);
    canvas.drawCircle(center, logical / 2 - 3, Paint()..color = marker.color);
    final painter = TextPainter(
      textDirection: TextDirection.ltr,
      text: TextSpan(
        text: String.fromCharCode(marker.icon.codePoint),
        style: TextStyle(
          fontSize: logical * 0.55,
          fontFamily: marker.icon.fontFamily,
          package: marker.icon.fontPackage,
          color: Colors.white,
        ),
      ),
    )..layout();
    painter.paint(
      canvas,
      center - Offset(painter.width / 2, painter.height / 2),
    );
    painter.dispose();
    final picture = recorder.endRecording();
    final image = await picture.toImage(size, size);
    picture.dispose();
    // O plugin Android decodifica os bytes como bitmap comprimido (PNG),
    // antes de enviá-los como RGBA ao Mapbox nativo.
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return MbxImage(
      width: size,
      height: size,
      data: data!.buffer.asUint8List(),
    );
  }

  /// Registra no style só os ícones que ainda não existem nele.
  static Future<void> install(
    StyleManager style,
    Iterable<CampusMarkerIcon> icons, {
    required bool Function() isActive,
  }) async {
    for (final marker in icons) {
      if (!isActive()) return;
      final exists = await style.hasStyleImage(marker.id);
      if (!isActive() || exists) continue;
      final image = await render(marker);
      if (!isActive()) return;
      await style.addStyleImage(
        marker.id,
        pixelRatio,
        image,
        false,
        [],
        [],
        null,
      );
    }
  }
}
