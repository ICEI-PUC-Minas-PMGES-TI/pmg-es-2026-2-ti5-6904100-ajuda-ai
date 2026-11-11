import 'dart:convert';

import 'package:campus_map/campus_map.dart';
import 'package:http/http.dart' as http;

import 'api_config.dart';

/// Busca de lugares pela API pública do mapa (`GET /mapa/busca`,
/// `GET /mapa/predios/:id`). Sem login: são dados abertos do campus.
///
/// Erro de rede ou de servidor é lançado: o `campus_map` então usa o
/// snapshot local (`FallbackCampusPlaceRepository`). Os ids de prédio são as
/// chaves estáveis do campus (`P01_R4751608`), as mesmas do snapshot; área e
/// sala têm id UUID e vão para a rota pela coordenada (o `tipo` vira
/// [CampusPlace.kind]).
class MapaApiPlaceRepository implements CampusPlaceRepository {
  MapaApiPlaceRepository({
    http.Client? client,
    this.baseUrl = apiBaseUrl,
    this.timeout = const Duration(seconds: 3),
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  /// Curto: com a API fora do ar a busca local responde logo.
  final Duration timeout;

  static const _headers = {'accept': 'application/json'};

  @override
  Future<List<CampusPlace>> search(String query) async {
    if (query.trim().isEmpty) return const [];
    final uri = Uri.parse('$baseUrl/mapa/busca').replace(
      queryParameters: {
        'q': query,
        'limit': '${LocalCampusPlaceRepository.resultLimit}',
      },
    );
    final resposta = await executarRequisicao(
      () => _client.get(uri, headers: _headers),
      erroPadrao: 'Não foi possível buscar locais',
      timeout: timeout,
    );
    final corpo = decodificarJson(resposta);
    if (corpo is! List) throw const FormatException('Resposta inválida.');
    return List.unmodifiable([for (final item in corpo) ?_lugar(item)]);
  }

  @override
  Future<CampusPlace?> findById(String id) async {
    final uri = Uri.parse('$baseUrl/mapa/predios/${Uri.encodeComponent(id)}');
    try {
      final resposta = await executarRequisicao(
        () => _client.get(uri, headers: _headers),
        erroPadrao: 'Não foi possível carregar o local',
        timeout: timeout,
      );
      // `/mapa/predios/:id` só devolve prédios (sem campo `tipo`).
      return _lugar(
        decodificarJson(resposta),
        padrao: CampusPlaceKind.building,
      );
    } on ApiException catch (erro) {
      if (erro.statusCode == 404) return null;
      rethrow;
    }
  }

  static const _tipos = {
    'predio': CampusPlaceKind.building,
    'area': CampusPlaceKind.area,
    'sala': CampusPlaceKind.room,
  };

  /// Item fora do contrato é ignorado (não derruba a busca inteira). Tipo
  /// ausente ou desconhecido fica `null`: a rota decide pelo formato do id.
  static CampusPlace? _lugar(Object? item, {CampusPlaceKind? padrao}) {
    if (item is! Map) return null;
    final id = item['id'];
    final latitude = item['latitude'];
    final longitude = item['longitude'];
    if (id is! String || latitude is! num || longitude is! num) return null;
    try {
      return CampusPlace(
        id: id,
        name: item['nome'] as String?,
        code: item['codigo'] as String?,
        type: item['categoria'] as String?,
        kind: _tipos[item['tipo']] ?? padrao,
        heightMeters: item['altura'] is num
            ? (item['altura'] as num).toDouble()
            : null,
        description: item['descricao'] as String? ?? '',
        images: [
          for (final imagem
              in item['imagens'] is List ? item['imagens'] as List : const [])
            ?_imagem(imagem),
        ],
        center: [longitude.toDouble(), latitude.toDouble()],
      );
    } on Object {
      return null;
    }
  }

  static CampusPlaceImage? _imagem(Object? item) {
    if (item is! Map || item['id'] is! String) return null;
    final url = Uri.tryParse('${item['url'] ?? ''}');
    final original = Uri.tryParse(
      '${item['originalUrl'] ?? item['url'] ?? ''}',
    );
    if (url == null ||
        original == null ||
        !url.hasScheme ||
        !original.hasScheme) {
      return null;
    }
    return CampusPlaceImage(
      id: item['id'] as String,
      url: url,
      originalUrl: original,
    );
  }
}

/// Rota a pé pela API (`POST /mapa/rotas`). A origem vai só no corpo do
/// POST (nunca na URL) e não é guardada nem registrada pelo app.
///
/// Sem rota local: qualquer falha de rede/servidor vira
/// [CampusRouteFailure.unavailable] ("Não foi possível calcular a rota agora.").
class MapaApiRouteService implements CampusRouteService {
  MapaApiRouteService({
    http.Client? client,
    this.baseUrl = apiBaseUrl,
    this.timeout = const Duration(seconds: 8),
  }) : _client = client ?? http.Client();

  final http.Client _client;
  final String baseUrl;

  /// A primeira rota após subir a API também carrega o grafo.
  final Duration timeout;

  static const _falhas = {
    'origem-fora': CampusRouteFailure.outsideCampus,
    'mesmo-local': CampusRouteFailure.samePlace,
    'sem-caminho': CampusRouteFailure.noPath,
    'predio-sem-conexao': CampusRouteFailure.destinationUnavailable,
    'destino-fora': CampusRouteFailure.destinationOutside,
  };

  /// `destino` como o backend aceita: prédio por `id` ou coordenada.
  static Map<String, Object> destinoJson(CampusRouteTarget destino) =>
      switch (destino) {
        CampusRoutePlace(:final id) => {'id': id},
        CampusRouteCoordinate(:final latitude, :final longitude) => {
          'latitude': latitude,
          'longitude': longitude,
        },
      };

  @override
  Future<CampusRoute> route({
    required CampusUserLocation origin,
    required CampusRouteTarget destination,
    required bool accessible,
  }) async {
    final http.Response resposta;
    try {
      resposta = await _client
          .post(
            Uri.parse('$baseUrl/mapa/rotas'),
            headers: const {
              'accept': 'application/json',
              'content-type': 'application/json',
            },
            body: jsonEncode({
              'origem': {
                'latitude': origin.latitude,
                'longitude': origin.longitude,
              },
              'destino': destinoJson(destination),
              'acessivel': accessible,
            }),
          )
          .timeout(timeout);
    } catch (_) {
      throw const CampusRouteException(CampusRouteFailure.unavailable);
    }
    final status = resposta.statusCode;
    if (status == 404) {
      throw const CampusRouteException(
        CampusRouteFailure.destinationUnavailable,
      );
    }
    Object? corpo;
    try {
      corpo = decodificarJson(resposta);
    } catch (_) {
      corpo = null;
    }
    if (status == 422) {
      final motivo = corpo is Map ? corpo['motivo'] : null;
      throw CampusRouteException(
        _falhas[motivo] ?? CampusRouteFailure.unavailable,
      );
    }
    if (!responseOk(status)) {
      throw const CampusRouteException(CampusRouteFailure.unavailable);
    }
    final rota = _rota(corpo, destination.key);
    if (rota == null) {
      throw const CampusRouteException(CampusRouteFailure.unavailable);
    }
    return rota;
  }

  static CampusRoute? _rota(Object? corpo, String destino) {
    if (corpo is! Map) return null;
    final geometria = corpo['geometria'];
    final distancia = corpo['distanciaMetros'];
    final tempo = corpo['tempoSegundos'];
    if (geometria is! Map ||
        geometria['type'] != 'LineString' ||
        geometria['coordinates'] is! List ||
        distancia is! num ||
        tempo is! num) {
      return null;
    }
    try {
      return CampusRoute(
        destinationId: destino,
        coordinates: [
          for (final c in geometria['coordinates'] as List)
            [for (final v in c as List) (v as num).toDouble()],
        ],
        distanceMeters: distancia.toDouble(),
        durationSeconds: tempo.round(),
        accessible: corpo['acessivel'] == true,
      );
    } on Object {
      return null;
    }
  }
}
