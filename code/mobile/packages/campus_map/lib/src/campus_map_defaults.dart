import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';

abstract final class CampusMapDefaults {
  static const styleUri = MapboxStyles.STANDARD;

  // Câmera provisória até ler o snapshot; a abertura usa o centro mediano
  // dos prédios. O zoom inicial é independente do mínimo/fit do campus.
  static const latitude = -19.92298695;
  static const longitude = -43.9933884;
  static const zoom = 16.5;
  static const pitch = 0.0;
  static const bearing = 0.0;
  static const placeZoom = 18.0;
  static const userZoom = 17.5;
  static const userPitch3d = 35.0;
  static const cameraDurationMs = 900;

  /// Enquadramento da rota: zoom máximo (rota curta não "cola" no chão) e
  /// margens em pontos de tela para a busca e os atalhos Eventos/Onde comer
  /// (topo, medido pelos controles) e o card (rodapé).
  static const routeMaxZoom = 18.5;
  static const routePaddingTop = 204.0;
  static const routePaddingBottom = 230.0;
  static const routePaddingSide = 48.0;

  /// Altura máxima do card de evento/restaurante (fração da tela). A câmera
  /// reserva esse espaço no rodapé ao focar o local e ao enquadrar a rota,
  /// para o ponto e o fim da rota não ficarem sob o card.
  static const contentCardHeightFraction = 0.62;
  static const contentCardMargin = 24.0;

  /// Distância do card ao rodapé do mapa (mesmo `bottom` dos cards nos controles).
  static const contentCardBottom = 44.0;

  /// Área mínima do mapa que sobra acima do card ao reservar o rodapé.
  static const minVisibleMapHeight = 160.0;

  /// Bottom sheet do local (frações da altura do mapa). Aberto e expandido
  /// iguais ao `PlaceDetailSheet` do PUCMaps (45 % e 92 %); o recolhido
  /// (com rota na tela) deixa a linha visível sem fechar o card.
  static const placeSheetCollapsed = 0.25;
  static const placeSheetDefault = 0.45;
  static const placeSheetExpanded = 0.92;

  /// Inclinação inicial só com 3D ligado. O PUCMaps usava 65°; aqui é menor
  /// para facilitar a leitura dos prédios centrais na abertura.
  static const pitch3d = 45.0;
}
