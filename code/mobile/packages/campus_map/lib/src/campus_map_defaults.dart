import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

abstract final class CampusMapDefaults {
  static const styleUri = MapboxStyles.STANDARD;

  // Centro do bbox dos 82 footprints reais do snapshot PUCMaps.
  // É um enquadramento das construções, não o limite administrativo do campus.
  static const latitude = -19.92252415;
  static const longitude = -43.9927295;
  static const zoom = 15.2;
  static const pitch = 0.0;
  static const bearing = 0.0;
  static const placeZoom = 18.0;
  static const userZoom = 17.5;
  static const userPitch3d = 35.0;
  static const cameraDurationMs = 900;

  /// Enquadramento da rota: zoom máximo (rota curta não "cola" no chão) e
  /// margens em pontos de tela para a busca e os atalhos Eventos/Onde comer
  /// (topo, ~126 pt) e o card (rodapé).
  static const routeMaxZoom = 18.5;
  static const routePaddingTop = 150.0;
  static const routePaddingBottom = 230.0;
  static const routePaddingSide = 48.0;

  /// Altura máxima do card de evento/restaurante (fração da tela). A câmera
  /// reserva esse espaço no rodapé ao focar o local e ao enquadrar a rota,
  /// para o ponto e o fim da rota não ficarem sob o card.
  static const contentCardHeightFraction = 0.5;
  static const contentCardMargin = 24.0;

  /// Distância do card ao rodapé do mapa (mesmo `bottom` dos cards nos controles).
  static const contentCardBottom = 44.0;

  /// Área mínima do mapa que sobra acima do card ao reservar o rodapé.
  static const minVisibleMapHeight = 160.0;

  /// Inclinação inicial só com 3D ligado. O PUCMaps usava 65°; aqui é menor
  /// para manter a leitura do campus inteiro na abertura.
  static const pitch3d = 45.0;
}
