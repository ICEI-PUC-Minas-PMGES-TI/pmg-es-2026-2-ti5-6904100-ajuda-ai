import 'package:campus_map/campus_map.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Eventos, restaurantes e cardápio do dia pela API pública do mapa
/// (`GET /mapa/eventos`, `GET /mapa/restaurantes`,
/// `GET /mapa/restaurantes/:id/cardapio`). Sem login: são dados abertos do
/// campus, cadastrados pela coordenação.
///
/// Item fora do contrato é ignorado (não derruba a lista). Erro de rede ou
/// de servidor nas listas é lançado: o mapa segue sem os pontos e a lista
/// mostra "Tentar novamente".
class MapaApiCampusContentService implements CampusContentService {
  MapaApiCampusContentService({
    http.Client? client,
    this.baseUrl = apiBaseUrl,
    this.timeout = const Duration(seconds: 8),
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;
  final Duration timeout;

  static const _headers = {'accept': 'application/json'};

  Future<List<Object?>> _lista(String caminho, String erroPadrao) async {
    final resposta = await executarRequisicao(
      () => _client.get(Uri.parse('$baseUrl$caminho'), headers: _headers),
      erroPadrao: erroPadrao,
      timeout: timeout,
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) throw const FormatException('Resposta inválida.');
    return corpo;
  }

  @override
  Future<List<CampusEvent>> events() async {
    final corpo = await _lista(
      '/mapa/eventos',
      'Não foi possível carregar os eventos',
    );
    return List.unmodifiable([for (final item in corpo) ?evento(item)]);
  }

  @override
  Future<List<CampusRestaurant>> restaurants() async {
    final corpo = await _lista(
      '/mapa/restaurantes',
      'Não foi possível carregar os restaurantes',
    );
    return List.unmodifiable([for (final item in corpo) ?restaurante(item)]);
  }

  /// Sem `data`: o servidor usa hoje no fuso do campus (Brasília).
  @override
  Future<CampusMenu?> menu(String restaurantId) async {
    final uri = Uri.parse(
      '$baseUrl/mapa/restaurantes/${Uri.encodeComponent(restaurantId)}/cardapio',
    );
    final Object? corpo;
    try {
      final resposta = await executarRequisicao(
        () => _client.get(uri, headers: _headers),
        erroPadrao: 'Não foi possível carregar o cardápio',
        timeout: timeout,
      );
      corpo = decodificarJson(resposta);
    } on ApiException catch (erro) {
      throw CampusContentException(
        erro.statusCode == 404
            ? CampusContentFailure.notFound
            : CampusContentFailure.offline,
      );
    } catch (_) {
      throw const CampusContentException(CampusContentFailure.offline);
    }
    if (corpo is! Map || !corpo.containsKey('cardapio')) {
      throw const CampusContentException(CampusContentFailure.offline);
    }
    final cardapio = corpo['cardapio'];
    if (cardapio == null) return null;
    final lido = _cardapio(cardapio);
    if (lido == null) {
      throw const CampusContentException(CampusContentFailure.offline);
    }
    return lido;
  }

  static const _situacoes = {
    'em-breve': CampusEventStatus.upcoming,
    'acontecendo': CampusEventStatus.ongoing,
    'encerrado': CampusEventStatus.ended,
  };

  static const _tiposLocal = {
    'predio': CampusContentLocationKind.building,
    'area': CampusContentLocationKind.area,
    'ponto': CampusContentLocationKind.point,
  };

  static String? _texto(Object? valor) =>
      valor is String && valor.trim().isNotEmpty ? valor : null;

  /// EventoDto → [CampusEvent]; `null` fora do contrato.
  static CampusEvent? evento(Object? item) {
    if (item is! Map) return null;
    final id = item['id'];
    final titulo = item['titulo'];
    final inicio = item['inicio'];
    final fim = item['fim'];
    final situacao = _situacoes[item['situacao']];
    if (id is! String ||
        titulo is! String ||
        inicio is! String ||
        fim is! String ||
        situacao == null) {
      return null;
    }
    final comeco = DateTime.tryParse(inicio);
    final termino = DateTime.tryParse(fim);
    if (comeco == null || termino == null) return null;
    try {
      return CampusEvent(
        id: id,
        title: titulo,
        description: _texto(item['descricao']),
        start: comeco,
        end: termino,
        status: situacao,
        location: local(item['local']),
      );
    } on ArgumentError {
      return null;
    }
  }

  /// RestauranteDto → [CampusRestaurant]; `null` fora do contrato. Faixa de
  /// horário inválida é ignorada sozinha.
  static CampusRestaurant? restaurante(Object? item) {
    if (item is! Map) return null;
    final id = item['id'];
    final nome = item['nome'];
    final aberto = item['abertoAgora'];
    final cardapioHoje = item['cardapioHoje'];
    if (id is! String || nome is! String || aberto is! bool) return null;
    final horarios = item['horarios'];
    try {
      return CampusRestaurant(
        id: id,
        title: nome,
        description: _texto(item['descricao']),
        location: local(item['local']),
        hours: [
          if (horarios is List)
            for (final faixa in horarios) ?_horario(faixa),
        ],
        openNow: aberto,
        menuToday: cardapioHoje == true,
      );
    } on ArgumentError {
      return null;
    }
  }

  static CampusOpeningHours? _horario(Object? faixa) {
    if (faixa is! Map) return null;
    final dia = faixa['dia'];
    final abre = faixa['abre'];
    final fecha = faixa['fecha'];
    if (dia is! int || abre is! String || fecha is! String) return null;
    try {
      return CampusOpeningHours(day: dia, opens: abre, closes: fecha);
    } on ArgumentError {
      return null;
    }
  }

  /// LocalDto → [CampusContentLocation]. Local fora do contrato vira `null`
  /// (o item continua, só sem marcador e sem rota).
  static CampusContentLocation? local(Object? valor) {
    if (valor is! Map) return null;
    final tipo = _tiposLocal[valor['tipo']];
    if (tipo == null) return null;
    final id = valor['id'];
    final latitude = valor['latitude'];
    final longitude = valor['longitude'];
    final temPosicao = latitude is num && longitude is num;
    try {
      return CampusContentLocation(
        kind: tipo,
        id: _texto(id),
        name: _texto(valor['nome']),
        center: temPosicao ? [longitude.toDouble(), latitude.toDouble()] : null,
        routeTarget: _rota(valor['rota']),
      );
    } on ArgumentError {
      // Posição fora de WGS84: mantém o nome, sem marcador nem rota.
      try {
        return CampusContentLocation(
          kind: tipo,
          id: _texto(id),
          name: _texto(valor['nome']),
        );
      } on ArgumentError {
        return null;
      }
    }
  }

  /// `{id}` (prédio) ou `{latitude, longitude}`; inválido → sem rota.
  static CampusRouteTarget? _rota(Object? rota) {
    if (rota is! Map) return null;
    try {
      final id = rota['id'];
      if (id is String) return CampusRouteTarget.place(id);
      final latitude = rota['latitude'];
      final longitude = rota['longitude'];
      if (latitude is num && longitude is num) {
        return CampusRouteTarget.coordinate(
          longitude: longitude.toDouble(),
          latitude: latitude.toDouble(),
        );
      }
    } on ArgumentError {
      return null;
    }
    return null;
  }

  static CampusMenu? _cardapio(Object? valor) {
    if (valor is! Map) return null;
    final url = valor['url'];
    final tipo = valor['tipoConteudo'];
    final de = valor['validoDe'];
    final ate = valor['validoAte'];
    final tamanho = valor['tamanhoBytes'];
    if (url is! String || tipo is! String || de is! String || ate is! String) {
      return null;
    }
    final endereco = Uri.tryParse(url);
    final inicio = _data(de);
    final fim = _data(ate);
    if (endereco == null || inicio == null || fim == null) return null;
    try {
      return CampusMenu(
        url: endereco,
        contentType: tipo,
        validFrom: inicio,
        validTo: fim,
        sizeBytes: tamanho is int ? tamanho : null,
      );
    } on ArgumentError {
      return null;
    }
  }

  /// `YYYY-MM-DD` (dia do campus, sem hora).
  static DateTime? _data(String valor) {
    final partes = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(valor);
    if (partes == null) return null;
    final ano = int.parse(partes[1]!);
    final mes = int.parse(partes[2]!);
    final dia = int.parse(partes[3]!);
    final data = DateTime(ano, mes, dia);
    if (data.month != mes || data.day != dia) return null;
    return data;
  }
}
