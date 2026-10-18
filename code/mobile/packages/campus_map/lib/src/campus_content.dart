import 'campus_route.dart';

/// Id estável gerado pelo Ajuda-aí (UUID minúsculo, como o PostgreSQL envia).
final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
);

/// Horário local `HH:mm` (00:00–23:59), como o backend valida.
final _hour = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

/// Como o local foi cadastrado pela coordenação.
enum CampusContentLocationKind { building, area, point }

/// Onde fica um evento/restaurante. Sem posição (prédio/área ausente do mapa
/// ativo): sem marcador e sem rota, mas o card continua com o nome.
class CampusContentLocation {
  CampusContentLocation({
    required this.kind,
    this.id,
    this.name,
    List<double>? center,
    CampusRouteTarget? routeTarget,
  }) : center = center == null ? null : List.unmodifiable(center),
       // Rota só com posição: sem ela não há para onde levar.
       routeTarget = center == null ? null : routeTarget {
    if ((id != null && id!.trim().isEmpty) ||
        (center != null &&
            (center.length != 2 ||
                center.any((v) => !v.isFinite) ||
                center[0].abs() > 180 ||
                center[1].abs() > 90))) {
      throw ArgumentError('Local inválido.');
    }
  }

  final CampusContentLocationKind kind;

  /// Chave do prédio (`P16`) ou UUID da área; `null` para ponto.
  final String? id;
  final String? name;

  /// WGS84, `[longitude, latitude]`; `null` sem posição no mapa ativo.
  final List<double>? center;

  /// Como traçar rota (prédio pelo id, área/ponto pela coordenada).
  final CampusRouteTarget? routeTarget;

  bool get hasPosition => center != null;
}

/// Item de conteúdo do campus mostrado no mapa (evento ou restaurante).
sealed class CampusContent {
  CampusContent({required this.id, required this.title, this.location}) {
    if (!_uuid.hasMatch(id) || title.trim().isEmpty) {
      throw ArgumentError('Conteúdo do campus inválido.');
    }
  }

  final String id;
  final String title;
  final CampusContentLocation? location;

  CampusContentKind get kind;
}

enum CampusContentKind { event, restaurant }

/// Situação calculada pelo servidor no momento da leitura.
enum CampusEventStatus { upcoming, ongoing, ended }

/// Evento ativo cadastrado pela coordenação (só os que não acabaram chegam).
class CampusEvent extends CampusContent {
  CampusEvent({
    required super.id,
    required super.title,
    this.description,
    required DateTime start,
    required DateTime end,
    required this.status,
    super.location,
  }) : start = start.toUtc(),
       end = end.toUtc() {
    if (end.isBefore(start)) throw ArgumentError('Evento inválido.');
  }

  final String? description;

  /// Instantes em UTC; a interface converte para o horário local.
  final DateTime start;
  final DateTime end;
  final CampusEventStatus status;

  @override
  CampusContentKind get kind => CampusContentKind.event;
}

/// Uma faixa de funcionamento: dia da semana (0 = domingo … 6 = sábado) e
/// horário local `HH:mm`. Não atravessa a meia-noite.
class CampusOpeningHours {
  CampusOpeningHours({
    required this.day,
    required this.opens,
    required this.closes,
  }) {
    if (day < 0 ||
        day > 6 ||
        !_hour.hasMatch(opens) ||
        !_hour.hasMatch(closes) ||
        closes.compareTo(opens) <= 0) {
      throw ArgumentError('Horário inválido.');
    }
  }

  final int day;
  final String opens;
  final String closes;
}

class CampusRestaurant extends CampusContent {
  CampusRestaurant({
    required super.id,
    required super.title,
    this.description,
    super.location,
    List<CampusOpeningHours> hours = const [],
    required this.openNow,
    required this.menuToday,
  }) : hours = List.unmodifiable(hours);

  String get name => title;
  final String? description;
  final List<CampusOpeningHours> hours;

  /// Calculados pelo servidor no fuso do campus.
  final bool openNow;
  final bool menuToday;

  /// Faixas de [weekday] no padrão do backend (0 = domingo), em ordem.
  List<CampusOpeningHours> hoursOn(int weekday) =>
      hours.where((h) => h.day == weekday).toList()
        ..sort((a, b) => a.opens.compareTo(b.opens));

  @override
  CampusContentKind get kind => CampusContentKind.restaurant;
}

/// Cardápio vigente publicado pela coordenação (imagem ou PDF público).
class CampusMenu {
  CampusMenu({
    required this.url,
    required this.contentType,
    required this.validFrom,
    required this.validTo,
    this.sizeBytes,
  }) {
    if (!url.isAbsolute ||
        !(url.isScheme('https') || url.isScheme('http')) ||
        url.host.isEmpty ||
        !supportedTypes.contains(contentType) ||
        validTo.isBefore(validFrom) ||
        (sizeBytes != null && sizeBytes! <= 0)) {
      throw ArgumentError('Cardápio inválido.');
    }
  }

  static const supportedTypes = {
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
  };

  final Uri url;
  final String contentType;

  /// Datas de vigência (dia, sem hora).
  final DateTime validFrom;
  final DateTime validTo;
  final int? sizeBytes;

  bool get isPdf => contentType == 'application/pdf';
  bool get isImage => !isPdf;
}

/// Por que o conteúdo pedido não veio.
enum CampusContentFailure {
  /// Rede/servidor fora do ar, tempo esgotado ou resposta inválida.
  offline,

  /// Restaurante desativado ou removido pela coordenação.
  notFound,
}

class CampusContentException implements Exception {
  const CampusContentException(this.failure);
  final CampusContentFailure failure;

  @override
  String toString() => 'CampusContentException(${failure.name})';
}

/// Eventos, restaurantes e cardápios fornecidos pelo app (ex.:
/// `/mapa/eventos`, `/mapa/restaurantes`). O pacote não faz HTTP.
abstract interface class CampusContentService {
  /// Eventos ativos que ainda não acabaram, por início. Vazio é normal.
  Future<List<CampusEvent>> events();

  /// Restaurantes ativos.
  Future<List<CampusRestaurant>> restaurants();

  /// Cardápio vigente hoje; `null` sem cardápio publicado. Lança
  /// [CampusContentException] (`notFound` para restaurante desativado).
  Future<CampusMenu?> menu(String restaurantId);
}
